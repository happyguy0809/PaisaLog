use chrono::NaiveDate;
use sqlx::PgPool;
use crate::errors::AppResult;

pub async fn create_from_transaction(
    pool:            &PgPool,
    user_id:         i32,
    txn_id:          i64,
    merchant:        &str,
    amount:    i64,
    is_coupon:       bool,
    coupon_code:     Option<&str>,
    expiry_date:     Option<NaiveDate>,
    initiated_date:  NaiveDate,
) -> AppResult<i64> {
    let refund_type = if is_coupon { "coupon" } else { "money" };
    let status      = if is_coupon { "active" } else { "received" };

    let row = sqlx::query!(
        r#"
        INSERT INTO refunds (
            user_id, txn_id, merchant, refund_type,
            status, amount, coupon_code,
            expiry_date, initiated_date
        ) VALUES ($1, $2, $3, $4, $5, $6::BIGINT, $7, $8, $9)
        RETURNING id
        "#,
        user_id,
        txn_id,
        merchant,
        refund_type,
        status,
        amount,
        coupon_code,
        expiry_date,
        initiated_date,
    )
    .fetch_one(pool)
    .await?;

    // Seed timeline entries
    let steps: &[(&str, bool)] = if is_coupon {
        &[
            ("Refund issued as coupon", true),
            ("Coupon active — use before expiry", false),
        ]
    } else {
        &[
            ("Refund detected via SMS/email", true),
            ("Credited to source account", true),
        ]
    };

    for (label, done) in steps {
        sqlx::query!(
            r#"
            INSERT INTO refund_timeline (refund_id, label, event_date, done)
            VALUES ($1, $2, NOW()::TEXT, $3)
            "#,
            row.id,
            label,
            done,
        )
        .execute(pool)
        .await?;
    }

    Ok(row.id as i64)
}

/// Refresh coupon statuses — called by daily cron job.
/// Sets 'soon' for coupons expiring within 7 days,
/// 'expired' for coupons past their expiry date.
pub async fn refresh_coupon_statuses(pool: &PgPool) -> AppResult<u64> {
    // Mark as 'soon'
    let soon = sqlx::query!(
        r#"
        UPDATE refunds
        SET status = 'soon'
        WHERE refund_type = 'coupon'
          AND status = 'active'
          AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
        "#
    )
    .execute(pool)
    .await?
    .rows_affected();

    // Mark as 'expired'
    let expired = sqlx::query!(
        r#"
        UPDATE refunds
        SET status = 'expired'
        WHERE refund_type = 'coupon'
          AND status IN ('active', 'soon')
          AND expiry_date < CURRENT_DATE
        "#
    )
    .execute(pool)
    .await?
    .rows_affected();

    tracing::info!(soon, expired, "Coupon statuses refreshed");
    Ok(soon + expired)
}
