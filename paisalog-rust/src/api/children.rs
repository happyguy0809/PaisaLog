use axum::{extract::{State, Path}, Json};
use serde::{Deserialize, Serialize};
use crate::{
    api::AppState,
    errors::{AppError, AppResult},
    middleware::auth::AuthUser,
};

#[derive(Serialize, sqlx::FromRow)]
pub struct ChildRow {
    pub child_user_id:     i32,
    pub parent_user_id:    i32,
    pub can_remove_sources: bool,
    pub created_at:        chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
pub struct LinkChildBody {
    pub child_user_id:     i32,
    pub can_remove_sources: Option<bool>,
}

#[derive(Deserialize)]
pub struct UpdateChildBody {
    pub can_remove_sources: bool,
}

// POST /children — link a child account to current user (parent)
pub async fn link(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<LinkChildBody>,
) -> AppResult<Json<ChildRow>> {
    // Prevent self-linking
    if body.child_user_id == auth.user_id {
        return Err(AppError::Validation("Cannot link yourself as a child account".into()));
    }

    // Check child user exists
    let exists = sqlx::query_scalar!(
        "SELECT COUNT(*)::BIGINT FROM users WHERE id = $1 AND deleted_at IS NULL",
        body.child_user_id,
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);

    if exists == 0 {
        return Err(AppError::NotFound);
    }

    let row = sqlx::query_as!(
        ChildRow,
        r#"
        INSERT INTO child_accounts (child_user_id, parent_user_id, can_remove_sources)
        VALUES ($1, $2, $3)
        ON CONFLICT (child_user_id, parent_user_id) DO UPDATE
            SET can_remove_sources = EXCLUDED.can_remove_sources
        RETURNING child_user_id, parent_user_id, can_remove_sources, created_at
        "#,
        body.child_user_id,
        auth.user_id,
        body.can_remove_sources.unwrap_or(false),
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(row))
}

// GET /children — list children linked to current user
pub async fn list(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let children = sqlx::query!(
        r#"
        SELECT
            ca.child_user_id,
            ca.can_remove_sources,
            ca.created_at,
            u.name,
            u.plan,
            COALESCE(SUM(t.amount), 0)::BIGINT AS month_spend_paise
        FROM child_accounts ca
        JOIN users u ON u.id = ca.child_user_id
        LEFT JOIN transactions t ON t.user_id = ca.child_user_id
            AND t.txn_type = 'debit'
            AND t.txn_date >= date_trunc('month', NOW())
            AND t.deleted_at IS NULL
        WHERE ca.parent_user_id = $1
        GROUP BY ca.child_user_id, ca.can_remove_sources, ca.created_at, u.name, u.plan
        "#,
        auth.user_id,
    )
    .fetch_all(&state.pool)
    .await?;

    let json: Vec<_> = children.iter().map(|c| serde_json::json!({
        "child_user_id":      c.child_user_id,
        "name":             c.name,
        "plan":             c.plan,
        "can_remove_sources": c.can_remove_sources,
        "month_spend_paise":  c.month_spend_paise,
        "linked_at":         c.created_at.to_rfc3339(),
    })).collect();

    Ok(Json(serde_json::json!({ "children": json })))
}

// GET /children/:id/transactions — parent views child transactions
pub async fn child_transactions(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(child_id): Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    // Verify parent-child relationship
    let is_parent = sqlx::query_scalar!(
        "SELECT COUNT(*)::BIGINT FROM child_accounts WHERE parent_user_id = $1 AND child_user_id = $2",
        auth.user_id, child_id,
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);

    if is_parent == 0 {
        return Err(AppError::Unauthorised);
    }

    let txns = sqlx::query!(
        r#"
        SELECT id, amount, txn_type, merchant, category, txn_date, note
        FROM transactions
        WHERE user_id = $1
          AND deleted_at IS NULL
        ORDER BY txn_date DESC
        LIMIT 200
        "#,
        child_id,
    )
    .fetch_all(&state.pool)
    .await?;

    let json: Vec<_> = txns.iter().map(|t| serde_json::json!({
        "id":          t.id,
        "amount": t.amount,
        "txn_type":     t.txn_type,
        "merchant":    t.merchant,
        "category":    t.category,
        "txn_date":     t.txn_date.to_string(),
        "note":        t.note,
    })).collect();

    Ok(Json(serde_json::json!({ "transactions": json })))
}

// PATCH /children/:id — update child permissions
pub async fn update(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(child_id): Path<i32>,
    Json(body):   Json<UpdateChildBody>,
) -> AppResult<Json<ChildRow>> {
    let row = sqlx::query_as!(
        ChildRow,
        r#"
        UPDATE child_accounts
        SET can_remove_sources = $3
        WHERE parent_user_id = $1 AND child_user_id = $2
        RETURNING child_user_id, parent_user_id, can_remove_sources, created_at
        "#,
        auth.user_id, child_id, body.can_remove_sources,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

// DELETE /children/:id — unlink child account
pub async fn unlink(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(child_id): Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query!(
        "DELETE FROM child_accounts WHERE parent_user_id = $1 AND child_user_id = $2",
        auth.user_id, child_id,
    )
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "unlinked": true })))
}
