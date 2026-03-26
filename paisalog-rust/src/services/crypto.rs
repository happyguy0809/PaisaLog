use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use aes_gcm::aead::rand_core::RngCore;
use anyhow::{Context, Result};

/// Encrypt a plaintext string using AES-256-GCM.
/// Used ONLY for OAuth tokens stored in email_accounts.oauth_token_enc.
/// All other sensitive fields use one-way SHA-256 hashing.
///
/// Output format: hex(nonce) + ":" + hex(ciphertext+tag)
pub fn encrypt(plaintext: &str, key_bytes: &[u8; 32]) -> Result<String> {
    let key    = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("Encryption failed: {:?}", e))?;

    Ok(format!("{}:{}", hex::encode(nonce_bytes), hex::encode(ciphertext)))
}

/// Decrypt a string encrypted by `encrypt`.
pub fn decrypt(ciphertext: &str, key_bytes: &[u8; 32]) -> Result<String> {
    let parts: Vec<&str> = ciphertext.splitn(2, ':').collect();
    if parts.len() != 2 {
        anyhow::bail!("Invalid ciphertext format");
    }

    let nonce_bytes = hex::decode(parts[0]).context("Invalid nonce hex")?;
    let data_bytes  = hex::decode(parts[1]).context("Invalid data hex")?;

    let key    = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce  = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, data_bytes.as_ref())
        .map_err(|e| anyhow::anyhow!("Decryption failed: {:?}", e))?;

    String::from_utf8(plaintext).context("Invalid UTF-8 in decrypted data")
}

/// Generate a cryptographically secure random token (hex string).
pub fn generate_token(byte_length: usize) -> String {
    let mut bytes = vec![0u8; byte_length];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Generate an 8-character invite code (uppercase alphanumeric, no ambiguous chars).
pub fn generate_invite_code() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut bytes = [0u8; 8];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| CHARS[(b % CHARS.len() as u8) as usize] as char).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> [u8; 32] {
        [0u8; 32]
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key       = test_key();
        let plaintext = "test-oauth-token-12345";
        let encrypted = encrypt(plaintext, &key).unwrap();
        let decrypted = decrypt(&encrypted, &key).unwrap();
        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn different_encryptions_of_same_plaintext_differ() {
        let key = test_key();
        let e1  = encrypt("same", &key).unwrap();
        let e2  = encrypt("same", &key).unwrap();
        assert_ne!(e1, e2); // different nonces
    }

    #[test]
    fn invite_code_is_8_chars() {
        let code = generate_invite_code();
        assert_eq!(code.len(), 8);
        assert!(code.chars().all(|c| c.is_ascii_alphanumeric()));
    }
}
