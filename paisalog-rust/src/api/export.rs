//! PDPB-compliant data export.
//! Users can download ALL their data in structured JSON.
//! Raw SMS bodies are never stored so cannot be exported.
//! Only structured, parsed fields are returned.

use axum::{extract::State, Json};
use crate::{
    api::AppState,
    errors::AppResult,
    middleware::auth::AuthUser,
};

// GET /me/export — full data export for current user
pub async fn export_my_data(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<serde_json::Value>> {

    // User profile
    let user = sqlx::query!(
        r#"
        SELECT id, plan, sync_mode, jurisdiction,
               analytics_consent, marketing_consent,
               consent_recorded_at, locale, timezone,
               created_at, deleted_at
        FROM users WHERE id = $1
        "#,
        auth.user_id,
    )
    .fetch_one(&state.pool)
    .await?;

    // Transactions (structured fields only — no raw SMS)
    let transactions = sqlx::query!(
        r#"
        SELECT id, amount, txn_type, merchant, category,
               acct_suffix, sources, confidence, verified,
               txn_date, sync_state, note,
               is_investment, is_subscription, is_cash,
               local_id, created_at
        FROM transactions
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY txn_date DESC
        "#,
        auth.user_id,
    )
    .fetch_all(&state.pool)
    .await?;

    // Refunds
    let refunds = sqlx::query!(
        r#"
        SELECT id, refund_type, merchant, amount,
               coupon_code, expiry_date, status,
               initiated_date, resolved_date, created_at
        FROM refunds
        WHERE user_id = $1
        ORDER BY created_at DESC
        "#,
        auth.user_id,
    )
    .fetch_all(&state.pool)
    .await?;

    // Cash spends
    let cash_spends = sqlx::query!(
        r#"
        SELECT id, amount, note, category, spent_date, created_at
        FROM cash_spends
        WHERE user_id = $1
        ORDER BY spent_date DESC
        "#,
        auth.user_id,
    )
    .fetch_all(&state.pool)
    .await?;

    // Signal log (parsed fields only — no raw message body)
    let signals = sqlx::query!(
        r#"
        SELECT id, source, confidence, classification,
               parsed_amount, parsed_type, parsed_merchant,
               parsed_acct_suffix, promoted, received_at
        FROM raw_signal_log
        WHERE user_id = $1
        ORDER BY received_at DESC
        LIMIT 1000
        "#,
        auth.user_id,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "notice": "Raw SMS and email bodies are never stored by PaisaLog. Only structured, parsed fields are retained.",
        "profile": {
            "id":                user.id,
            "plan":              user.plan,
            "sync_mode":          user.sync_mode,
            "jurisdiction":      user.jurisdiction,
            "analytics_consent":  user.analytics_consent,
            "marketing_consent":  user.marketing_consent,
            "consent_recorded_at": user.consent_recorded_at.map(|t| t.to_rfc3339()),
            "locale":            user.locale,
            "timezone":          user.timezone,
            "created_at":         user.created_at.to_rfc3339(),
        },
        "transactions": transactions.iter().map(|t| serde_json::json!({
            "id":            t.id,
            "amount":   t.amount,
            "txn_type":       t.txn_type,
            "merchant":      t.merchant,
            "category":      t.category,
            "acct_suffix":    t.acct_suffix,
            "sources":       t.sources,
            "confidence":    t.confidence,
            "verified":      t.verified,
            "txn_date":       t.txn_date.to_string(),
            "sync_state":     t.sync_state,
            "note":          t.note,
            "is_investment":  t.is_investment,
            "is_subscription":t.is_subscription,
            "is_cash":        t.is_cash,
            "local_id":       t.local_id,
            "created_at":     t.created_at.to_rfc3339(),
        })).collect::<Vec<_>>(),
        "refunds": refunds.iter().map(|r| serde_json::json!({
            "id":           r.id,
            "refund_type":   r.refund_type,
            "merchant":     r.merchant,
            "amount":  r.amount,
            "coupon_code":   r.coupon_code,
            "expiry_date":   r.expiry_date.map(|d| d.to_string()),
            "status":       r.status,
            "initiated_date":r.initiated_date.map(|d| d.to_string()),
            "resolved_date": r.resolved_date.map(|d| d.to_string()),
            "created_at":    r.created_at.to_rfc3339(),
        })).collect::<Vec<_>>(),
        "cash_spends": cash_spends.iter().map(|c| serde_json::json!({
            "id":          c.id,
            "amount": c.amount,
            "note":        c.note,
            "category":    c.category,
            "spent_date":   c.spent_date.to_string(),
            "created_at":   c.created_at.to_rfc3339(),
        })).collect::<Vec<_>>(),
        "signal_log": signals.iter().map(|s| serde_json::json!({
            "id":                 s.id,
            "source":             s.source,
            "confidence":         s.confidence,
            "classification":     s.classification,
            "parsed_amount":  s.parsed_amount,
            "parsed_type":         s.parsed_type,
            "parsed_merchant":     s.parsed_merchant,
            "parsed_acct_suffix":   s.parsed_acct_suffix,
            "promoted":           s.promoted,
            "received_at":         s.received_at.to_rfc3339(),
        })).collect::<Vec<_>>(),
    })))
}
