use axum::{extract::{State, Path}, Json};
use serde::{Deserialize, Serialize};
use chrono::NaiveDate;
use crate::{
    api::AppState,
    errors::{AppError, AppResult},
    middleware::auth::AuthUser,
};

#[derive(Deserialize)]
pub struct CreateCashSpend {
    pub withdrawal_txn_id: Option<i64>,
    pub amount:      i32,
    pub note:              Option<String>,
    pub category:          Option<String>,
    pub spent_date:        String,  // YYYY-MM-DD
}

#[derive(Serialize, sqlx::FromRow)]
pub struct CashSpendRow {
    pub id:                i32,
    pub withdrawal_txn_id: Option<i64>,
    pub amount:      i32,
    pub note:              Option<String>,
    pub category:          Option<String>,
    pub spent_date:        NaiveDate,
    pub created_at:        chrono::DateTime<chrono::Utc>,
}

// POST /cash — log a cash spend
pub async fn create(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<CreateCashSpend>,
) -> AppResult<Json<CashSpendRow>> {
    let spent_date = NaiveDate::parse_from_str(&body.spent_date, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("spent_date must be YYYY-MM-DD".into()))?;

    if body.amount <= 0 {
        return Err(AppError::Validation("amount must be positive".into()));
    }

    let row = sqlx::query_as!(
        CashSpendRow,
        r#"
        INSERT INTO cash_spends (user_id, withdrawal_txn_id, amount, note, category, spent_date)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, withdrawal_txn_id, amount, note, category, spent_date, created_at
        "#,
        auth.user_id,
        body.withdrawal_txn_id,
        body.amount,
        body.note,
        body.category,
        spent_date,
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(row))
}

// GET /cash?start=&end= — list cash spends
#[derive(Deserialize)]
pub struct CashQuery {
    pub start: Option<String>,
    pub end:   Option<String>,
}

pub async fn list(
    State(state): State<AppState>,
    auth:         AuthUser,
    axum::extract::Query(q): axum::extract::Query<CashQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let start = q.start.as_deref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive() - chrono::Duration::days(30));
    let end = q.end.as_deref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive());

    let spends = sqlx::query_as!(
        CashSpendRow,
        r#"
        SELECT id, withdrawal_txn_id, amount, note, category, spent_date, created_at
        FROM cash_spends
        WHERE user_id = $1 AND spent_date BETWEEN $2 AND $3
        ORDER BY spent_date DESC
        "#,
        auth.user_id, start, end,
    )
    .fetch_all(&state.pool)
    .await?;

    // Find ATM withdrawals in same period to show unaccounted gap
    let withdrawn: i64 = sqlx::query_scalar!(
        r#"
        SELECT COALESCE(SUM(amount), 0)::BIGINT
        FROM transactions
        WHERE user_id = $1
          AND txn_date BETWEEN $2 AND $3
          AND is_cash = TRUE
          AND txn_type = 'debit'
        "#,
        auth.user_id, start, end,
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);

    let logged: i64 = spends.iter().map(|s| s.amount as i64).sum();
    let unaccounted = (withdrawn - logged).max(0);

    Ok(Json(serde_json::json!({
        "spends":           spends,
        "total_withdrawn":   withdrawn,
        "total_logged":      logged,
        "unaccounted":      unaccounted,
    })))
}

// GET /cash/unaccounted — quick summary of unaccounted cash
pub async fn unaccounted(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let withdrawn: i64 = sqlx::query_scalar!(
        r#"
        SELECT COALESCE(SUM(amount), 0)::BIGINT
        FROM transactions
        WHERE user_id = $1
          AND is_cash = TRUE
          AND txn_type = 'debit'
          AND txn_date >= NOW() - INTERVAL '30 days'
        "#,
        auth.user_id,
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);

    let logged: i64 = sqlx::query_scalar!(
        r#"
        SELECT COALESCE(SUM(amount), 0)::BIGINT
        FROM cash_spends
        WHERE user_id = $1
          AND spent_date >= NOW() - INTERVAL '30 days'
        "#,
        auth.user_id,
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);

    Ok(Json(serde_json::json!({
        "withdrawn_paise":   withdrawn,
        "logged_paise":      logged,
        "unaccounted_paise": (withdrawn - logged).max(0),
    })))
}

// DELETE /cash/:id — delete a cash spend entry
pub async fn delete(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query!(
        "DELETE FROM cash_spends WHERE id = $1 AND user_id = $2",
        id, auth.user_id,
    )
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "deleted": true })))
}
