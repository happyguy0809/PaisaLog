//! Transaction ingest service.
//!
//! This is the most critical path in the system.
//! Every decision here affects what users see.
//!
//! Correctness rules:
//! 1. If OTP detected, reject immediately — nothing is stored
//! 2. If amount is None, store signal log only — no transaction row
//! 3. If type is None, store signal log only
//! 4. HIGH confidence → auto-promote to transactions
//! 5. MEDIUM confidence → signal log only, surfaced for user review
//! 6. LOW / UNCLASSIFIED → signal log only, not surfaced unless user looks
//! 7. Duplicate fingerprint → merge sources, no new row, not an error

use chrono::NaiveDate;
use sqlx::PgPool;

use crate::{
    config::Config,
    db::queries::{
        self, InsertTransaction,
        insert_signal_log, insert_transaction, merge_transaction_source,
        count_user_transactions,
    },
    errors::{AppError, AppResult},
    parser::{self, Classification, ParserError},
    services::fingerprint,
};

#[derive(Debug)]
pub struct IngestInput {
    pub user_id:       i32,
    pub household_id:  Option<i32>,
    pub body:          String,   // raw message — NOT stored
    pub source:        String,   // "sms" | "email" | "manual"
    pub sender:        Option<String>, // raw sender ID — NOT stored, only hashed
    pub local_id:      Option<String>, // device UUID for idempotency
    pub received_at:   chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, PartialEq)]
pub enum IngestOutcome {
    /// New transaction created
    Created { txn_id: i64 },
    /// Existing transaction updated (second source confirmed it)
    Merged { txn_id: i64, confidence_bump: i16 },
    /// Stored in signal log for review — not auto-promoted
    PendingReview { signal_id: i64 },
    /// Not enough signal — stored in log only, low priority
    LowSignal { signal_id: i64 },
    /// Duplicate: already recorded this exact transaction
    Duplicate,
}

pub async fn ingest(
    pool:  &PgPool,
    cfg:   &Config,
    input: IngestInput,
) -> AppResult<IngestOutcome> {

    // ── Step 1: Parse (may reject OTPs/alerts) ────────────────
    let result = match parser::parse(&input.body, &input.source) {
        Ok(r) => r,
        Err(ParserError::SensitiveMessage) => {
            // OTP — log nothing, return immediately
            tracing::debug!(user_id = input.user_id, "OTP message discarded");
            return Ok(IngestOutcome::Duplicate); // treat as no-op
        }
        Err(ParserError::NonTransactional) => {
            tracing::debug!(user_id = input.user_id, "Non-transactional alert skipped");
            return Ok(IngestOutcome::Duplicate);
        }
    };

    // ── Step 2: Plan limit check (free tier) ──────────────────
    if result.classification == Classification::High {
        let user = queries::get_user_by_id(pool, input.user_id)
            .await?
            .ok_or(AppError::NotFound)?;

        if user.plan == "free" {
            let count = count_user_transactions(pool, input.user_id).await?;
            if count >= cfg.free_plan_txn_limit {
                // Still log signal so user knows what was missed
                let signal_id = log_signal(pool, &input, &result, None).await?;
                return Ok(IngestOutcome::LowSignal { signal_id });
            }
        }
    }

    // ── Step 3: Only proceed if we have minimum viable data ───
    // Amount AND type must both be present to create a transaction.
    // Everything else (merchant, category, acct_suffix) is optional.
    if result.amount.is_none() || result.txn_type.is_none() {
        let signal_id = log_signal(pool, &input, &result, None).await?;
        return match result.classification {
            Classification::Medium => Ok(IngestOutcome::PendingReview { signal_id }),
            _                      => Ok(IngestOutcome::LowSignal { signal_id }),
        };
    }

    let amount = result.amount.unwrap();
    let txn_type     = result.txn_type.as_ref().unwrap().as_str().to_string();

    // ── Step 4: Generate fingerprint for dedup ─────────────────
    let fingerprint = fingerprint::generate(
        input.user_id,
        amount as i64,
        result.acct_suffix.as_deref(),
        result.epoch_seconds,
    );
    let sender_hash = input.sender.as_deref().map(fingerprint::hash_sender);

    // ── Step 5: MEDIUM confidence → signal log only ───────────
    if result.classification == Classification::Medium {
        let signal_id = log_signal(pool, &input, &result, Some(&fingerprint)).await?;
        return Ok(IngestOutcome::PendingReview { signal_id });
    }

    // ── Step 6: LOW / UNCLASSIFIED → signal log only ──────────
    if result.classification != Classification::High {
        let signal_id = log_signal(pool, &input, &result, Some(&fingerprint)).await?;
        return Ok(IngestOutcome::LowSignal { signal_id });
    }

    // ── Step 7: HIGH — check for existing transaction to merge ─
    if let Some(existing_id) = merge_transaction_source(
        pool,
        input.user_id,
        &fingerprint,
        &input.source,
    ).await? {
        log_signal(pool, &input, &result, Some(&fingerprint)).await?;
        return Ok(IngestOutcome::Merged {
            txn_id:          existing_id,
            confidence_bump: 10,
        });
    }

    // ── Step 8: Insert new transaction ────────────────────────
    let txn_date = input.received_at.date_naive();

    let insert = InsertTransaction {
        user_id:        input.user_id,
        household_id:   input.household_id,
        amount: amount as i32,
        txn_type,
        merchant:       result.merchant.clone(),
        category:       result.category.clone().map(|s| s.to_string()),
        confidence:     result.score as i32,
        verified:       false,
        sources:        input.source.clone(),
        fingerprint:    fingerprint.clone(),
        acct_suffix:    result.acct_suffix.clone(),
        txn_date,
        is_investment:  result.is_investment,
        is_subscription:result.is_subscription,
        is_cash:        result.is_cash,
        tz_offset:      "+05:30".to_string(),
        original_amount:   None,
        original_currency: None,
        fx_rate_at_entry:  None,
        metadata:          serde_json::json!({}),
        local_id:       input.local_id.clone(),
        raw_sms_body:   None,
        raw_email_body: None,
        payment_method: None,
        account_type:   None,
    };

    match insert_transaction(pool, &insert).await? {
        Some(txn_id) => {
            log_signal(pool, &input, &result, Some(&fingerprint)).await?;

            // Auto-create refund record if type=refund
            if insert.txn_type == "refund" {
                crate::services::refunds::create_from_transaction(
                    pool,
                    input.user_id,
                    txn_id,
                    result.merchant.as_deref().unwrap_or("Unknown"),
                    amount as i64,
                    result.is_coupon_refund,
                    result.coupon_code.as_deref(),
                    result.expiry_date.as_deref().and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()),
                    txn_date,
                ).await?;
            }

            Ok(IngestOutcome::Created { txn_id })
        }
        None => {
            // Fingerprint conflict — already in DB, treat as duplicate
            Ok(IngestOutcome::Duplicate)
        }
    }
}

/// Log to raw_signal_log. Body is NEVER logged — only parsed fields.
async fn log_signal(
    pool:        &PgPool,
    input:       &IngestInput,
    result:      &parser::ParseResult,
    fingerprint: Option<&str>,
) -> AppResult<i64> {
    let sender_hash = input.sender.as_deref().map(fingerprint::hash_sender);
    let classification = format!("{:?}", result.classification).to_uppercase();

    let id = insert_signal_log(
        pool,
        input.user_id,
        &input.source,
        sender_hash.as_deref(),
        fingerprint,
        result.score,
        &classification,
        result.amount,
        result.txn_type.as_ref().map(|t| t.as_str()),
        result.merchant.as_deref(),
        result.acct_suffix.as_deref(),
    ).await?;

    Ok(id)
}

/// Batch ingest — for free-tier daily sync from device.
/// Returns per-event outcomes. Never fails the whole batch on one error.
pub async fn batch_ingest(
    pool:   &PgPool,
    cfg:    &Config,
    inputs: Vec<IngestInput>,
) -> Vec<(Option<String>, AppResult<IngestOutcome>)> {
    let mut results = Vec::with_capacity(inputs.len());

    for input in inputs {
        let local_id = input.local_id.clone();
        let outcome  = ingest(pool, cfg, input).await;
        results.push((local_id, outcome));
    }

    results
}
