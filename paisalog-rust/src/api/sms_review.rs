// src/api/sms_review.rs
//
// POST   /sms/review              — queue low-confidence parse
// GET    /sms/review              — list pending (current user)
// PATCH  /sms/review/:id/approve  — correct + create transaction
// PATCH  /sms/review/:id/reject   — mark as noise

use axum::{extract::{Path, State}, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use crate::api::AppState;

// ── Submit ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SubmitReviewReq {
    pub sender_id:         String,
    pub raw_body:          String,
    pub masked_body:       Option<String>,
    pub parse_trace:       Value,
    pub overall_conf:      i32,
    pub mandatory_missing: Vec<String>,
    pub optional_missing:  Vec<String>,
    pub parsed_amount:     Option<i64>,
    pub parsed_currency:   Option<String>,
    pub parsed_account:    Option<String>,
    pub parsed_action:     Option<String>,
    pub parsed_merchant:   Option<String>,
    pub parsed_date:       Option<String>,
    pub parsed_bank:       Option<String>,
    pub parsed_reference:  Option<String>,
}

pub async fn submit(
    State(state): State<AppState>,
    auth: crate::middleware::auth::AuthUser,
    Json(r): Json<SubmitReviewReq>,
) -> Result<Json<Value>, (StatusCode, String)> {

    let parsed_date: Option<chrono::NaiveDate> = r.parsed_date
        .as_deref()
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

    let id: i32 = sqlx::query_scalar(
        "INSERT INTO sms_parse_review (
           user_id, sender_id, raw_body, masked_body,
           parse_trace, overall_conf, mandatory_missing, optional_missing,
           parsed_amount, parsed_currency, parsed_account, parsed_action,
           parsed_merchant, parsed_date, parsed_bank, parsed_reference
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id",
    )
    .bind(auth.user_id).bind(&r.sender_id).bind(&r.raw_body).bind(&r.masked_body)
    .bind(&r.parse_trace).bind(r.overall_conf)
    .bind(&r.mandatory_missing).bind(&r.optional_missing)
    .bind(r.parsed_amount).bind(&r.parsed_currency).bind(&r.parsed_account)
    .bind(&r.parsed_action).bind(&r.parsed_merchant).bind(parsed_date)
    .bind(&r.parsed_bank).bind(&r.parsed_reference)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(json!({ "id": id, "status": "pending" })))
}

// ── List ─────────────────────────────────────────────────────

pub async fn list(
    State(state): State<AppState>,
    auth: crate::middleware::auth::AuthUser,
) -> Result<Json<Value>, (StatusCode, String)> {

    let rows = sqlx::query!(
        r#"SELECT id, sender_id,
           LEFT(raw_body,160)         AS body_preview,
           overall_conf,
           mandatory_missing, optional_missing,
           parsed_amount, parsed_currency, parsed_action,
           parsed_merchant, parsed_account,
           parsed_date::text          AS parsed_date,
           parsed_bank, parse_trace,
           created_at::text           AS created_at
         FROM sms_parse_review
         WHERE user_id=$1 AND status='pending'
         ORDER BY
           CASE WHEN mandatory_missing != '{}' THEN 0 ELSE 1 END,
           overall_conf ASC, created_at DESC
         LIMIT 100"#,
        auth.user_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let items: Vec<Value> = rows.iter().map(|r| json!({
        "id":                r.id,
        "sender_id":         r.sender_id,
        "body_preview":      r.body_preview,
        "overall_conf":      r.overall_conf,
        "mandatory_missing": r.mandatory_missing,
        "optional_missing":  r.optional_missing,
        "parsed_amount":     r.parsed_amount,
        "parsed_currency":   r.parsed_currency,
        "parsed_action":     r.parsed_action,
        "parsed_merchant":   r.parsed_merchant,
        "parsed_account":    r.parsed_account,
        "parsed_date":       r.parsed_date,
        "parsed_bank":       r.parsed_bank,
        "parse_trace":       r.parse_trace,
        "created_at":        r.created_at,
    })).collect();

    Ok(Json(json!(items)))
}

// ── Approve ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ApproveReq {
    pub account_id: i32,
    pub amount:     Option<i64>,
    pub currency:   Option<String>,
    pub merchant:   Option<String>,
    pub action:     Option<String>,
    pub date:       Option<String>,
    pub note:       Option<String>,
}

pub async fn approve(
    State(state): State<AppState>,
    auth: crate::middleware::auth::AuthUser,
    Path(review_id): Path<i32>,
    Json(req): Json<ApproveReq>,
) -> Result<Json<Value>, (StatusCode, String)> {

    let item = sqlx::query!(
        "SELECT * FROM sms_parse_review WHERE id=$1 AND user_id=$2",
        review_id, auth.user_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Not found".into()))?;

    let amount   = req.amount  .or(item.parsed_amount)
        .ok_or((StatusCode::BAD_REQUEST, "amount required".into()))?;
    let currency = req.currency.or(item.parsed_currency).unwrap_or("INR".into());
    let merchant = req.merchant.clone().or(item.parsed_merchant).unwrap_or_default();
    let action   = req.action.clone().or(item.parsed_action).unwrap_or("debit".into());

    let txn_date: Option<chrono::NaiveDate> = req.date.as_deref()
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .or(item.parsed_date);

    let metadata = json!({
        "sms_parse_trace": item.parse_trace,
        "review_id": review_id,
        "source": "sms_review_approved",
    });

    let txn_id: i32 = sqlx::query_scalar(
        "INSERT INTO transactions
           (user_id, account_id, amount, currency, merchant_name,
            action, transaction_date, raw_sms_body, needs_review, metadata, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10)
         RETURNING id",
    )
    .bind(auth.user_id).bind(req.account_id).bind(amount).bind(&currency)
    .bind(&merchant).bind(&action).bind(txn_date)
    .bind(&item.raw_body).bind(&metadata).bind(&req.note)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query!(
        "UPDATE sms_parse_review
         SET status='approved', reviewed_at=now(),
             corrected_data=$1
         WHERE id=$2",
        json!({ "amount": req.amount, "merchant": req.merchant,
                "action": req.action, "date": req.date }),
        review_id
    )
    .execute(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(json!({ "transaction_id": txn_id, "status": "approved" })))
}

// ── Reject ───────────────────────────────────────────────────

pub async fn reject(
    State(state): State<AppState>,
    auth: crate::middleware::auth::AuthUser,
    Path(review_id): Path<i32>,
) -> Result<Json<Value>, (StatusCode, String)> {

    sqlx::query!(
        "UPDATE sms_parse_review
         SET status='rejected', reviewed_at=now()
         WHERE id=$1 AND user_id=$2",
        review_id, auth.user_id
    )
    .execute(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(json!({ "status": "rejected" })))
}
