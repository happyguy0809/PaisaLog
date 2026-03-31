use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::{
    api::AppState,
    errors::{AppError, AppResult},
    middleware::auth::AuthUser,
    services::ingest::{self, IngestInput, IngestOutcome},
    db::queries,
};

// ── Ingest one transaction (realtime — paid tier) ─────────────

#[derive(Debug, Deserialize)]
pub struct IngestOneRequest {
    pub amount:   i64,
    pub txn_type:       String,
    pub merchant:       Option<String>,
    pub acct_suffix:    Option<String>,
    pub confidence:     i16,
    pub source:         String,
    pub sender_hash:    Option<String>,
    pub txn_date:       String,
    pub epoch_seconds:  i64,
    pub local_id:       Option<String>,
    pub coupon_code:    Option<String>,
    pub expiry_date:    Option<String>,
    pub is_cash:        Option<bool>,
    pub is_investment:  Option<bool>,
    pub tz_offset:      Option<String>,
    pub original_amount:    Option<i32>,
    pub original_currency:  Option<String>,
    pub fx_rate_at_entry:   Option<f64>,
    pub metadata:           Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct IngestResponse {
    pub action:         &'static str,
    pub txn_id:         Option<i64>,
    pub signal_id:      Option<i64>,
    pub confidence_bump:Option<i16>,
}

pub async fn ingest_one(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<IngestOneRequest>,
) -> AppResult<Json<IngestResponse>> {

    // Validate source
    if !["sms", "email", "manual"].contains(&body.source.as_str()) {
        return Err(AppError::Validation("source must be sms, email, or manual".into()));
    }

    let input = IngestInput {
        user_id:      auth.user_id,
        household_id: None, // set by household service after creation
        body:         String::new(), // not available in this endpoint — device parses
        source:       body.source.clone(),
        sender:       None,
        local_id:     body.local_id,
        received_at:  chrono::Utc::now(),
    };

    // For the realtime endpoint the device has already parsed —
    // we receive structured fields and insert directly after
    // re-validating amount and type
    if body.amount <= 0 {
        return Err(AppError::Validation("amount must be positive".into()));
    }
    if !["debit","credit","refund"].contains(&body.txn_type.as_str()) {
        return Err(AppError::Validation("txn_type must be debit, credit, or refund".into()));
    }

    // Check free plan limit
    if auth.plan == "free" {
        let count = queries::count_user_transactions(&state.pool, auth.user_id).await?;
        if count >= state.cfg.free_plan_txn_limit {
            return Err(AppError::FreePlanLimitReached);
        }
    }

    let fingerprint = crate::services::fingerprint::generate(
        auth.user_id,
        body.amount,
        body.acct_suffix.as_deref(),
        body.epoch_seconds,
    );

    let txn_date = NaiveDate::parse_from_str(&body.txn_date, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("txn_date must be YYYY-MM-DD".into()))?;

    let insert = queries::InsertTransaction {
        user_id:        auth.user_id,
        household_id:   None,
        amount:   body.amount as i32,
        txn_type:       body.txn_type,
        merchant:       body.merchant,
        category:       None, // re-derived server-side in batch
        confidence:     body.confidence as i32,
        verified:       false,
        sources:        body.source,
        fingerprint,
        acct_suffix:    body.acct_suffix,
        txn_date,
        is_investment:  body.is_investment.unwrap_or(false),
        is_subscription:false,
        is_cash:        body.is_cash.unwrap_or(false),
        tz_offset:      body.tz_offset.unwrap_or_else(|| "+05:30".into()),
        original_amount:   body.original_amount,
        original_currency: body.original_currency.clone(),
        fx_rate_at_entry:  body.fx_rate_at_entry,
        metadata:          body.metadata.clone().unwrap_or(serde_json::json!({})),
        local_id:       input.local_id,
        raw_sms_body:   None,
        raw_email_body: None,
        payment_method: None,
        account_type:   None,
    };

    match queries::insert_transaction(&state.pool, &insert).await? {
        Some(id) => Ok(Json(IngestResponse {
            action:          "created",
            txn_id:          Some(id),
            signal_id:       None,
            confidence_bump: None,
        })),
        None => Ok(Json(IngestResponse {
            action:          "duplicate",
            txn_id:          None,
            signal_id:       None,
            confidence_bump: None,
        })),
    }
}

// ── Batch ingest (free tier daily sync) ───────────────────────

#[derive(Debug, Deserialize)]
pub struct BatchRequest {
    pub transactions: Vec<BatchItem>,
}

#[derive(Debug, Deserialize)]
pub struct BatchItem {
    pub local_id:       Option<String>,
    pub amount:   i64,
    pub txn_type:       String,
    pub merchant:       Option<String>,
    pub acct_suffix:    Option<String>,
    pub confidence:     i16,
    pub source:         String,
    pub txn_date:       String,
    pub epoch_seconds:  i64,
    pub is_investment:  Option<bool>,
    pub is_cash:        Option<bool>,
    pub tz_offset:      Option<String>,
    pub original_amount:    Option<i32>,
    pub original_currency:  Option<String>,
    pub fx_rate_at_entry:   Option<f64>,
    pub metadata:           Option<serde_json::Value>,
    pub raw_sms_body:   Option<String>,
    pub raw_email_body: Option<String>,
    pub payment_method: Option<String>,
    pub account_type:   Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BatchResponse {
    pub created:  usize,
    pub merged:   usize,
    pub skipped:  usize,
    pub errors:   Vec<String>,
}

pub async fn ingest_batch(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<BatchRequest>,
) -> AppResult<Json<BatchResponse>> {
    if body.transactions.len() > 500 {
        return Err(AppError::Validation("Batch size cannot exceed 500".into()));
    }

    let mut created = 0usize;
    let mut merged  = 0usize;
    let mut skipped = 0usize;
    let mut errors  = Vec::new();

    for item in &body.transactions {
        let Ok(txn_date) = NaiveDate::parse_from_str(&item.txn_date, "%Y-%m-%d") else {
            errors.push(format!("Invalid date for local_id {:?}", item.local_id));
            skipped += 1;
            continue;
        };

        let fingerprint = crate::services::fingerprint::generate(
            auth.user_id,
            item.amount,
            item.acct_suffix.as_deref(),
            item.epoch_seconds,
        );

        let category = item.merchant.as_deref()
            .map(crate::parser::category::normalise_merchant)
            .as_deref()
            .and_then(crate::parser::category::assign_category)
            .map(|s| s.to_string())
            .or_else(|| item.merchant.as_deref().and_then(|m| {
                // Raw bank strings — keyword fallback
                let ml = m.to_lowercase();
                if ml.contains("swiggy") || ml.contains("zomato") || ml.contains("zepto") || ml.contains("bigbasket") || ml.contains("blinkit") { return Some("food".to_string()); }
                if ml.contains("flipkart") || ml.contains("amazon") || ml.contains("meesho") || ml.contains("myntra") || ml.contains("nykaa") { return Some("shopping".to_string()); }
                if ml.contains("uber") || ml.contains("ola") || ml.contains("rapido") || ml.contains("irctc") || ml.contains("redbus") { return Some("transport".to_string()); }
                if ml.contains("airtel") || ml.contains("jio") || ml.contains("bsnl") || ml.contains("vodafone") || ml.contains("electricity") || ml.contains("bescom") || ml.contains("tneb") { return Some("bills".to_string()); }
                if ml.contains("netflix") || ml.contains("spotify") || ml.contains("hotstar") || ml.contains("prime") || ml.contains("youtube") { return Some("entertainment".to_string()); }
                if ml.contains("apollo") || ml.contains("pharmeasy") || ml.contains("1mg") || ml.contains("netmeds") || ml.contains("hospital") { return Some("health".to_string()); }
                if ml.contains("zerodha") || ml.contains("groww") || ml.contains("upstox") || ml.contains("mf") || ml.contains("mutual") || ml.contains("sip") { return Some("investment".to_string()); }
                if ml.contains("salary") || ml.contains("payroll") || ml.contains("neft cr") { return Some("income".to_string()); }
                if ml.contains("zpto") || ml.contains("zepto") { return Some("groceries".to_string()); }
                None
            }));
        let merchant_normalised = item.merchant.as_deref()
            .map(crate::parser::category::normalise_merchant);
        let insert = queries::InsertTransaction {
            user_id:        auth.user_id,
            household_id:   None,
            amount:   item.amount as i32,
            txn_type:       item.txn_type.clone(),
            merchant:       merchant_normalised.or(item.merchant.clone()),
            category,
            confidence:     item.confidence as i32,
            verified:       false,
            sources:        item.source.clone(),
            tz_offset:         item.tz_offset.clone().unwrap_or_else(|| "+05:30".into()),
            original_amount:   item.original_amount,
            original_currency: item.original_currency.clone(),
            fx_rate_at_entry:  item.fx_rate_at_entry,
            metadata:          item.metadata.clone().unwrap_or(serde_json::json!({})),
            fingerprint,
            acct_suffix:    item.acct_suffix.clone(),
            txn_date,
            is_investment:  item.is_investment.unwrap_or(false),
            is_subscription:false,
            is_cash:        item.is_cash.unwrap_or(false),
            local_id:       item.local_id.clone(),
            raw_sms_body:   item.raw_sms_body.clone(),
            raw_email_body: item.raw_email_body.clone(),
            payment_method: item.payment_method.clone(),
            account_type:   item.account_type.clone(),
        };

        match queries::insert_transaction(&state.pool, &insert).await {
            Ok(Some(_)) => created += 1,
            Ok(None)    => { skipped += 1; } // duplicate
            Err(e)      => {
                tracing::warn!(error = %e, "Batch item insert failed");
                errors.push(format!("Failed for local_id {:?}: {}", item.local_id, e));
                skipped += 1;
            }
        }
    }

    Ok(Json(BatchResponse { created, merged, skipped, errors }))
}

// ── List transactions ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub start:          String,
    pub end:            String,
    pub household_id:   Option<i32>,
    pub limit:          Option<i64>,
    pub include_hidden: Option<bool>,
}

pub async fn list(
    State(state): State<AppState>,
    auth:         AuthUser,
    Query(q):     Query<ListQuery>,
) -> AppResult<Json<Vec<queries::TransactionRow>>> {
    let start = NaiveDate::parse_from_str(&q.start, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid start date".into()))?;
    let end   = NaiveDate::parse_from_str(&q.end, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid end date".into()))?;

    let rows = queries::get_transactions(
        &state.pool,
        auth.user_id,
        q.household_id,
        start,
        end,
        q.limit.unwrap_or(500).min(1000),
        q.include_hidden.unwrap_or(false),
    ).await?;

    Ok(Json(rows))
}

// ── Summary ───────────────────────────────────────────────────

pub async fn summary(
    State(state): State<AppState>,
    auth:         AuthUser,
    Query(q):     Query<ListQuery>,
) -> AppResult<Json<queries::TransactionSummary>> {
    let start = NaiveDate::parse_from_str(&q.start, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid start date".into()))?;
    let end   = NaiveDate::parse_from_str(&q.end, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid end date".into()))?;

    let row = queries::get_transaction_summary(
        &state.pool,
        auth.user_id,
        q.household_id,
        start,
        end,
    ).await?;

    Ok(Json(row))
}

// ── App groups ────────────────────────────────────────────────

pub async fn apps(
    State(state): State<AppState>,
    auth:         AuthUser,
    Query(q):     Query<ListQuery>,
) -> AppResult<Json<Vec<queries::AppGroup>>> {
    let start = NaiveDate::parse_from_str(&q.start, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid start date".into()))?;
    let end   = NaiveDate::parse_from_str(&q.end, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid end date".into()))?;

    let rows = queries::get_app_groups(
        &state.pool, auth.user_id, q.household_id, start, end,
    ).await?;

    Ok(Json(rows))
}

// ── Raw signal log (debug) ────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LogQuery {
    pub classification: Option<String>,
    pub limit:          Option<i64>,
}

pub async fn raw_log(
    State(state): State<AppState>,
    auth:         AuthUser,
    Query(q):     Query<LogQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let limit = q.limit.unwrap_or(200).min(500);
    let class = q.classification.as_deref().unwrap_or("ALL");

    let class_filter: Option<&str> = if class == "ALL" { None } else { Some(class) };
    let rows = sqlx::query!(
        r#"SELECT id, source, sender_hash, confidence, classification,
                  parsed_amount, parsed_type, parsed_merchant,
                  parsed_acct_suffix, promoted, reviewed, received_at
           FROM raw_signal_log
           WHERE user_id = $1
             AND ($2::TEXT IS NULL OR classification = $2)
           ORDER BY received_at DESC LIMIT $3"#,
        auth.user_id, class_filter, limit
    ).fetch_all(&state.pool).await?;

    let json: Vec<_> = rows.iter().map(|r| serde_json::json!({
        "id":               r.id,
        "source":           r.source,
        "sender_hash":       r.sender_hash,
        "confidence":       r.confidence,
        "classification":   r.classification,
        "parsed_amount":r.parsed_amount,
        "parsed_type":       r.parsed_type,
        "parsed_merchant":   r.parsed_merchant,
        "parsed_acct_suffix": r.parsed_acct_suffix,
        "promoted":         r.promoted,
        "reviewed":         r.reviewed,
        "received_at":       r.received_at,
    })).collect();

    Ok(Json(serde_json::json!(json)))
}

// ── Add note to transaction ───────────────────────────────────

#[derive(Deserialize)]
pub struct NoteBody { pub note: String }

pub async fn add_note(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i64>,
    Json(body):   Json<NoteBody>,
) -> AppResult<Json<serde_json::Value>> {
    let note = body.note.chars().take(200).collect::<String>();
    sqlx::query!(
        "UPDATE transactions SET note = $1 WHERE id = $2 AND user_id = $3",
        note, id, auth.user_id
    ).execute(&state.pool).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Promote MEDIUM signal to transaction ──────────────────────

pub async fn promote(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(signal_id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    // Fetch the signal
    let signal = sqlx::query!(
        r#"SELECT * FROM raw_signal_log
           WHERE id = $1 AND user_id = $2 AND promoted = FALSE"#,
        signal_id, auth.user_id
    ).fetch_optional(&state.pool).await?
     .ok_or(AppError::NotFound)?;

    // Must have at least amount and type
    let amount = signal.parsed_amount.ok_or_else(||
        AppError::Validation("Signal has no amount — cannot promote".into()))?;
    let txn_type = signal.parsed_type.as_deref().ok_or_else(||
        AppError::Validation("Signal has no type — cannot promote".into()))?;

    let fingerprint = crate::services::fingerprint::generate(
        auth.user_id,
        amount as i64,
        signal.parsed_acct_suffix.as_deref(),
        signal.received_at.timestamp(),
    );

    let insert = queries::InsertTransaction {
        user_id:        auth.user_id,
        household_id:   None,
        amount:   amount,
        txn_type:       txn_type.to_string(),
        merchant:       signal.parsed_merchant.clone(),
        category:       signal.parsed_merchant.as_deref()
                            .and_then(crate::parser::category::assign_category)
                            .map(|s| s.to_string()),
        confidence:     signal.confidence,
        tz_offset:         "+05:30".to_string(),
        original_amount:   None,
        original_currency: None,
        fx_rate_at_entry:  None,
        metadata:          serde_json::json!({}),
        verified:       false,
        sources:        signal.source.clone(),
        fingerprint,
        acct_suffix:    signal.parsed_acct_suffix.clone(),
        txn_date:       signal.received_at.date_naive(),
        is_investment:  false,
        is_subscription:false,
        is_cash:        false,
        local_id:       None,
        raw_sms_body:   None,
        raw_email_body: None,
        payment_method: None,
        account_type:   None,
    };

    let txn_id = queries::insert_transaction(&state.pool, &insert).await?;

    sqlx::query!(
        "UPDATE raw_signal_log SET promoted = TRUE, reviewed = TRUE WHERE id = $1",
        signal_id
    ).execute(&state.pool).await?;

    Ok(Json(serde_json::json!({ "ok": true, "txn_id": txn_id })))
}

// ── Correct transaction (manual merchant/category/amount fix) ────
#[derive(Debug, serde::Deserialize)]
pub struct CorrectBody {
    pub merchant:  Option<String>,
    pub category:  Option<String>,
    pub amount:    Option<i32>,
    pub txn_type:  Option<String>,
    pub note:      Option<String>,
}

pub async fn correct(
    State(state): State<AppState>,
    Path(id):     Path<i64>,
    auth:         AuthUser,
    Json(body):   Json<CorrectBody>,
) -> AppResult<Json<serde_json::Value>> {
    // Validate txn_type if provided
    if let Some(ref t) = body.txn_type {
        if !["debit","credit","refund"].contains(&t.as_str()) {
            return Err(AppError::Validation("txn_type must be debit, credit, or refund".into()));
        }
    }
    if let Some(a) = body.amount {
        if a <= 0 { return Err(AppError::Validation("amount must be positive".into())); }
    }
    let result = sqlx::query!(
        r#"UPDATE transactions SET
            merchant  = COALESCE($3, merchant),
            category  = COALESCE($4, category),
            amount    = COALESCE($5, amount),
            txn_type  = COALESCE($6, txn_type),
            note      = COALESCE($7, note),
            verified  = true,
            metadata  = metadata || jsonb_build_object('manually_corrected', true, 'corrected_at', NOW()::text)
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        RETURNING id"#,
        id, auth.user_id,
        body.merchant,
        body.category,
        body.amount,
        body.txn_type,
        body.note,
    )
    .fetch_optional(&state.pool)
    .await?;
    match result {
        Some(_) => Ok(Json(serde_json::json!({ "ok": true, "id": id }))),
        None    => Err(AppError::NotFound),
    }
}

// ── Delete transaction ────────────────────────────────────────
pub async fn delete_transaction(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(txn_id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query!(
        r#"
        UPDATE transactions
        SET deleted_at = NOW()
        WHERE id = $1 AND user_id = $2
          AND deleted_at IS NULL
        RETURNING id
        "#,
        txn_id,
        auth.user_id,
    )
    .fetch_optional(&state.pool)
    .await?;

    match result {
        Some(_) => Ok(Json(serde_json::json!({ "ok": true, "id": txn_id }))),
        None    => Err(AppError::NotFound),
    }
}


// ── Visibility (hide/unhide) ──────────────────────────────────
#[derive(Debug, serde::Deserialize)]
pub struct VisibilityBody {
    pub is_hidden:           Option<bool>,
    pub hidden_from_family:  Option<bool>,
    pub hidden_until:        Option<String>,   // "YYYY-MM-DD" or null to clear
    pub exclude_from_totals: Option<bool>,
}

pub async fn set_visibility(
    State(state): State<AppState>,
    Path(id):     Path<i64>,
    auth:         AuthUser,
    Json(body):   Json<VisibilityBody>,
) -> AppResult<Json<serde_json::Value>> {
    // Verify ownership
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM transactions WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL)"
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    if !exists {
        return Err(AppError::NotFound);
    }

    let hidden_until: Option<NaiveDate> = match &body.hidden_until {
        Some(s) if s == "null" || s.is_empty() => None,
        Some(s) => Some(
            NaiveDate::parse_from_str(s, "%Y-%m-%d")
                .map_err(|_| AppError::Validation("Invalid hidden_until date".into()))?
        ),
        None => {
            // Keep existing value — fetch it
            sqlx::query_scalar::<_, Option<NaiveDate>>(
                "SELECT hidden_until FROM transactions WHERE id=$1"
            )
            .bind(id)
            .fetch_one(&state.pool)
            .await
            .map_err(|e| AppError::Internal(e.into()))?
        }
    };

    sqlx::query(
        r#"UPDATE transactions SET
            is_hidden           = COALESCE($2, is_hidden),
            hidden_from_family  = COALESCE($3, hidden_from_family),
            hidden_until        = $4,
            exclude_from_totals = COALESCE($5, exclude_from_totals)
        WHERE id = $1 AND user_id = $6"#
    )
    .bind(id)
    .bind(body.is_hidden)
    .bind(body.hidden_from_family)
    .bind(hidden_until)
    .bind(body.exclude_from_totals)
    .bind(auth.user_id)
    .execute(&state.pool)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(serde_json::json!({ "ok": true, "id": id })))
}

// ── Hidden vault list ─────────────────────────────────────────
pub async fn hidden_list(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<Vec<queries::TransactionRow>>> {
    let rows = queries::get_hidden_transactions(&state.pool, auth.user_id).await?;
    Ok(Json(rows))
}


// ── Deleted transactions list ─────────────────────────────────
pub async fn deleted_list(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<Vec<queries::TransactionRow>>> {
    let rows = sqlx::query_as!(
        queries::TransactionRow,
        r#"
        SELECT
            id, user_id, household_id,
            amount, txn_type, merchant, category, note,
            confidence, verified, sources, acct_suffix,
            txn_date, sync_state,
            is_investment, is_subscription, is_cash,
            local_id, created_at,
            is_hidden, hidden_from_family, hidden_until, exclude_from_totals,
            tz_offset, original_amount, original_currency, fx_rate_at_entry,
            metadata, raw_sms_body, raw_email_body, payment_method, account_type,
            COALESCE(is_transfer, false) as "is_transfer!", transfer_pair_id
        FROM transactions
        WHERE user_id = $1
          AND deleted_at IS NOT NULL
        ORDER BY deleted_at DESC
        LIMIT 200
        "#,
        auth.user_id,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

// ── Restore deleted transaction ───────────────────────────────
pub async fn restore(
    State(state): State<AppState>,
    Path(id):     Path<i64>,
    auth:         AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        "UPDATE transactions SET deleted_at = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL"
    )
    .bind(id)
    .bind(auth.user_id)
    .execute(&state.pool)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true, "id": id })))
}
