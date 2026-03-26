use sqlx::PgPool;
use tokio_cron_scheduler::{Job, JobScheduler};
use crate::compliance::{rules_for, Jurisdiction};
use crate::services::refunds::refresh_coupon_statuses;

pub async fn start(pool: PgPool) -> anyhow::Result<()> {
    let sched = JobScheduler::new().await?;

    // ── Coupon expiry — 8am IST daily ─────────────────────────
    let pool_c = pool.clone();
    sched.add(Job::new_async("0 30 2 * * *", move |_, _| {
        // 08:30 IST = 03:00 UTC
        let p = pool_c.clone();
        Box::pin(async move {
            if let Err(e) = refresh_coupon_statuses(&p).await {
                tracing::error!(error = %e, "Coupon refresh failed");
            }
        })
    })?).await?;

    // ── Signal log purge — Sunday 3am UTC ─────────────────────
    // Respects per-jurisdiction retention windows
    let pool_p = pool.clone();
    sched.add(Job::new_async("0 0 3 * * SUN", move |_, _| {
        let p = pool_p.clone();
        Box::pin(async move {
            // India: 90 days, EU: 30 days, Unknown: 30 days
            // We purge based on the user's jurisdiction stored in their row
            if let Err(e) = purge_signals_by_jurisdiction(&p).await {
                tracing::error!(error = %e, "Signal purge failed");
            }
        })
    })?).await?;

    // ── Auth token cleanup — 1am UTC daily ───────────────────
    let pool_a = pool.clone();
    sched.add(Job::new_async("0 0 1 * * *", move |_, _| {
        let p = pool_a.clone();
        Box::pin(async move {
            if let Err(e) = purge_expired_tokens(&p).await {
                tracing::error!(error = %e, "Token purge failed");
            }
        })
    })?).await?;

    // ── DSAR hard delete — Sunday 4am UTC ─────────────────────
    let pool_d = pool.clone();
    sched.add(Job::new_async("0 0 4 * * SUN", move |_, _| {
        let p = pool_d.clone();
        Box::pin(async move {
            if let Err(e) = hard_delete_users(&p).await {
                tracing::error!(error = %e, "Hard delete failed");
            }
        })
    })?).await?;

    // ── Partition creation — 1st of each month ────────────────
    let pool_pt = pool.clone();
    sched.add(Job::new_async("0 0 0 1 * *", move |_, _| {
        let p = pool_pt.clone();
        Box::pin(async move {
            if let Err(e) = ensure_next_partition(&p).await {
                tracing::error!(error = %e, "Partition creation failed");
            }
        })
    })?).await?;

    // ── Subscription detection — 2am UTC daily ───────────────
    let pool_s = pool.clone();
    sched.add(Job::new_async("0 0 2 * * *", move |_, _| {
        let p = pool_s.clone();
        Box::pin(async move {
            if let Err(e) = crate::parser::subscription::detect_recurring(&p).await {
                tracing::error!(error = %e, "Subscription detection failed");
            }
        })
    })?).await?;

    sched.start().await?;
    tracing::info!("Scheduler started — 6 jobs registered");
    Ok(())
}

async fn purge_signals_by_jurisdiction(pool: &PgPool) -> anyhow::Result<()> {
    // For each jurisdiction, apply its retention rule
    for (jurisdiction, days) in &[
        ("IN",      90i64),
        ("EU",      30i64),
        ("US",      90i64),
        ("UNKNOWN", 30i64),
    ] {
        let deleted = sqlx::query!(
            r#"
            DELETE FROM raw_signal_log
            WHERE received_at < NOW() - ($1 || ' days')::INTERVAL
              AND user_id IN (
                  SELECT id FROM users
                  WHERE jurisdiction = $2
                    AND deleted_at IS NULL
              )
              AND promoted = FALSE
            "#,
            days.to_string(),
            jurisdiction,
        )
        .execute(pool)
        .await?
        .rows_affected();

        tracing::info!(jurisdiction, deleted, "Signal log purge");
    }
    Ok(())
}

async fn purge_expired_tokens(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query!("DELETE FROM auth_tokens WHERE expires_at < NOW()")
        .execute(pool).await?;
    sqlx::query!("DELETE FROM refresh_tokens WHERE expires_at < NOW() AND revoked = TRUE")
        .execute(pool).await?;
    Ok(())
}

async fn hard_delete_users(pool: &PgPool) -> anyhow::Result<()> {
    // Apply per-jurisdiction hard delete delay
    for (jurisdiction, delay_days) in &[
        ("IN",      30i64),   // PDPB: 30 days
        ("EU",      30i64),   // GDPR: without undue delay
        ("US",      45i64),   // CCPA: 45 days
        ("UNKNOWN",  7i64),   // Most restrictive
    ] {
        let deleted = sqlx::query!(
            r#"
            DELETE FROM users
            WHERE deleted_at IS NOT NULL
              AND deleted_at < NOW() - ($1 || ' days')::INTERVAL
              AND jurisdiction = $2
            "#,
            delay_days.to_string(),
            jurisdiction,
        )
        .execute(pool)
        .await?
        .rows_affected();

        if deleted > 0 {
            tracing::info!(jurisdiction, deleted, "Hard deleted users");
        }
    }
    Ok(())
}

async fn ensure_next_partition(pool: &PgPool) -> anyhow::Result<()> {
    // Create the partition for 3 months from now (gives buffer)
    let target = chrono::Utc::now() + chrono::Duration::days(90);
    let start  = target.date_naive().with_day(1).unwrap_or(target.date_naive());
    let end    = if start.month() == 12 {
        chrono::NaiveDate::from_ymd_opt(start.year() + 1, 1, 1).unwrap()
    } else {
        chrono::NaiveDate::from_ymd_opt(start.year(), start.month() + 1, 1).unwrap()
    };

    sqlx::query!(
        "SELECT create_next_partition($1, $2)",
        start, end,
    )
    .execute(pool)
    .await?;

    tracing::info!(?start, ?end, "Partition ensured");
    Ok(())
}

use chrono::Datelike;
