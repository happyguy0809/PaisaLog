use sha2::{Digest, Sha256};

/// Generate a deterministic deduplication fingerprint.
///
/// Two messages are considered the same transaction if:
/// - Same user
/// - Same amount (paise)
/// - Same account suffix (or both absent)
/// - Within the same 2-minute window
///
/// This allows SMS and email to match the same transaction
/// without storing a global unique ID.
///
/// The fingerprint is stored in Postgres with a UNIQUE constraint
/// per (user_id, fingerprint). A conflict = duplicate, not an error.
pub fn generate(
    user_id:      i32,
    amount: i64,
    acct_suffix:  Option<&str>,
    epoch_seconds:i64,
) -> String {
    // 2-minute bucket — SMS and email for same txn arrive within this window
    let time_bucket = epoch_seconds / 120;

    let raw = format!(
        "{}|{}|{}|{}",
        user_id,
        amount,
        acct_suffix.unwrap_or(""),
        time_bucket,
    );

    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    hex::encode(hasher.finalize())
}

/// Hash for storing sender ID (bank SMS sender like BX-HDFCBK).
/// One-way — used only for dedup, never for lookup.
pub fn hash_sender(sender: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(sender.to_uppercase().trim().as_bytes());
    hex::encode(hasher.finalize())
}

/// Hash for storing email addresses.
/// Input must be lowercased and trimmed before hashing.
pub fn hash_email(email: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(email.to_lowercase().trim().as_bytes());
    hex::encode(hasher.finalize())
}

/// Hash for storing auth tokens — prevents token theft if DB is compromised.
pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_inputs_produce_same_fingerprint() {
        let fp1 = generate(42, 125000, Some("4521"), 1742198400);
        let fp2 = generate(42, 125000, Some("4521"), 1742198400);
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn different_amounts_produce_different_fingerprints() {
        let fp1 = generate(42, 125000, Some("4521"), 1742198400);
        let fp2 = generate(42, 126000, Some("4521"), 1742198400);
        assert_ne!(fp1, fp2);
    }

    #[test]
    fn within_2min_window_produces_same_fingerprint() {
        // epoch 1742198400 and epoch 1742198450 are in the same 120s bucket
        let fp1 = generate(42, 125000, Some("4521"), 1742198400);
        let fp2 = generate(42, 125000, Some("4521"), 1742198450);
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn across_2min_boundary_produces_different_fingerprint() {
        // 1742198399 is in bucket 14518319, 1742198400 is in bucket 14518320
        let fp1 = generate(42, 125000, Some("4521"), 1742198399);
        let fp2 = generate(42, 125000, Some("4521"), 1742198520);
        assert_ne!(fp1, fp2);
    }

    #[test]
    fn different_users_produce_different_fingerprints() {
        let fp1 = generate(1,  125000, Some("4521"), 1742198400);
        let fp2 = generate(42, 125000, Some("4521"), 1742198400);
        assert_ne!(fp1, fp2);
    }

    #[test]
    fn email_hash_is_lowercase_insensitive() {
        let h1 = hash_email("User@Example.COM");
        let h2 = hash_email("user@example.com");
        assert_eq!(h1, h2);
    }
}
