use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

use crate::{
    api::AppState,
    errors::{AppError, AppResult},
    middleware::auth::AuthUser,
};

pub async fn list(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let refunds = sqlx::query!(
        r#"
        SELECT
            r.id, r.txn_id, r.merchant, r.refund_type,
            r.status, r.amount, r.reason,
            r.coupon_code, r.expiry_date,
            r.rrn, r.arn, r.reference_no,
            r.initiated_date, r.resolved_date, r.created_at
        FROM refunds r
        WHERE r.user_id = $1
        ORDER BY r.initiated_date DESC
        "#,
        auth.user_id,
    )
    .fetch_all(&state.pool)
    .await?;

    // Attach timelines in a second query (avoids N+1 with a single IN)
    let refund_ids: Vec<i32> = refunds.iter().map(|r| r.id).collect();

    let timelines = if refund_ids.is_empty() {
        vec![]
    } else {
        sqlx::query!(
            r#"
            SELECT id, refund_id, label, event_date, done, active
            FROM refund_timeline
            WHERE refund_id = ANY($1)
            ORDER BY id ASC
            "#,
            &refund_ids,
        )
        .fetch_all(&state.pool)
        .await?
    };

    // Group timelines by refund_id
    use std::collections::HashMap;
    let mut tl_map: HashMap<i32, Vec<serde_json::Value>> = HashMap::new();
    for tl in &timelines {
        tl_map.entry(tl.refund_id).or_default().push(serde_json::json!({
            "id":        tl.id,
            "label":     tl.label,
            "event_date": tl.event_date,
            "done":      tl.done,
            "active":    tl.active,
        }));
    }

    let json: Vec<_> = refunds.iter().map(|r| serde_json::json!({
        "id":            r.id,
        "txn_id":         r.txn_id,
        "merchant":      r.merchant,
        "refund_type":    r.refund_type,
        "status":        r.status,
        "amount":   r.amount,
        "reason":        r.reason,
        "coupon_code":    r.coupon_code,
        "expiry_date":    r.expiry_date,
        "rrn":            r.rrn,
            "arn":            r.arn,
            "reference_no":   r.reference_no,
            "initiated_date": r.initiated_date,
        "resolved_date":  r.resolved_date,
        "timeline":      tl_map.get(&r.id).cloned().unwrap_or_default(),
    })).collect();

    Ok(Json(serde_json::json!(json)))
}

#[derive(Deserialize)]
pub struct UpdateStatusRequest {
    pub status: String,
}

pub async fn update_status(
    State(state): State<AppState>,
    auth:         AuthUser,
    Path(id):     Path<i32>,
    Json(body):   Json<UpdateStatusRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let valid = ["received","active","soon","expired","used","waiting","credited","pending"];
    if !valid.contains(&body.status.as_str()) {
        return Err(AppError::Validation(format!(
            "status must be one of: {}", valid.join(", ")
        )));
    }

    let result = sqlx::query!(
        "UPDATE refunds SET status = $1 WHERE id = $2 AND user_id = $3",
        body.status, id, auth.user_id,
    )
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}


#[derive(serde::Deserialize)]
pub struct CreateRefundRequest {
    pub txn_id:         Option<i64>,
    pub merchant:       Option<String>,
    pub amount:   Option<i32>,
    pub refund_type:    String,           // "refund" | "reversal" | "cashback"
    pub reason:         Option<String>,
    pub rrn:            Option<String>,   // Retrieval Reference Number (12-digit, PG-generated)
    pub arn:            Option<String>,   // Acquirer Reference Number (23-digit, bank-generated)
    pub reference_no:   Option<String>,   // Generic fallback reference
    pub initiated_date: Option<String>,   // YYYY-MM-DD
}

pub async fn create(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<CreateRefundRequest>,
) -> AppResult<Json<serde_json::Value>> {
    use chrono::NaiveDate;

    let valid_types = ["refund", "reversal", "cashback"];
    if !valid_types.contains(&body.refund_type.as_str()) {
        return Err(AppError::Validation("refund_type must be refund, reversal, or cashback".into()));
    }

    let initiated = body.initiated_date.as_deref()
        .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

    let id: i32 = sqlx::query_scalar(
        r#"INSERT INTO refunds
            (user_id, txn_id, merchant, amount, refund_type, reason,
             rrn, arn, reference_no, initiated_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
           RETURNING id"#
    )
    .bind(auth.user_id)
    .bind(body.txn_id)
    .bind(&body.merchant)
    .bind(body.amount)
    .bind(&body.refund_type)
    .bind(&body.reason)
    .bind(&body.rrn)
    .bind(&body.arn)
    .bind(&body.reference_no)
    .bind(initiated)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    // Seed default timeline steps
    let steps = [
        ("initiated",  "Refund initiated",         true,  true),
        ("processing", "Processing at bank",        false, false),
        ("credited",   "Amount credited to source", false, false),
    ];
    for (step, label, done, active) in &steps {
        sqlx::query(
            "INSERT INTO refund_timeline (refund_id, step, status, label, done, active) VALUES ($1, $2, 'pending', $3, $4, $5)"
        )
        .bind(id)
        .bind(step)
        .bind(label)
        .bind(done)
        .bind(active)
        .execute(&state.pool)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    }

    Ok(Json(serde_json::json!({ "ok": true, "id": id })))
}
