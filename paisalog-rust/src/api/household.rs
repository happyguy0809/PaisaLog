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
    services::crypto,
};

// ── Create household ──────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateRequest {
    pub name: String,
}

#[derive(Serialize)]
pub struct CreateResponse {
    pub id:          i32,
    pub invite_code: String,
}

pub async fn create(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<CreateRequest>,
) -> AppResult<Json<CreateResponse>> {
    if state.cfg.is_production() && auth.plan != "family" {
        return Err(AppError::FamilyPlanRequired);
    }
    if body.name.trim().is_empty() {
        return Err(AppError::Validation("Household name required".into()));
    }

    let invite_code  = crypto::generate_invite_code();
    let invite_expiry = chrono::Utc::now() + chrono::Duration::days(7);

    let row = sqlx::query!(
        r#"
        INSERT INTO households (name, owner_id, created_by, invite_code, invite_expires_at)
        VALUES ($1, $2, $2, $3, $4)
        RETURNING id
        "#,
        body.name.trim(),
        auth.user_id,
        invite_code,
        invite_expiry,
    )
    .fetch_one(&state.pool)
    .await?;

    // Add owner as admin member
    sqlx::query!(
        "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'admin')",
        row.id, auth.user_id,
    )
    .execute(&state.pool)
    .await?;

    // Link all existing transactions to this household
    sqlx::query!(
        "UPDATE transactions SET household_id = $1 WHERE user_id = $2 AND household_id IS NULL",
        row.id, auth.user_id,
    )
    .execute(&state.pool)
    .await?;

    Ok(Json(CreateResponse { id: row.id, invite_code }))
}

// ── Join household ────────────────────────────────────────────

#[derive(Deserialize)]
pub struct JoinRequest {
    pub invite_code: String,
}

pub async fn join(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<JoinRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if state.cfg.is_production() && auth.plan != "family" {
        return Err(AppError::FamilyPlanRequired);
    }

    let household = sqlx::query!(
        r#"SELECT id, name FROM households
           WHERE invite_code = $1 AND invite_expires_at > NOW()"#,
        &body.invite_code.to_uppercase(),
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::InvalidInviteCode)?;

    // Check member count
    let count = sqlx::query!(
        "SELECT COUNT(*)::BIGINT AS c FROM household_members WHERE household_id = $1",
        household.id
    )
    .fetch_one(&state.pool)
    .await?
    .c
    .unwrap_or(0);

    if count >= state.cfg.family_plan_max_members {
        return Err(AppError::HouseholdFull);
    }

    // Check not already a member
    let existing = sqlx::query!(
        "SELECT 1 AS one FROM household_members WHERE household_id = $1 AND user_id = $2",
        household.id, auth.user_id
    )
    .fetch_optional(&state.pool)
    .await?;

    if existing.is_some() {
        return Err(AppError::AlreadyMember);
    }

    sqlx::query!(
        "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'member')",
        household.id, auth.user_id,
    )
    .execute(&state.pool)
    .await?;

    // Link transactions
    sqlx::query!(
        "UPDATE transactions SET household_id = $1 WHERE user_id = $2 AND household_id IS NULL",
        household.id, auth.user_id,
    )
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({
        "household_id": household.id,
        "name": household.name,
    })))
}

// ── Get members ───────────────────────────────────────────────

pub async fn members(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    let rows = sqlx::query!(
        r#"
        SELECT
            u.id, u.name, hm.role, hm.joined_at,
            COALESCE(SUM(
                CASE WHEN t.txn_type = 'debit'
                     AND t.txn_date >= DATE_TRUNC('month', CURRENT_DATE)::DATE
                THEN t.amount ELSE 0 END
            ), 0) AS month_debit_amount
        FROM household_members hm
        JOIN users u ON u.id = hm.user_id
        LEFT JOIN transactions t
            ON t.user_id = hm.user_id
            AND t.household_id = $1
            AND t.deleted_at IS NULL
        WHERE hm.household_id = $1
          AND EXISTS (
              SELECT 1 FROM household_members
              WHERE household_id = $1 AND user_id = $2
          )
        GROUP BY u.id, u.name, hm.role, hm.joined_at
        ORDER BY hm.joined_at ASC
        "#,
        id, auth.user_id,
    )
    .fetch_all(&state.pool)
    .await?;

    let json: Vec<_> = rows.iter().map(|r| serde_json::json!({
        "id":              r.id,
        "name":            r.name,
        "role":            r.role,
        "joined_at":        r.joined_at,
        "month_debit_amount": r.month_debit_amount,
    })).collect();

    Ok(Json(serde_json::json!(json)))
}

// ── Household summary ─────────────────────────────────────────

#[derive(Deserialize)]
pub struct SummaryQuery {
    pub start: String,
    pub end:   String,
}

pub async fn summary(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
    Query(q):     Query<SummaryQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let start = NaiveDate::parse_from_str(&q.start, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid start date".into()))?;
    let end   = NaiveDate::parse_from_str(&q.end,   "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid end date".into()))?;

    // Verify membership
    let is_member = sqlx::query!(
        "SELECT 1 AS one FROM household_members WHERE household_id = $1 AND user_id = $2",
        id, auth.user_id
    )
    .fetch_optional(&state.pool)
    .await?
    .is_some();

    if !is_member {
        return Err(AppError::Unauthorised);
    }

    let total = sqlx::query!(
        r#"
        SELECT
            COALESCE(SUM(CASE WHEN txn_type='debit'  THEN amount END), 0) AS debit_amount,
            COALESCE(SUM(CASE WHEN txn_type='credit' THEN amount END), 0) AS credit_amount,
            COALESCE(SUM(CASE WHEN txn_type='refund' THEN amount END), 0) AS refund_amount,
            COUNT(*)::BIGINT AS txn_count,
            COUNT(DISTINCT user_id)::BIGINT AS active_members
        FROM transactions
        WHERE household_id = $1
          AND txn_date BETWEEN $2 AND $3
          AND deleted_at IS NULL
        "#,
        id, start, end,
    )
    .fetch_one(&state.pool)
    .await?;

    let members = sqlx::query!(
        r#"
        SELECT
            u.id AS user_id, u.name,
            COALESCE(SUM(CASE WHEN t.txn_type='debit'  THEN t.amount END), 0) AS debit_amount,
            COALESCE(SUM(CASE WHEN t.txn_type='credit' THEN t.amount END), 0) AS credit_amount,
            COUNT(t.id)::BIGINT AS txn_count
        FROM household_members hm
        JOIN users u ON u.id = hm.user_id
        LEFT JOIN transactions t
            ON t.user_id = hm.user_id
            AND t.household_id = $1
            AND t.txn_date BETWEEN $2 AND $3
            AND t.deleted_at IS NULL
        WHERE hm.household_id = $1
        GROUP BY u.id, u.name
        ORDER BY debit_amount DESC
        "#,
        id, start, end,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({
        "summary": {
            "debit_amount":     total.debit_amount,
            "credit_amount":    total.credit_amount,
            "refund_amount":    total.refund_amount,
            "txn_count":       total.txn_count,
            "active_members":  total.active_members,
        },
        "members": members.iter().map(|m| serde_json::json!({
            "user_id":    m.user_id,
            "name":      m.name,
            "debit_amount":  m.debit_amount,
            "credit_amount": m.credit_amount,
            "txn_count":    m.txn_count,
        })).collect::<Vec<_>>(),
    })))
}

// ── Add expense split ─────────────────────────────────────────

#[derive(Deserialize)]
pub struct SplitRequest {
    pub txn_id: i64,
    pub splits: Vec<SplitEntry>,
    pub note:   Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct SplitEntry {
    pub user_id:      i32,
    pub amount: i64,
}

pub async fn add_split(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
    Json(body):   Json<SplitRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if state.cfg.is_production() && auth.plan != "family" {
        return Err(AppError::FamilyPlanRequired);
    }

    // Validate total doesn't exceed transaction amount
    let txn = sqlx::query!(
        "SELECT amount FROM transactions WHERE id = $1 AND household_id = $2",
        body.txn_id, id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let split_total: i64 = body.splits.iter().map(|s| s.amount).sum();
    if split_total > txn.amount as i64 {
        return Err(AppError::Validation("Split total exceeds transaction amount".into()));
    }

    let splits_json = serde_json::to_value(&body.splits)
        .map_err(|e| AppError::Internal(e.into()))?;

    let row = sqlx::query!(
        r#"
        INSERT INTO expense_splits (txn_id, household_id, payer_user_id, splits, note)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        "#,
        body.txn_id, id, auth.user_id, splits_json, body.note,
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "split_id": row.id })))
}

// ── Unsettled splits ──────────────────────────────────────────

pub async fn unsettled_splits(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    let rows = sqlx::query!(
        r#"
        SELECT
            es.id, es.txn_id, es.payer_user_id,
            u.name AS payer_name,
            es.splits, es.note,
            t.amount, t.merchant, t.txn_date,
            es.created_at
        FROM expense_splits es
        JOIN users u ON u.id = es.payer_user_id
        JOIN transactions t ON t.id = es.txn_id
        WHERE es.household_id = $1
          AND es.settled = FALSE
          AND EXISTS (
              SELECT 1 FROM household_members
              WHERE household_id = $1 AND user_id = $2
          )
        ORDER BY es.created_at DESC
        "#,
        id, auth.user_id,
    )
    .fetch_all(&state.pool)
    .await?;

    let json: Vec<_> = rows.iter().map(|r| serde_json::json!({
        "id":           r.id,
        "txn_id":        r.txn_id,
        "payer_user_id":  r.payer_user_id,
        "payer_name":    r.payer_name,
        "splits":       r.splits,
        "note":         r.note,
        "total_paise":   r.amount,
        "merchant":     r.merchant,
        "txn_date":      r.txn_date,
        "created_at":    r.created_at,
    })).collect();

    Ok(Json(serde_json::json!(json)))
}

// ── Regenerate invite code ────────────────────────────────────

pub async fn regenerate_invite(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    // Verify admin role
    let role = sqlx::query!(
        "SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2",
        id, auth.user_id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorised)?;

    if role.role != "admin" {
        return Err(AppError::Unauthorised);
    }

    let new_code   = crypto::generate_invite_code();
    let new_expiry = chrono::Utc::now() + chrono::Duration::days(7);

    sqlx::query!(
        "UPDATE households SET invite_code = $1, invite_expires_at = $2 WHERE id = $3",
        new_code, new_expiry, id,
    )
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "invite_code": new_code })))
}

// ── Leave household ───────────────────────────────────────────
pub async fn leave(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    // Check membership
    let member = sqlx::query!(
        "SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2",
        id, auth.user_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    // If admin leaving, transfer to next member or dissolve
    if member.role == "admin" {
        let next = sqlx::query!(
            r#"SELECT user_id FROM household_members
               WHERE household_id = $1 AND user_id != $2
               ORDER BY joined_at ASC LIMIT 1"#,
            id, auth.user_id
        )
        .fetch_optional(&state.pool)
        .await?;

        if let Some(next_member) = next {
            // Transfer ownership
            sqlx::query!(
                "UPDATE household_members SET role = 'admin' WHERE household_id = $1 AND user_id = $2",
                id, next_member.user_id
            )
            .execute(&state.pool)
            .await?;
            sqlx::query!(
                "UPDATE households SET owner_id = $1 WHERE id = $2",
                next_member.user_id, id
            )
            .execute(&state.pool)
            .await?;
        }
    }

    // Remove member
    sqlx::query!(
        "DELETE FROM household_members WHERE household_id = $1 AND user_id = $2",
        id, auth.user_id
    )
    .execute(&state.pool)
    .await?;

    // Unlink their transactions from this household
    sqlx::query!(
        "UPDATE transactions SET household_id = NULL WHERE user_id = $1 AND household_id = $2",
        auth.user_id, id
    )
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true, "left_household": id })))
}

// ── Get all households for current user ───────────────────────
pub async fn my_households(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let rows = sqlx::query!(
        r#"SELECT h.id, h.name, hm.role, hm.joined_at,
                  (SELECT COUNT(*) FROM household_members WHERE household_id = h.id) AS member_count
           FROM households h
           JOIN household_members hm ON hm.household_id = h.id
           WHERE hm.user_id = $1
           ORDER BY hm.joined_at ASC"#,
        auth.user_id
    )
    .fetch_all(&state.pool)
    .await?;

    let json: Vec<_> = rows.iter().map(|r| serde_json::json!({
        "id":           r.id,
        "name":         r.name,
        "role":         r.role,
        "joined_at":    r.joined_at,
        "member_count": r.member_count,
    })).collect();

    Ok(Json(serde_json::json!(json)))
}

// ── Household targets ─────────────────────────────────────────
#[derive(Deserialize)]
pub struct SetTargetRequest {
    pub category:     String,
    pub target_type:  String,
    pub amount: i64,
    pub period:       Option<String>,
}

pub async fn set_target(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
    Json(body):   Json<SetTargetRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // Only admin can set targets
    let role = sqlx::query!(
        "SELECT role FROM household_members WHERE household_id=$1 AND user_id=$2",
        id, auth.user_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorised)?;

    if role.role != "admin" {
        return Err(AppError::Unauthorised);
    }

    let period = body.period.unwrap_or_else(|| "monthly".into());

    sqlx::query!(
        r#"INSERT INTO household_targets (household_id, category, target_type, amount, period, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (household_id, category, target_type, period)
           DO UPDATE SET amount=$4, updated_at=NOW()"#,
        id, body.category, body.target_type, body.amount, period, auth.user_id
    )
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn get_targets(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    let is_member = sqlx::query!(
        "SELECT 1 AS one FROM household_members WHERE household_id=$1 AND user_id=$2",
        id, auth.user_id
    )
    .fetch_optional(&state.pool)
    .await?
    .is_some();

    if !is_member { return Err(AppError::Unauthorised); }

    let rows = sqlx::query!(
        "SELECT category, target_type, amount, period FROM household_targets WHERE household_id=$1",
        id
    )
    .fetch_all(&state.pool)
    .await?;

    let json: Vec<_> = rows.iter().map(|r| serde_json::json!({
        "category":     r.category,
        "target_type":  r.target_type,
        "amount": r.amount,
        "period":       r.period,
    })).collect();

    Ok(Json(serde_json::json!(json)))
}



// GET /household/:id/transactions?start=&end=&limit=
pub async fn household_transactions(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Query(q): Query<std::collections::HashMap<String, String>>,
    auth: AuthUser,
) -> AppResult<Json<Vec<serde_json::Value>>> {
    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM household_members WHERE household_id=$1 AND user_id=$2)"
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    if !is_member {
        return Err(AppError::Unauthorised);
    }

    let start = q.get("start").cloned().unwrap_or_else(|| "1970-01-01".into());
    let end   = q.get("end").cloned().unwrap_or_else(|| "2099-12-31".into());
    let limit: i64 = q.get("limit").and_then(|s| s.parse().ok()).unwrap_or(500);

    let start_date = NaiveDate::parse_from_str(&start, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid start date".into()))?;
    let end_date = NaiveDate::parse_from_str(&end, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid end date".into()))?;

    let rows: Vec<(serde_json::Value,)> = sqlx::query_as(
        r#"SELECT row_to_json(t) FROM (
            SELECT
                txn.id,
                txn.user_id,
                txn.household_id,
                txn.amount,
                txn.txn_type,
                CASE WHEN txn.hidden_from_family THEN NULL ELSE txn.merchant END AS merchant,
                CASE WHEN txn.hidden_from_family THEN NULL ELSE txn.category END AS category,
                CASE WHEN txn.hidden_from_family THEN NULL ELSE txn.note END AS note,
                txn.txn_date,
                txn.is_investment,
                txn.is_subscription,
                txn.is_cash,
                txn.sources,
                CASE WHEN txn.hidden_from_family THEN NULL ELSE txn.acct_suffix END AS acct_suffix,
                txn.verified,
                u.name,
                txn.hidden_from_family AS is_private
            FROM transactions txn
            JOIN users u ON u.id = txn.user_id
            WHERE txn.household_id = $1
              AND txn.txn_date BETWEEN $2 AND $3
              AND txn.deleted_at IS NULL
              AND NOT txn.is_hidden
              AND NOT txn.hidden_from_family
              AND (txn.hidden_until IS NULL OR txn.hidden_until < CURRENT_DATE)
            ORDER BY txn.txn_date DESC, txn.id DESC
            LIMIT $4
        ) t"#,
    )
    .bind(id)
    .bind(start_date)
    .bind(end_date)
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(rows.into_iter().map(|(v,)| v).collect()))
}


// ── Personal targets ─────────────────────────────────────────
#[derive(serde::Deserialize)]
pub struct PersonalTargetRequest {
    pub category:     String,
    pub target_type:  String,
    pub amount: i64,
    pub period:       Option<String>,
}

pub async fn get_personal_targets(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let rows = sqlx::query!(
        "SELECT category, target_type, amount, period FROM household_targets WHERE user_id=$1 AND household_id IS NULL",
        auth.user_id
    )
    .fetch_all(&state.pool)
    .await?;
    let json: Vec<_> = rows.iter().map(|r| serde_json::json!({
        "category":     r.category,
        "target_type":  r.target_type,
        "amount": r.amount,
        "period":       r.period,
    })).collect();
    Ok(Json(serde_json::json!(json)))
}

pub async fn set_personal_target(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<PersonalTargetRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let period = body.period.unwrap_or_else(|| "monthly".into());
    sqlx::query!(
        r#"INSERT INTO household_targets (user_id, category, target_type, amount, period, created_by)
           VALUES ($1, $2, $3, $4, $5, $1)
           ON CONFLICT (user_id, category, target_type, period)
           WHERE household_id IS NULL
           DO UPDATE SET amount=$4, updated_at=NOW()"#,
        auth.user_id, body.category, body.target_type, body.amount, period
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
