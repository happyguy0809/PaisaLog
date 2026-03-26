//! Subscription detection.
//!
//! A transaction is flagged as a subscription when:
//! a) The message contains subscription keywords, OR
//! b) The same merchant appears at a similar amount on a recurring schedule
//!
//! Detection (b) runs as a background job, not inline during parse,
//! so it never slows down the ingest path.

use sqlx::PgPool;
use crate::errors::AppResult;

/// Check if a merchant name looks like a subscription provider.
/// Used inline during parse to set is_subscription = true.
pub fn is_subscription_keyword(body_lower: &str) -> bool {
    const KEYWORDS: &[&str] = &[
        "subscription", "auto-debit", "auto debit",
        "standing instruction", "recurring", "emi payment",
        "auto renewal", "monthly plan", "annual plan",
        "mandate", "nach debit",
    ];
    KEYWORDS.iter().any(|k| body_lower.contains(k))
}

/// Background job: scan recent transactions and detect recurring patterns.
/// Runs weekly. Updates is_subscription = true on matched transactions
/// and inserts into the subscriptions table.
pub async fn detect_recurring(pool: &PgPool) -> AppResult<u64> {
    // Find merchant + user combinations where the same merchant
    // appears 2+ times within a 28-35 day cadence
    let candidates = sqlx::query!(
        r#"
        SELECT
            user_id,
            merchant,
            COUNT(*)::INT AS occurrences,
            MIN(amount) AS min_amount,
            MAX(amount) AS max_amount,
            MIN(txn_date) AS first_date,
            MAX(txn_date) AS last_date
        FROM transactions
        WHERE merchant IS NOT NULL
          AND txn_type = 'debit'
          AND txn_date >= CURRENT_DATE - 90
          AND is_subscription = FALSE
          AND deleted_at IS NULL
        GROUP BY user_id, merchant
        HAVING COUNT(*) >= 2
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut flagged = 0u64;

    for c in &candidates {
        // Check if amount is consistent (within 10% variance)
        let min = c.min_amount.unwrap_or(0) as f64;
        let max = c.max_amount.unwrap_or(0) as f64;
        if min <= 0.0 || (max - min) / max > 0.10 {
            continue; // amount variance too high — not a subscription
        }

        // Check cadence: average gap between transactions should be 25-35 days
        let days_span = c.last_date
            .map(|l| c.first_date.map(|f| (l - f).num_days()).unwrap_or(0))
            .unwrap_or(0);
        let occ = c.occurrences.unwrap_or(1) as f64;
        if occ < 2.0 { continue; }

        let avg_gap = days_span as f64 / (occ - 1.0);
        let is_monthly = avg_gap >= 25.0 && avg_gap <= 35.0;
        let is_weekly  = avg_gap >= 5.0  && avg_gap <= 9.0;
        let is_annual  = avg_gap >= 350.0 && avg_gap <= 380.0;

        if !is_monthly && !is_weekly && !is_annual {
            continue;
        }

        let cadence_days = if is_monthly { 30 }
            else if is_weekly { 7 }
            else { 365 };

        // Flag transactions
        sqlx::query!(
            r#"
            UPDATE transactions
            SET is_subscription = TRUE
            WHERE user_id = $1 AND merchant = $2
              AND txn_type = 'debit'
            "#,
            c.user_id, c.merchant,
        )
        .execute(pool)
        .await?;

        // Upsert into subscriptions table
        sqlx::query!(
            r#"
            INSERT INTO subscriptions (
                user_id, merchant, estimated_amount,
                cadence_days, last_payment_date, next_estimated_date, active
            )
            SELECT $1, $2, $3, $4::INT, $5, $6,
                   TRUE
            ON CONFLICT (user_id, merchant) DO UPDATE
            SET estimated_amount = EXCLUDED.estimated_amount,
                cadence_days           = EXCLUDED.cadence_days,
                last_payment_date      = EXCLUDED.last_payment_date,
                next_estimated_date    = EXCLUDED.next_estimated_date
            "#,
            c.user_id,
            c.merchant,
            c.max_amount,
            cadence_days as i32,
            c.last_date,
            c.last_date.map(|d| d + chrono::Duration::days(cadence_days as i64)),
        )
        .execute(pool)
        .await?;

        flagged += 1;
    }

    tracing::info!(flagged, "Subscription detection complete");
    Ok(flagged)
}
