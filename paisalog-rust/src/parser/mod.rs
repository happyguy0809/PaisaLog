//! SMS and email parser — reliability over coverage.
//!
//! Core philosophy: return None for any field we are not confident about.
//! A transaction with amount=None is dropped to MEDIUM/LOW confidence
//! and shown empty in the UI. A transaction with a wrong amount is worse
//! than no transaction.
//!
//! OTP messages return Err(ParserError::SensitiveMessage) immediately —
//! the caller must never store the message body after this error.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;

pub mod category;
pub mod subscription;

// ── Compiled regexes (initialised once at startup) ────────────

/// Amount: Rs.1,250.00 / Rs 500 / INR 1,500 / ₹2000 / INR500
static RE_AMOUNT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)").unwrap()
});

/// Account/card suffix: XX4521 / **** 1234 / ending 7823
static RE_ACCOUNT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:a/c|account|card|ac)[\s:]*(?:[xX*]{2,}|ending\s*)(\d{3,4})").unwrap()
});

/// UPI reference number
static RE_UPI_REF: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:upi\s*ref(?:erence)?|ref(?:erence)?\s*(?:no\.?|#)?|txn\s*id)[:\s]*([A-Z0-9]{8,20})").unwrap()
});

/// Merchant after prepositions
static RE_MERCHANTS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\bat\s+([A-Za-z0-9@.\-_&\s]{3,28}?)(?:\s+on|\s+via|\s+ref|\.|,|$)").unwrap(),
        Regex::new(r"(?i)\bto\s+([A-Za-z0-9@.\-_&\s]{3,28}?)(?:\s+on|\s+via|\s+upi|\.|,|$)").unwrap(),
        Regex::new(r"(?i)\bfor\s+([A-Za-z0-9@.\-_&\s]{3,28}?)(?:\s+on|\s+via|\.|,|$)").unwrap(),
    ]
});

/// Coupon code: alphanum-alphanum-alphanum or letters+digits
static RE_COUPON_CODE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b([A-Z0-9]{3,6}-[A-Z0-9]{3,6}-[A-Z0-9]{2,6}|[A-Z]{3,5}[0-9]{4,8})\b").unwrap()
});

/// Coupon expiry date
static RE_EXPIRY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:valid\s*(?:till|until|upto)|expires?\s*(?:on)?)\s*([\d]{1,2}[-/\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|[\d]{1,2})[-/\s]?[\d]{2,4})").unwrap()
});

// ── Keyword sets ──────────────────────────────────────────────

const DEBIT_WORDS: &[&str] = &[
    "debited", "paid", "sent", "withdrawn", "transaction of",
    "deducted", "spent", "purchase", "charged", "payment of",
    "cash withdrawn", "atm withdrawal", "cash at pos",
];

const CREDIT_WORDS: &[&str] = &[
    "credited", "received", "added", "deposited",
    "transferred to your", "money received", "payment received",
];

const REFUND_WORDS: &[&str] = &[
    "refund", "reversed", "cashback", "reversal",
    "money back", "refunded to", "amount returned",
];

const INVESTMENT_WORDS: &[&str] = &[
    "sip", "mutual fund", "systematic investment",
    "nse", "bse", "demat", "mf purchase",
    "neft to bse", "neft to nse",
];

const SUBSCRIPTION_WORDS: &[&str] = &[
    "subscription", "auto-debit", "standing instruction",
    "recurring", "emi", "auto renewal",
];

/// OTP / PIN — if any of these match, discard immediately.
/// This list is checked BEFORE any other processing.
/// Covers Indian bank SMS patterns extensively.
const OTP_WORDS: &[&str] = &[
    // Generic OTP terms
    "otp", "one time password", "one-time password",
    "do not share", "never share", "don't share",
    "passcode", "verification code", "verify code",
    "auth code", "authentication code", "secret code",
    // Indian bank patterns
    "otp is", "otp for", "your otp", "otp:",
    "pin is", "pin for", "your pin", "new pin",
    "ipin", "mpin", "tpin", "upi pin",
    "transaction password", "login password",
    "generated for your", "valid for",
    "expires in", "do not disclose",
    "pin has been", "generated for",
    // Common prefixes banks use
    "dear customer, your", // often precedes OTP
    "use this code", "enter this code",
    "cvv", "grid value",
    // UPI specific
    "upi id registered", "upi registration",
    "collect request from",
];

/// Non-transactional alerts — skip entirely.
const SKIP_WORDS: &[&str] = &[
    "low balance", "minimum balance", "statement available",
    "account summary", "minimum due", "credit limit",
    "your card has been blocked", "card blocked",
];


/// Scrub PII from merchant name before storing.
/// Removes phone numbers, UPI IDs with phone numbers, email addresses.
pub fn scrub_merchant_pii(merchant: &str) -> String {
    // Remove UPI IDs that contain phone numbers (10 digits @provider)
    let re_upi_phone = regex::Regex::new(r"\d{10}@[a-z]+").unwrap();
    let cleaned = re_upi_phone.replace_all(merchant, "[UPI]");

    // Remove standalone 10-digit phone numbers
    let re_phone = regex::Regex::new(r"\b\d{10}\b").unwrap();
    let cleaned = re_phone.replace_all(&cleaned, "[PHONE]");

    // Remove email addresses
    let re_email = regex::Regex::new(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}").unwrap();
    let cleaned = re_email.replace_all(&cleaned, "[EMAIL]");

    // Remove Aadhaar-like numbers (12 digits)
    let re_aadhaar = regex::Regex::new(r"\b\d{12}\b").unwrap();
    let cleaned = re_aadhaar.replace_all(&cleaned, "[ID]");

    cleaned.trim().to_string()
}

// ── Types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TxnType {
    Debit,
    Credit,
    Refund,
}

impl TxnType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Debit  => "debit",
            Self::Credit => "credit",
            Self::Refund => "refund",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Classification {
    High,
    Medium,
    Low,
    Unclassified,
}

#[derive(Debug, Clone, Serialize)]
pub struct Signal {
    pub label: &'static str,
    pub points: i16,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ParseResult {
    pub score:          i16,
    pub classification: Classification,
    /// Amount in paise. None = could not extract reliably.
    pub amount:   Option<i64>,
    /// None = type could not be determined
    pub txn_type:       Option<TxnType>,
    /// None = merchant name could not be extracted reliably
    pub merchant:       Option<String>,
    /// None = category could not be assigned with confidence
    pub category:       Option<String>,
    /// Last 4 digits only. None = not present in message.
    pub acct_suffix:    Option<String>,
    pub upi_ref:        Option<String>,
    pub is_coupon_refund: bool,
    pub coupon_code:    Option<String>,
    pub expiry_date:    Option<String>,
    pub is_investment:  bool,
    pub is_subscription:bool,
    pub is_cash:        bool,
    pub signals:        Vec<Signal>,
    pub epoch_seconds:  i64,
}

#[derive(Debug, thiserror::Error)]
pub enum ParserError {
    /// Message contains OTP/PIN — must be discarded immediately.
    /// Caller must NOT log the message body anywhere.
    #[error("OTP or sensitive message — discarded")]
    SensitiveMessage,

    /// Non-transactional alert — skip silently.
    #[error("Non-transactional alert — skipped")]
    NonTransactional,
}

// ── Main parser ───────────────────────────────────────────────


/// Scrub PII from merchant names before storing.
/// Removes phone numbers, UPI IDs, email addresses.

pub fn parse(body: &str, source: &str) -> Result<ParseResult, ParserError> {
    let lc = body.to_lowercase();
    let now = chrono::Utc::now().timestamp();

    // ── Step 1: OTP check — exit immediately, no logging ─────
    if OTP_WORDS.iter().any(|w| lc.contains(w)) {
        return Err(ParserError::SensitiveMessage);
    }

    // ── Step 2: Non-transactional skip ────────────────────────
    if SKIP_WORDS.iter().any(|w| lc.contains(w)) {
        return Err(ParserError::NonTransactional);
    }

    let mut score: i16    = 0;
    let mut signals       = Vec::new();
    let mut amount: Option<i64>   = None;
    let mut txn_type:     Option<TxnType> = None;
    let mut merchant:     Option<String> = None;
    let mut acct_suffix:  Option<String> = None;
    let mut upi_ref:      Option<String> = None;
    let mut is_coupon_refund = false;
    let mut coupon_code:  Option<String> = None;
    let mut expiry_date:  Option<String> = None;

    // ── Step 3: Amount (+40) ──────────────────────────────────
    if let Some(cap) = RE_AMOUNT.captures(body) {
        let raw = cap[1].replace(',', "");
        if let Ok(rupees) = raw.parse::<f64>() {
            // Round to paise — no float stored
            let paise = (rupees * 100.0).round() as i64;
            if paise > 0 {
                score += 40;
                amount = Some(paise);
                signals.push(Signal {
                    label: "Amount found",
                    points: 40,
                    value: format!("₹{:.2}", rupees),
                });
            }
        }
    }

    // ── Step 4: Transaction type (+30) ────────────────────────
    if REFUND_WORDS.iter().any(|w| lc.contains(w)) {
        txn_type = Some(TxnType::Refund);
        score += 30;
        signals.push(Signal { label: "Refund keyword", points: 30, value: "refund".into() });
    } else if DEBIT_WORDS.iter().any(|w| lc.contains(w)) {
        txn_type = Some(TxnType::Debit);
        score += 30;
        signals.push(Signal { label: "Debit keyword", points: 30, value: "debit".into() });
    } else if CREDIT_WORDS.iter().any(|w| lc.contains(w)) {
        txn_type = Some(TxnType::Credit);
        score += 30;
        signals.push(Signal { label: "Credit keyword", points: 30, value: "credit".into() });
    }

    // ── Step 5: Account/card suffix (+15) ─────────────────────
    if let Some(cap) = RE_ACCOUNT.captures(body) {
        let suffix = cap[1].to_string();
        // Take last 4 only
        let s = suffix.chars().rev().take(4).collect::<String>()
            .chars().rev().collect::<String>();
        score += 15;
        acct_suffix = Some(s.clone());
        signals.push(Signal { label: "Account/card ref", points: 15, value: format!("XX{}", s) });
    }

    // ── Step 6: UPI reference (+10) ───────────────────────────
    if let Some(cap) = RE_UPI_REF.captures(body) {
        score += 10;
        upi_ref = Some(cap[1].to_string());
        signals.push(Signal { label: "UPI ref", points: 10, value: cap[1].to_string() });
    }

    // ── Step 7: Merchant extraction (+10) ─────────────────────
    for re in RE_MERCHANTS.iter() {
        if let Some(cap) = re.captures(body) {
            let raw = cap[1].trim().to_string();
            if raw.len() >= 3 {
                let normalised = category::normalise_merchant(&raw);
                score += 10;
                merchant = Some(normalised.clone());
                signals.push(Signal { label: "Merchant", points: 10, value: normalised });
                break;
            }
        }
    }

    // ── Step 8: Category assignment ───────────────────────────
    // Only assign if merchant was identified. Empty is better than wrong.
    let category = merchant.as_deref().and_then(category::assign_category);

    // ── Step 9: Coupon detection (informational) ───────────────
    if ["coupon","voucher","promo code","gift card","store credit"].iter()
        .any(|w| lc.contains(w))
    {
        is_coupon_refund = true;
        signals.push(Signal { label: "Coupon/voucher", points: 0, value: "coupon refund".into() });
        if let Some(cap) = RE_COUPON_CODE.captures(body) {
            coupon_code = Some(cap[1].to_string());
        }
        if let Some(cap) = RE_EXPIRY.captures(body) {
            expiry_date = Some(cap[1].to_string());
        }
    }

    // ── Step 10: Investment / subscription flags ───────────────
    let is_investment  = INVESTMENT_WORDS.iter().any(|w| lc.contains(w));
    let is_subscription= SUBSCRIPTION_WORDS.iter().any(|w| lc.contains(w));
    let is_cash        = lc.contains("cash withdrawn") || lc.contains("atm withdrawal")
                      || lc.contains("cash at pos");

    if is_investment   { signals.push(Signal { label: "Investment keyword", points: 0, value: "investment".into() }); }
    if is_subscription { signals.push(Signal { label: "Subscription keyword", points: 0, value: "subscription".into() }); }
    if is_cash         { signals.push(Signal { label: "Cash withdrawal", points: 0, value: "cash".into() }); }

    // ── Step 11: Email source bonus ───────────────────────────
    if source == "email" && score >= 40 {
        score += 5;
        signals.push(Signal { label: "Email source bonus", points: 5, value: "email".into() });
    }

    let classification = classify(score.max(0));

    Ok(ParseResult {
        score: score.max(0),
        classification,
        amount,
        txn_type,
        merchant,
        category: category.map(|s| s.to_string()),
        acct_suffix,
        upi_ref,
        is_coupon_refund,
        coupon_code,
        expiry_date,
        is_investment,
        is_subscription,
        is_cash,
        signals,
        epoch_seconds: now,
    })
}

fn classify(score: i16) -> Classification {
    match score {
        s if s >= 70 => Classification::High,
        s if s >= 40 => Classification::Medium,
        s if s >  0  => Classification::Low,
        _            => Classification::Unclassified,
    }
}

// ── Tests ─────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn otp_message_is_rejected() {
        let msg = "Your OTP is 847291. Do not share with anyone.";
        assert!(matches!(parse(msg, "sms"), Err(ParserError::SensitiveMessage)));
    }

    #[test]
    fn low_balance_alert_is_skipped() {
        let msg = "Low balance alert: your account has Rs.200";
        assert!(matches!(parse(msg, "sms"), Err(ParserError::NonTransactional)));
    }

    #[test]
    fn standard_debit_parses_correctly() {
        let msg = "Rs.1,250.00 debited from A/c XX4521 at SWIGGY on 15-03-26";
        let r = parse(msg, "sms").unwrap();
        assert_eq!(r.amount, Some(125000));
        assert_eq!(r.txn_type, Some(TxnType::Debit));
        assert_eq!(r.acct_suffix, Some("4521".to_string()));
        assert_eq!(r.classification, Classification::High);
    }

    #[test]
    fn upi_payment_parses_correctly() {
        let msg = "INR 499.00 paid via UPI to Netflix India. UPI Ref:412938475. Ac XX9823";
        let r = parse(msg, "sms").unwrap();
        assert_eq!(r.amount, Some(49900));
        assert_eq!(r.txn_type, Some(TxnType::Debit));
        assert_eq!(r.upi_ref, Some("412938475".to_string()));
        assert_eq!(r.classification, Classification::High);
    }

    #[test]
    fn refund_with_coupon_parses_correctly() {
        let msg = "Refund of Rs.349 processed as coupon MYN-X7R2-49 valid till 20 Mar 2026";
        let r = parse(msg, "sms").unwrap();
        assert_eq!(r.txn_type, Some(TxnType::Refund));
        assert!(r.is_coupon_refund);
        assert_eq!(r.coupon_code, Some("MYN-X7R2-49".to_string()));
    }

    #[test]
    fn no_amount_gives_low_confidence() {
        let msg = "Your account was debited at Swiggy";
        let r = parse(msg, "sms").unwrap();
        assert_eq!(r.amount, None);
        assert!(r.score < 70);
    }

    #[test]
    fn merchant_not_guessed_when_ambiguous() {
        let msg = "Rs.500 debited from your account";
        let r = parse(msg, "sms").unwrap();
        // No merchant extracted — correct, don't guess
        assert_eq!(r.merchant, None);
        assert_eq!(r.category, None);
    }

    #[test]
    fn amount_in_paise_not_float() {
        let msg = "Rs.1,499.50 debited from A/c XX1234 at Amazon";
        let r = parse(msg, "sms").unwrap();
        assert_eq!(r.amount, Some(149950)); // exact paise, no float error
    }

    #[test]
    fn sip_flagged_as_investment() {
        let msg = "Rs.5000 debited for SIP towards HDFC Midcap Fund";
        let r = parse(msg, "sms").unwrap();
        assert!(r.is_investment);
    }
}
