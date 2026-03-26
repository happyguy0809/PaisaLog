//! Parser integration tests.
//!
//! Each test case represents a real bank SMS format from an Indian bank.
//! If a test fails, it means a real user's transaction will be missed.

use paisalog::parser::{parse, Classification, ParserError, TxnType};

// ── Safety tests — must never fail ───────────────────────────

#[test]
fn otp_is_always_rejected() {
    let samples = vec![
        "Your OTP is 847291. Do not share with anyone.",
        "738291 is your SBI OTP. Valid 10 min.",
        "Use OTP 123456 to complete your transaction.",
        "One Time Password: 998811 for your HDFC account.",
        "Your verification code is 445566. Never share this.",
    ];
    for msg in samples {
        assert!(
            matches!(parse(msg, "sms"), Err(ParserError::SensitiveMessage)),
            "OTP not rejected: {}",
            msg
        );
    }
}

#[test]
fn non_transactional_alerts_are_skipped() {
    let samples = vec![
        "Low balance alert: Rs.200 remaining in your account.",
        "Your minimum balance requirement is Rs.10,000.",
        "Monthly account statement is available.",
    ];
    for msg in samples {
        assert!(
            matches!(parse(msg, "sms"), Err(ParserError::NonTransactional)),
            "Alert not skipped: {}",
            msg
        );
    }
}

// ── Amount accuracy — amounts must be exact ───────────────────

#[test]
fn amount_with_comma_separator() {
    let r = parse("Rs.1,250.00 debited from A/c XX4521 at SWIGGY", "sms").unwrap();
    assert_eq!(r.amount_paise, Some(125000));
}

#[test]
fn amount_without_decimal() {
    let r = parse("INR 500 paid via UPI to Zomato", "sms").unwrap();
    assert_eq!(r.amount_paise, Some(50000));
}

#[test]
fn amount_with_rupee_symbol() {
    let r = parse("₹2,399 debited at Amazon", "sms").unwrap();
    assert_eq!(r.amount_paise, Some(239900));
}

#[test]
fn amount_odd_paise() {
    let r = parse("Rs.1,499.50 debited from card at Myntra", "sms").unwrap();
    assert_eq!(r.amount_paise, Some(149950));
}

#[test]
fn large_amount() {
    let r = parse("Rs.12,450.00 debited towards credit card bill", "sms").unwrap();
    assert_eq!(r.amount_paise, Some(1245000));
}

// ── Transaction type detection ────────────────────────────────

#[test]
fn debit_keyword_variants() {
    for (msg, expected) in &[
        ("Rs.500 debited from account", TxnType::Debit),
        ("Rs.500 paid via UPI",         TxnType::Debit),
        ("Rs.500 withdrawn at ATM",     TxnType::Debit),
        ("Transaction of Rs.500 at Amazon", TxnType::Debit),
    ] {
        let r = parse(msg, "sms").unwrap();
        assert_eq!(r.txn_type.as_ref(), Some(expected), "Failed for: {}", msg);
    }
}

#[test]
fn credit_keyword_variants() {
    for msg in &[
        "Rs.500 credited to your account",
        "INR 1000 received from Rahul",
        "Amount of Rs.200 added to your account",
    ] {
        let r = parse(msg, "sms").unwrap();
        assert_eq!(r.txn_type, Some(TxnType::Credit), "Failed for: {}", msg);
    }
}

#[test]
fn refund_keyword_variants() {
    for msg in &[
        "Refund of Rs.349 processed from Zomato",
        "Rs.100 cashback credited to your account",
        "Amount reversed: Rs.250",
    ] {
        let r = parse(msg, "sms").unwrap();
        assert_eq!(r.txn_type, Some(TxnType::Refund), "Failed for: {}", msg);
    }
}

// ── Merchant extraction ───────────────────────────────────────

#[test]
fn merchant_extracted_from_at_preposition() {
    let r = parse("Rs.1250 debited from A/c XX4521 at SWIGGY on 15-03-26", "sms").unwrap();
    assert_eq!(r.merchant.as_deref(), Some("Swiggy"));
}

#[test]
fn merchant_extracted_from_to_preposition() {
    let r = parse("INR 499 paid via UPI to Netflix India", "sms").unwrap();
    assert_eq!(r.merchant.as_deref(), Some("Netflix"));
}

#[test]
fn no_merchant_when_ambiguous() {
    // "account" after "to" is not a merchant
    let r = parse("Rs.500 debited from your account", "sms").unwrap();
    assert_eq!(r.merchant, None);
}

// ── Category: empty is better than wrong ─────────────────────

#[test]
fn category_assigned_for_known_merchant() {
    let r = parse("Rs.850 debited at UBER", "sms").unwrap();
    assert_eq!(r.merchant.as_deref(), Some("Uber"));
    assert_eq!(r.category, Some("transport"));
}

#[test]
fn category_none_for_unknown_merchant() {
    let r = parse("Rs.500 debited at LOCAL KIRANA STORE", "sms").unwrap();
    assert_eq!(r.category, None); // correct — we don't guess
}

// ── Special transaction types ─────────────────────────────────

#[test]
fn sip_flagged_as_investment() {
    let r = parse("Rs.5000 debited for SIP - HDFC Midcap Opp Fund", "sms").unwrap();
    assert!(r.is_investment);
}

#[test]
fn atm_withdrawal_flagged_as_cash() {
    let r = parse("Rs.2000 withdrawn at ATM", "sms").unwrap();
    assert!(r.is_cash);
    assert_eq!(r.txn_type, Some(TxnType::Debit));
}

#[test]
fn nach_debit_flagged_as_subscription() {
    let r = parse("NACH DEBIT Rs.499 for Netflix subscription", "sms").unwrap();
    assert!(r.is_subscription);
}

// ── Coupon refund ─────────────────────────────────────────────

#[test]
fn coupon_refund_with_code_and_expiry() {
    let r = parse(
        "Refund of Rs.349 as coupon MYN-X7R2-49 valid till 20 Mar 2026",
        "sms"
    ).unwrap();
    assert_eq!(r.txn_type, Some(TxnType::Refund));
    assert!(r.is_coupon_refund);
    assert_eq!(r.coupon_code.as_deref(), Some("MYN-X7R2-49"));
    assert!(r.expiry_date.is_some());
}

// ── Confidence scoring ────────────────────────────────────────

#[test]
fn full_sms_gets_high_confidence() {
    // Has: amount(40) + type(30) + acct(15) + merchant(10) = 95
    let r = parse(
        "Rs.1,250.00 debited from A/c XX4521 at SWIGGY on 15-03-26. Avl Bal:Rs.45,230.10",
        "sms"
    ).unwrap();
    assert_eq!(r.classification, Classification::High);
    assert!(r.score >= 70);
}

#[test]
fn no_amount_gives_low_confidence() {
    let r = parse("Debited at Amazon. Avl Bal:Rs.10,000", "sms").unwrap();
    assert_eq!(r.amount_paise, None);
    assert!(r.score < 70);
}

#[test]
fn account_suffix_is_max_4_digits() {
    let r = parse("Rs.500 debited from A/c XX123456789", "sms").unwrap();
    if let Some(suffix) = r.acct_suffix {
        assert!(suffix.len() <= 4, "Suffix too long: {}", suffix);
    }
}

// ── Email source bonus ────────────────────────────────────────

#[test]
fn email_source_gets_score_bonus() {
    let sms_score   = parse("Rs.500 debited from A/c XX4521 at Swiggy", "sms").unwrap().score;
    let email_score = parse("Rs.500 debited from A/c XX4521 at Swiggy", "email").unwrap().score;
    assert!(email_score > sms_score);
}
