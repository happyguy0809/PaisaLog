use axum::{extract::State, Json};
use serde::Serialize;
use chrono::NaiveDate;
use crate::{
    api::AppState,
    errors::AppResult,
    middleware::auth::AuthUser,
};

#[derive(Serialize, sqlx::FromRow)]
pub struct InvestmentSummary {
    pub total_invested_paise: i64,
    pub transaction_count:    i64,
    pub period_start:         NaiveDate,
    pub period_end:           NaiveDate,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct InvestmentByMerchant {
    pub merchant:          Option<String>,
    pub total_paise:       Option<i64>,
    pub transaction_count: Option<i64>,
    pub last_date:         Option<NaiveDate>,
}

#[derive(serde::Deserialize)]
pub struct InvestmentQuery {
    pub start: Option<String>,
    pub end:   Option<String>,
}

// GET /investments/summary
pub async fn summary(
    State(state): State<AppState>,
    auth:         AuthUser,
    axum::extract::Query(q): axum::extract::Query<InvestmentQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let start = q.start.as_deref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive() - chrono::Duration::days(365));
    let end = q.end.as_deref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive());

    let total: i64 = sqlx::query_scalar!(
        r#"
        SELECT COALESCE(SUM(amount), 0)::BIGINT
        FROM transactions
        WHERE user_id = $1
          AND is_investment = TRUE
          AND txn_type = 'debit'
          AND txn_date BETWEEN $2 AND $3
          AND deleted_at IS NULL
        "#,
        auth.user_id, start, end,
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);

    let count: i64 = sqlx::query_scalar!(
        r#"
        SELECT COUNT(*)::BIGINT
        FROM transactions
        WHERE user_id = $1
          AND is_investment = TRUE
          AND txn_type = 'debit'
          AND txn_date BETWEEN $2 AND $3
          AND deleted_at IS NULL
        "#,
        auth.user_id, start, end,
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);

    Ok(Json(serde_json::json!({
        "total_invested_paise": total,
        "transaction_count":   count,
        "period_start":        start.to_string(),
        "period_end":          end.to_string(),
    })))
}

// GET /investments/breakdown — per fund/merchant breakdown
pub async fn breakdown(
    State(state): State<AppState>,
    auth:         AuthUser,
    axum::extract::Query(q): axum::extract::Query<InvestmentQuery>,
) -> AppResult<Json<Vec<InvestmentByMerchant>>> {
    let start = q.start.as_deref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive() - chrono::Duration::days(365));
    let end = q.end.as_deref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive());

    let rows = sqlx::query_as!(
        InvestmentByMerchant,
        r#"
        SELECT
            merchant,
            SUM(amount)::BIGINT  AS total_paise,
            COUNT(*)::BIGINT           AS transaction_count,
            MAX(txn_date)              AS last_date
        FROM transactions
        WHERE user_id = $1
          AND is_investment = TRUE
          AND txn_type = 'debit'
          AND txn_date BETWEEN $2 AND $3
          AND deleted_at IS NULL
        GROUP BY merchant
        ORDER BY total_paise DESC
        "#,
        auth.user_id, start, end,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

// GET /investments/transactions — list all investment transactions
pub async fn list(
    State(state): State<AppState>,
    auth:         AuthUser,
    axum::extract::Query(q): axum::extract::Query<InvestmentQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let start = q.start.as_deref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive() - chrono::Duration::days(365));
    let end = q.end.as_deref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive());

    let rows = sqlx::query!(
        r#"
        SELECT id, amount, merchant, txn_date, acct_suffix, sources, note
        FROM transactions
        WHERE user_id = $1
          AND is_investment = TRUE
          AND txn_type = 'debit'
          AND txn_date BETWEEN $2 AND $3
          AND deleted_at IS NULL
        ORDER BY txn_date DESC
        "#,
        auth.user_id, start, end,
    )
    .fetch_all(&state.pool)
    .await?;

    let json: Vec<_> = rows.iter().map(|r| serde_json::json!({
        "id":          r.id,
        "amount": r.amount,
        "merchant":    r.merchant,
        "txn_date":     r.txn_date.to_string(),
        "acct_suffix":  r.acct_suffix,
        "sources":     r.sources,
        "note":        r.note,
    })).collect();

    Ok(Json(serde_json::json!({
        "transactions": json,
        "period_start":  start.to_string(),
        "period_end":    end.to_string(),
    })))
}
