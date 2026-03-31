// src/services/transfer_detection.rs
use sqlx::PgPool;
use tracing::info;

const TRANSFER_KEYWORDS: &[&str] = &[
    "self", "own", "transfer", "neft", "imps", "rtgs",
    "sbi cards", "sbi card", "hdfc bank", "icici bank",
    "axis bank", "kotak bank", "yes bank", "bob",
    "upi", "user", "account", "wallet",
];

fn looks_like_transfer(merchant: Option<&str>) -> bool {
    let m = match merchant {
        Some(m) if !m.is_empty() => m.to_lowercase(),
        _ => return false,
    };
    // Pure digits or phone numbers = UPI/IMPS ref (e.g. "9215676766")
    if m.chars().all(|c| c.is_ascii_digit()) { return true; }
    // Known transfer keywords
    TRANSFER_KEYWORDS.iter().any(|kw| m.contains(kw))
}

pub async fn detect_transfers(pool: &PgPool, user_id: i32) -> anyhow::Result<i32> {
    let debits = sqlx::query!(
        r#"
        SELECT id, amount, merchant, acct_suffix, txn_date,
               created_at
        FROM transactions
        WHERE user_id = $1
          AND txn_type = 'debit'
          AND (is_transfer IS NULL OR is_transfer = false)
          AND deleted_at IS NULL
          AND (account_type IS NULL OR account_type != 'credit_card')
        ORDER BY created_at DESC
        LIMIT 500
        "#,
        user_id
    )
    .fetch_all(pool)
    .await?;

    let mut pairs_found = 0i32;

    for debit in &debits {
        let min_amount = (debit.amount as f64 * 0.98) as i32;
        let max_amount = (debit.amount as f64 * 1.02) as i32;

        let credit = sqlx::query!(
            r#"
            SELECT id, amount, merchant, acct_suffix
            FROM transactions
            WHERE user_id = $1
              AND txn_type = 'credit'
              AND amount BETWEEN $2 AND $3
              AND ABS(EXTRACT(EPOCH FROM (created_at - $4))) <= 3600
              AND (is_transfer IS NULL OR is_transfer = false)
              AND deleted_at IS NULL
              AND (account_type IS NULL OR account_type != 'credit_card')
              AND id != $5
            ORDER BY ABS(amount - $6),
                     ABS(EXTRACT(EPOCH FROM (created_at - $4)))
            LIMIT 1
            "#,
            user_id,
            min_amount,
            max_amount,
            debit.created_at,
            debit.id,
            debit.amount as i32,
        )
        .fetch_optional(pool)
        .await?;

        let credit = match credit { Some(c) => c, None => continue };

        let ds = debit.acct_suffix.as_deref().unwrap_or("");
        let cs = credit.acct_suffix.as_deref().unwrap_or("");
        let diff_accounts = !ds.is_empty() && !cs.is_empty() && ds != cs;

        // Debit merchant must NOT be a real merchant (e.g. Zepto, IRCTC, Zomato)
        // Only pure transfer keywords allowed on debit side
        let debit_is_transfer = looks_like_transfer(debit.merchant.as_deref());
        if !debit_is_transfer { continue; }

        // Credit side: either different account OR looks like transfer
        let credit_is_transfer = looks_like_transfer(credit.merchant.as_deref());
        if !diff_accounts && !credit_is_transfer { continue; }

        // Mark debit
        sqlx::query!(
            "UPDATE transactions
             SET is_transfer = true, transfer_pair_id = $1
             WHERE id = $2 AND txn_date = $3",
            credit.id, debit.id, debit.txn_date
        )
        .execute(pool)
        .await?;

        // Mark credit
        sqlx::query!(
            "UPDATE transactions
             SET is_transfer = true, transfer_pair_id = $1
             WHERE id = $2",
            debit.id, credit.id
        )
        .execute(pool)
        .await?;

        pairs_found += 1;
        info!(debit_id = debit.id, credit_id = credit.id,
              amount = debit.amount, "transfer pair detected");
    }

    info!(user_id, pairs_found, "transfer detection complete");
    Ok(pairs_found)
}
