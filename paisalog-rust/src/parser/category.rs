//! Merchant normalisation and category assignment.
//!
//! Rules:
//! - If merchant cannot be identified with confidence, return None
//! - If category cannot be assigned with confidence, return None
//! - Never assign a category based on partial/ambiguous merchant name

use once_cell::sync::Lazy;
use std::collections::HashMap;

// ── Merchant normalisation map ────────────────────────────────
// key = lowercase fragment to match, value = canonical display name
static MERCHANT_MAP: Lazy<Vec<(&'static str, &'static str)>> = Lazy::new(|| {
    vec![
        // Food delivery
        ("swiggy",           "Swiggy"),
        ("zomato",           "Zomato"),
        ("blinkit",          "Blinkit"),
        ("grofers",          "Blinkit"),
        ("zepto",            "Zepto"),
        ("dunzo",            "Dunzo"),
        ("bigbasket",        "BigBasket"),
        // Shopping
        ("amazon",           "Amazon"),
        ("flipkart",         "Flipkart"),
        ("myntra",           "Myntra"),
        ("meesho",           "Meesho"),
        ("nykaa",            "Nykaa"),
        ("ajio",             "Ajio"),
        ("tatacliq",         "Tata CLiQ"),
        ("snapdeal",         "Snapdeal"),
        // Entertainment
        ("netflix",          "Netflix"),
        ("hotstar",          "Hotstar"),
        ("disney",           "Hotstar"),
        ("spotify",          "Spotify"),
        ("youtube premium",  "YouTube Premium"),
        ("jiocinema",        "JioCinema"),
        ("sonyliv",          "SonyLIV"),
        ("zee5",             "ZEE5"),
        // Cinema
        ("pvr",              "PVR Cinemas"),
        ("inox",             "INOX"),
        ("bookmyshow",       "BookMyShow"),
        ("cinepolis",        "Cinépolis"),
        // Transport
        ("uber",             "Uber"),
        ("ola",              "Ola"),
        ("rapido",           "Rapido"),
        ("redbus",           "RedBus"),
        ("irctc",            "IRCTC"),
        ("makemytrip",       "MakeMyTrip"),
        ("goibibo",          "Goibibo"),
        // Health
        ("apollo",           "Apollo Pharmacy"),
        ("pharmeasy",        "PharmEasy"),
        ("1mg",              "1mg"),
        ("netmeds",          "Netmeds"),
        ("practo",           "Practo"),
        ("lybrate",          "Lybrate"),
        // Utilities / Bills
        ("bescom",           "BESCOM"),
        ("tneb",             "TNEB"),
        ("bses",             "BSES"),
        ("airtel",           "Airtel"),
        ("jio",              "Jio"),
        ("vodafone",         "Vodafone"),
        ("bsnl",             "BSNL"),
        ("tata sky",         "Tata Sky"),
        ("dish tv",          "Dish TV"),
        ("d2h",              "Dish TV"),
        ("electricity",      "Electricity Bill"),
        ("water board",      "Water Bill"),
        ("gas",              "Gas Bill"),
        // Finance
        ("hdfc bank",        "HDFC Bank"),
        ("icici bank",       "ICICI Bank"),
        ("axis bank",        "Axis Bank"),
        ("sbi",              "SBI"),
        ("kotak",            "Kotak Bank"),
        ("paytm",            "Paytm"),
        ("phonepe",          "PhonePe"),
        ("google pay",       "Google Pay"),
        ("gpay",             "Google Pay"),
        ("amazon pay",       "Amazon Pay"),
        // Investment
        ("zerodha",          "Zerodha"),
        ("groww",            "Groww"),
        ("upstox",           "Upstox"),
        ("coin",             "Zerodha Coin"),
        ("mirae",            "Mirae Asset"),
        ("sbi mf",           "SBI Mutual Fund"),
        ("hdfc mf",          "HDFC Mutual Fund"),
    ]
});

// ── Category map ──────────────────────────────────────────────
// Maps canonical merchant name → category
static CATEGORY_MAP: Lazy<HashMap<&'static str, &'static str>> = Lazy::new(|| {
    let mut m = HashMap::new();
    // Food
    m.insert("Swiggy",           "food");
    m.insert("Zomato",           "food");
    m.insert("Blinkit",          "groceries");
    m.insert("Zepto",            "groceries");
    m.insert("Dunzo",            "groceries");
    m.insert("BigBasket",        "groceries");
    // Shopping
    m.insert("Amazon",           "shopping");
    m.insert("Flipkart",         "shopping");
    m.insert("Myntra",           "shopping");
    m.insert("Meesho",           "shopping");
    m.insert("Nykaa",            "shopping");
    m.insert("Ajio",             "shopping");
    m.insert("Tata CLiQ",        "shopping");
    m.insert("Snapdeal",         "shopping");
    // Entertainment
    m.insert("Netflix",          "entertainment");
    m.insert("Hotstar",          "entertainment");
    m.insert("Spotify",          "entertainment");
    m.insert("YouTube Premium",  "entertainment");
    m.insert("JioCinema",        "entertainment");
    m.insert("SonyLIV",          "entertainment");
    m.insert("ZEE5",             "entertainment");
    m.insert("PVR Cinemas",      "entertainment");
    m.insert("INOX",             "entertainment");
    m.insert("BookMyShow",       "entertainment");
    m.insert("Cinépolis",        "entertainment");
    // Transport
    m.insert("Uber",             "transport");
    m.insert("Ola",              "transport");
    m.insert("Rapido",           "transport");
    m.insert("RedBus",           "transport");
    m.insert("IRCTC",            "transport");
    m.insert("MakeMyTrip",       "travel");
    m.insert("Goibibo",          "travel");
    // Health
    m.insert("Apollo Pharmacy",  "health");
    m.insert("PharmEasy",        "health");
    m.insert("1mg",              "health");
    m.insert("Netmeds",          "health");
    m.insert("Practo",           "health");
    m.insert("Lybrate",          "health");
    // Utilities
    m.insert("BESCOM",           "bills");
    m.insert("TNEB",             "bills");
    m.insert("BSES",             "bills");
    m.insert("Airtel",           "bills");
    m.insert("Jio",              "bills");
    m.insert("Vodafone",         "bills");
    m.insert("BSNL",             "bills");
    m.insert("Tata Sky",         "bills");
    m.insert("Dish TV",          "bills");
    m.insert("Electricity Bill", "bills");
    m.insert("Water Bill",       "bills");
    m.insert("Gas Bill",         "bills");
    // Investment
    m.insert("Zerodha",          "investment");
    m.insert("Groww",            "investment");
    m.insert("Upstox",           "investment");
    m.insert("Zerodha Coin",     "investment");
    m.insert("Mirae Asset",      "investment");
    m.insert("SBI Mutual Fund",  "investment");
    m.insert("HDFC Mutual Fund", "investment");
    m
});

/// Normalise a raw extracted merchant string to a canonical name.
/// Returns the canonical name if found, or a title-cased version
/// of the input for display. Never returns empty string.
pub fn normalise_merchant(raw: &str) -> String {
    let lower = raw.to_lowercase();

    // Exact match in merchant map
    for (fragment, canonical) in MERCHANT_MAP.iter() {
        if lower.contains(fragment) {
            return canonical.to_string();
        }
    }

    // Fall back: clean up and title-case the raw string
    let cleaned = raw
        .split_whitespace()
        .filter(|w| {
            // Strip noise words
            !matches!(w.to_lowercase().as_str(),
                "pvt" | "ltd" | "private" | "limited" |
                "india" | "technologies" | "tech" | "services")
        })
        .collect::<Vec<_>>()
        .join(" ");

    // Title-case
    cleaned
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().to_string() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(50)
        .collect()
}

/// Assign a category to a canonical merchant name.
/// Returns None if the merchant is not in the category map.
/// Never guesses — empty is better than wrong category.
pub fn assign_category(merchant: &str) -> Option<&'static str> {
    CATEGORY_MAP.get(merchant).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_merchant_normalises() {
        assert_eq!(normalise_merchant("SWIGGY INSTAMART"), "Swiggy");
        assert_eq!(normalise_merchant("netflix india"), "Netflix");
        assert_eq!(normalise_merchant("UBER TECHNOLOGIES"), "Uber");
    }

    #[test]
    fn unknown_merchant_title_cased() {
        let result = normalise_merchant("LOCAL STORE");
        assert_eq!(result, "Local Store");
    }

    #[test]
    fn category_assigned_for_known_merchant() {
        assert_eq!(assign_category("Swiggy"), Some("food"));
        assert_eq!(assign_category("Netflix"), Some("entertainment"));
        assert_eq!(assign_category("Zerodha"), Some("investment"));
    }

    #[test]
    fn category_none_for_unknown_merchant() {
        // Correct — we never guess the category
        assert_eq!(assign_category("Some Unknown Shop"), None);
    }
}
