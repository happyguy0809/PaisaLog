//! All database queries in one place.
//!
//! Rules:
//! - Every query returns a typed struct — no raw rows escape this module
//! - Fields that could not be parsed are Option<T> — never default values
//! - Amounts are always i64 paise — never f64
//! - Raw SMS body / email body are never selected — not stored anyway
//! - If a query can return 0 rows legitimately, it returns Option<T>
//!   If 0 rows is always an error, it returns AppError::NotFound

use chrono::{DateTime, NaiveDate, Utc};
use sqlx::PgPool;
use uuid::Uuid;
use crate::errors::AppResult;

// ── User ─────────────────────────────────────────────────────

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct UserRow {
    pub id:                           i32,
    pub email_hash:                   String,
    pub name:                         Option<String>,
    pub plan:                         String,
    pub sync_mode:                    String,
    pub jurisdiction:                 String,
    pub analytics_consent:            bool,
    pub marketing_consent:            bool,
    pub consent_recorded_at:          Option<DateTime<Utc>>,
    pub consent_version:              Option<String>,
    pub locale:                       String,
    pub timezone:                     String,
    pub home_currency:                Option<String>,
    pub income_visible_to_family:     Option<bool>,
    pub deleted_at:                   Option<DateTime<Utc>>,
    pub created_at:                   DateTime<Utc>,
}
pub async fn upsert_user(
    pool: &PgPool,
    email_hash: &str,
    jurisdiction: &str,
) -> AppResult<UserRow> {
    let row = sqlx::query_as!(
        UserRow,
        r#"
        INSERT INTO users (email_hash, jurisdiction)
        VALUES ($1, $2)
        ON CONFLICT (email_hash)
            DO UPDATE SET updated_at = NOW()
        RETURNING
            id, email_hash, name, plan, sync_mode, jurisdiction,
            analytics_consent, marketing_consent, consent_recorded_at,
            consent_version, locale, timezone,
            home_currency, income_visible_to_family,
            deleted_at, created_at
        "#,
        email_hash,
        jurisdiction,
    )
    .fetch_one(pool)
    .await?;

    Ok(row)
}

pub async fn get_user_by_id(pool: &PgPool, id: i32) -> AppResult<Option<UserRow>> {
    let row = sqlx::query_as!(
        UserRow,
        r#"
        SELECT id, email_hash, name, plan, sync_mode, jurisdiction,
               analytics_consent, marketing_consent, consent_recorded_at,
               consent_version, locale, timezone,
               home_currency, income_visible_to_family,
               deleted_at, created_at
        FROM users
        WHERE id = $1 AND deleted_at IS NULL
        "#,
        id,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn soft_delete_user(pool: &PgPool, id: i32) -> AppResult<()> {
    sqlx::query!("UPDATE users SET deleted_at = NOW() WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_user_consent(
    pool:                  &PgPool,
    user_id:               i32,
    analytics_consent:     bool,
    marketing_consent:     bool,
    consent_version:       &str,
    consent_ip_hash:       Option<&str>,
) -> AppResult<()> {
    sqlx::query!(
        r#"
        UPDATE users SET
            analytics_consent    = $2,
            marketing_consent    = $3,
            consent_recorded_at  = NOW(),
            consent_version      = $4,
            consent_ip_hash      = $5
        WHERE id = $1
        "#,
        user_id,
        analytics_consent,
        marketing_consent,
        consent_version,
        consent_ip_hash,
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Auth tokens ───────────────────────────────────────────────

pub async fn create_magic_token(
    pool:       &PgPool,
    user_id:    i32,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> AppResult<()> {
    sqlx::query!(
        r#"
        INSERT INTO auth_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
        user_id,
        token_hash,
        expires_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn consume_magic_token(
    pool:       &PgPool,
    token_hash: &str,
    user_id:    i32,
) -> AppResult<bool> {
    let result = sqlx::query!(
        r#"
        UPDATE auth_tokens
        SET used = TRUE
        WHERE token_hash = $1
          AND user_id    = $2
          AND used       = FALSE
          AND expires_at > NOW()
        "#,
        token_hash,
        user_id,
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected() == 1)
}

pub async fn create_refresh_token(
    pool:       &PgPool,
    user_id:    i32,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> AppResult<()> {
    sqlx::query!(
        r#"
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
        user_id, token_hash, expires_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn consume_refresh_token(
    pool:       &PgPool,
    token_hash: &str,
) -> AppResult<Option<i32>> {
    let row = sqlx::query!(
        r#"
        UPDATE refresh_tokens
        SET revoked = TRUE
        WHERE token_hash = $1
          AND revoked    = FALSE
          AND expires_at > NOW()
        RETURNING user_id
        "#,
        token_hash,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.user_id))
}

// ── Transactions ──────────────────────────────────────────────

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct TransactionRow {
    pub id:             i64,
    pub user_id:        i32,
    pub household_id:   Option<i32>,
    /// Always paise — divide by 100 for display. Never null.
    pub amount:   i32,
    pub txn_type:       String,
    /// None if merchant could not be reliably identified
    pub merchant:       Option<String>,
    /// None if category could not be assigned with confidence
    pub category:       Option<String>,
    /// User-added note only — never auto-populated
    pub note:           Option<String>,
    pub confidence:     i32,
    pub verified:       bool,
    pub sources:        String,
    /// Last 4 digits only — None if not present in source message
    pub acct_suffix:    Option<String>,
    pub txn_date:       NaiveDate,
    pub sync_state:     String,
    pub is_investment:       bool,
    pub is_subscription:     bool,
    pub is_cash:             bool,
    pub local_id:            Option<String>,
    pub created_at:          DateTime<Utc>,
    pub is_hidden:           bool,
    pub hidden_from_family:  bool,
    pub hidden_until:        Option<NaiveDate>,
    pub exclude_from_totals: bool,
    pub tz_offset:             String,
    pub metadata:              serde_json::Value,
    pub original_amount:       Option<i32>,
    pub original_currency:     Option<String>,
    pub fx_rate_at_entry:      Option<f64>,
}

pub struct InsertTransaction {
    pub user_id:        i32,
    pub household_id:   Option<i32>,
    pub amount:   i32,
    pub txn_type:       String,
    pub merchant:       Option<String>,
    pub category:       Option<String>,
    pub confidence:     i32,
    pub verified:       bool,
    pub sources:        String,
    pub fingerprint:    String,
    pub acct_suffix:    Option<String>,
    pub txn_date:       NaiveDate,
    pub is_investment:  bool,
    pub is_subscription:bool,
    pub is_cash:        bool,
    pub local_id:       Option<String>,
    pub tz_offset:          String,
    pub metadata:           serde_json::Value,
    pub original_amount:    Option<i32>,
    pub original_currency:  Option<String>,
    pub fx_rate_at_entry:   Option<f64>,
}

/// Insert a new transaction. Returns None if fingerprint already exists
/// (duplicate from same source). Returns Some(id) on success.
/// Callers should treat None as "already recorded" not as an error.
pub async fn insert_transaction(
    pool: &PgPool,
    t:    &InsertTransaction,
) -> AppResult<Option<i64>> {
    let row = sqlx::query!(
        r#"
        INSERT INTO transactions (
            user_id, household_id, amount, txn_type,
            merchant, category, confidence, verified, source, sources,
            fingerprint, acct_suffix, txn_date,
            is_investment, is_subscription, is_cash,
            local_id, tz_offset, original_amount, original_currency, fx_rate_at_entry, metadata, sync_state
        ) VALUES (
            $1, $2, $3::INT, $4,
            $5, $6, $7::SMALLINT, $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16,
            $17, $18, $19::INT, $20, $21::FLOAT8, $22, 'synced'
        )
        ON CONFLICT (user_id, fingerprint, txn_date) DO NOTHING
        RETURNING id
        "#,
        t.user_id, t.household_id, t.amount as i32, t.txn_type,
        t.merchant, t.category, t.confidence as i32, t.verified, t.sources.clone(), t.sources,
        t.fingerprint, t.acct_suffix, t.txn_date,
        t.is_investment, t.is_subscription, t.is_cash,
        t.local_id,
        t.tz_offset,
        t.original_amount,
        t.original_currency,
        t.fx_rate_at_entry as Option<f64>,
        t.metadata,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.id))
}

/// Merge a second source into an existing transaction.
/// Boosts confidence and sets verified=true when SMS+email agree.
pub async fn merge_transaction_source(
    pool:        &PgPool,
    user_id:     i32,
    fingerprint: &str,
    new_source:  &str,
) -> AppResult<Option<i64>> {
    let row = sqlx::query!(
        r#"
        UPDATE transactions
        SET
            sources    = CASE
                WHEN sources NOT LIKE '%' || $3 || '%'
                THEN sources || ',' || $3
                ELSE sources
            END,
            confidence = LEAST(100, confidence + 10),
            verified   = (
                sources LIKE '%sms%' AND sources LIKE '%email%'
                OR (sources || ',' || $3) LIKE '%sms%'
                AND (sources || ',' || $3) LIKE '%email%'
            )
        WHERE user_id    = $1
          AND fingerprint = $2
        RETURNING id
        "#,
        user_id,
        fingerprint,
        new_source,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.id))
}

pub async fn get_transactions(
    pool:           &PgPool,
    user_id:        i32,
    household_id:   Option<i32>,
    start_date:     NaiveDate,
    end_date:       NaiveDate,
    limit:          i64,
    include_hidden: bool,
) -> AppResult<Vec<TransactionRow>> {
    let rows = sqlx::query_as!(
        TransactionRow,
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
            metadata
        FROM transactions
        WHERE (user_id = $1 OR ($4::int IS NOT NULL AND household_id = $4))
          AND txn_date BETWEEN $2 AND $3
          AND deleted_at IS NULL
          AND ($6 OR NOT is_hidden)
        ORDER BY txn_date DESC, created_at DESC
        LIMIT $5
        "#,
        user_id,
        start_date,
        end_date,
        household_id,
        limit,
        include_hidden,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct TransactionSummary {
    pub debit_amount:  i64,
    pub credit_amount: i64,
    pub refund_amount: i64,
    pub txn_count:    i64,
}

pub async fn get_transaction_summary(
    pool:         &PgPool,
    user_id:      i32,
    household_id: Option<i32>,
    start_date:   NaiveDate,
    end_date:     NaiveDate,
) -> AppResult<TransactionSummary> {
    let row = sqlx::query_as!(
        TransactionSummary,
        r#"
        SELECT
            COALESCE(SUM(CASE WHEN txn_type='debit'  THEN amount END), 0) AS "debit_amount!",
            COALESCE(SUM(CASE WHEN txn_type='credit' THEN amount END), 0) AS "credit_amount!",
            COALESCE(SUM(CASE WHEN txn_type='refund' THEN amount END), 0) AS "refund_amount!",
            COUNT(*)                                                             AS "txn_count!"
        FROM transactions
        WHERE (user_id = $1 OR ($4::int IS NOT NULL AND household_id = $4))
          AND txn_date BETWEEN $2 AND $3
          AND deleted_at IS NULL
        "#,
        user_id, start_date, end_date, household_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(row)
}

#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct AppGroup {
    /// None means transactions from an unidentified merchant — shown
    /// as "Unknown" in UI, not lumped with real app names
    pub merchant:     Option<String>,
    pub txn_count:    i64,
    pub debit_amount:  i64,
    pub credit_amount: i64,
    pub refund_amount: i64,
    pub last_date:    NaiveDate,
}

pub async fn get_app_groups(
    pool:         &PgPool,
    user_id:      i32,
    household_id: Option<i32>,
    start_date:   NaiveDate,
    end_date:     NaiveDate,
) -> AppResult<Vec<AppGroup>> {
    let rows = sqlx::query_as!(
        AppGroup,
        r#"
        SELECT
            merchant,
            COUNT(*)::BIGINT                                                  AS "txn_count!",
            COALESCE(SUM(CASE WHEN txn_type='debit'  THEN amount END), 0) AS "debit_amount!",
            COALESCE(SUM(CASE WHEN txn_type='credit' THEN amount END), 0) AS "credit_amount!",
            COALESCE(SUM(CASE WHEN txn_type='refund' THEN amount END), 0) AS "refund_amount!",
            MAX(txn_date)                                                     AS "last_date!"
        FROM transactions
        WHERE (user_id = $1 OR ($4::int IS NOT NULL AND household_id = $4))
          AND txn_date BETWEEN $2 AND $3
          AND deleted_at IS NULL
          AND NOT (is_hidden AND exclude_from_totals)
        GROUP BY merchant
        ORDER BY "debit_amount!" DESC
        "#,
        user_id, start_date, end_date, household_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}


// ── Hidden transactions vault ─────────────────────────────────
pub async fn get_hidden_transactions(
    pool:    &PgPool,
    user_id: i32,
) -> AppResult<Vec<TransactionRow>> {
    let rows = sqlx::query_as!(
        TransactionRow,
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
            metadata
        FROM transactions
        WHERE user_id = $1
          AND deleted_at IS NULL
          AND (
            is_hidden = true
            OR hidden_from_family = true
            OR (hidden_until IS NOT NULL AND hidden_until >= CURRENT_DATE)
          )
        ORDER BY txn_date DESC, created_at DESC
        "#,
        user_id,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
// ── Signal log ────────────────────────────────────────────────

pub async fn insert_signal_log(
    pool:                &PgPool,
    user_id:             i32,
    source:              &str,
    sender_hash:         Option<&str>,
    fingerprint:         Option<&str>,
    confidence:          i16,
    classification:      &str,
    parsed_amount: Option<i64>,
    parsed_type:         Option<&str>,
    parsed_merchant:     Option<&str>,
    parsed_acct_suffix:  Option<&str>,
) -> AppResult<i64> {
    let row = sqlx::query!(
        r#"
        INSERT INTO raw_signal_log (
            user_id, source, sender_hash, fingerprint,
            confidence, classification,
            parsed_amount, parsed_type,
            parsed_merchant, parsed_acct_suffix
        ) VALUES ($1, $2, $3, $4, $5::INT, $6, $7, $8, $9, $10)
        RETURNING id
        "#,
        user_id, source, sender_hash, fingerprint,
        confidence as i16, classification,
        parsed_amount.map(|x| x as i32), parsed_type,
        parsed_merchant, parsed_acct_suffix,
    )
    .fetch_one(pool)
    .await?;

    Ok(row.id)
}

pub async fn count_user_transactions(pool: &PgPool, user_id: i32) -> AppResult<i64> {
    let row = sqlx::query!(
        "SELECT COUNT(*)::BIGINT AS count FROM transactions WHERE user_id = $1 AND deleted_at IS NULL",
        user_id
    )
    .fetch_one(pool)
    .await?;
    Ok(row.count.unwrap_or(0))
}
