// src/screens/spend/categories.ts
// Category keys are the single source of truth (Belief 13).
// DB stores keys only. getCat() derives label/icon/color for display.
// getCat() accepts optional smsBody for context-aware categorization —
// this prevents merchant-name-only misclassification (e.g. Zomato District).

export const CATS: Record<string, { label: string; icon: string; color: string; match?: string }> = {
  food:          { label: 'Food & Dining',    icon: '🍽',  color: '#F59E0B', match: 'swiggy|zomato|food|restaurant|cafe|instamart|swiggylimited|dunzo|barbeque|dominos|kfc|mcdonalds|starbucks|subway|burger' },
  groceries:     { label: 'Groceries',        icon: '🛒',  color: '#10B981', match: 'blinkit|zepto|bigbasket|grocer|dmart|zeptomarket|zeptomkt|jiomart|naturebasket|milkbasket|supermart' },
  shopping:      { label: 'Shopping',         icon: '🛍',  color: '#8B5CF6', match: 'amazon|flipkart|myntra|ajio|meesho|nykaa|tatacliq|snapdeal|firstcry|limeroad|bewakoof|shopsy' },
  transport:     { label: 'Transport',        icon: '🚆',  color: '#3B82F6', match: 'uber|ola\b|rapido|metro|hppay|petrol|fuel|parking|fastag|nhai|irctc|yulu|bounce|bike.taxi' },
  bills:         { label: 'Bills & Utilities', icon: '⚡', color: '#0EA5E9', match: 'electricity|water.*board|gas.*bill|bsnl|jio\b|airtel|bharti|vodafone|bescom|tneb|bses|msedcl|tata.*power|broadband|dth|dish.*tv|tatasky|recharge' },
  entertainment: { label: 'Entertainment',    icon: '🎬',  color: '#EC4899', match: 'netflix|hotstar|spotify|prime.*video|youtube.*premium|bookmyshow|pvr|inox|zee5|sonyliv|jiocinema|apple.*tv|mxplayer' },
  health:        { label: 'Health',           icon: '💊',  color: '#EF4444', match: 'pharmacy|apollo|medplus|netmeds|1mg|pharmeasy|practo|hospital|clinic|healthkart|diagnostic|pathlab|tata.*health' },
  travel:        { label: 'Travel',           icon: '✈',   color: '#06B6D4', match: 'makemytrip|goibibo|cleartrip|hotel|oyo|airasia|indigo|spicejet|redbus|easemytrip|ixigo|airbnb|treebo' },
  investment:    { label: 'Investments',      icon: '📈',  color: '#1A8045', match: 'groww|zerodha|kuvera|upstox|smallcase|nps\b|ppf\b|elss|coin\b|paytm.*money|icicidirect|hdfcsec|angels.*broking|motilal' },
  income:        { label: 'Income',           icon: '💰',  color: '#43AA8B', match: 'salary|payroll|credited.*by|neft.*cr|imps.*cr|freelance.*credit' },
  home:          { label: 'Home & Rent',      icon: '🏠',  color: '#84CC16', match: 'rent|maintenance|society|housing|pg\b|hostel|ikea|pepperfry|urban.*ladder|livspace' },
  services:      { label: 'Services',         icon: '🔧',  color: '#F97316', match: 'urban.*clap|housejoy|sulekha|justdial|taskbob|onsitego|extended.*warranty|insurance.*premium|lic\b|hdfc.*life|icici.*pru|bajaj.*allianz|star.*health' },
  fees:          { label: 'Fees & Charges',   icon: '🏦',  color: '#6B7280', match: 'annual.*fee|joining.*fee|processing.*fee|late.*payment|emi.*bounce|cheque.*bounce|penal|interest.*charged|gst.*on' },
  transfer:      { label: 'Transfer',         icon: '↔',   color: '#94A3B8', match: '' },
  other:         { label: 'Other',            icon: '•',   color: '#9A9A96' },
};

// SMS body keywords that OVERRIDE merchant-based category
// Used to catch cases like "Zomato District" (shopping, not food)
const BODY_OVERRIDES: Array<[RegExp, string]> = [
  // Zomato/Swiggy non-food products
  [/zomato.*district|district.*zomato/i,                            'shopping'],
  [/swiggy.*genie|swiggy.*minis/i,                                  'shopping'],
  // Delivery of non-food items
  [/delivered.*order|order.*delivered|order.*confirmed/i,           'shopping'],
  // Bill payments via wallet/app — context matters
  [/electricity.*bill|power.*bill|bescom|tneb|msedcl/i,             'bills'],
  [/mobile.*recharge|dth.*recharge|prepaid.*recharge/i,             'bills'],
  // Insurance premium
  [/insurance.*premium|premium.*paid.*policy/i,                     'services'],
  // EMI
  [/emi.*debit|emi.*paid|loan.*emi/i,                               'fees'],
  // ATM / cash
  [/atm.*withdrawal|cash.*withdrawal|cash.*at.*pos/i,               'other'],
  // Transfer between own accounts
  [/self.*transfer|transfer.*to.*self|own.*account/i,               'transfer'],
];

export function getCat(
  category:    string | null,
  merchant:    string | null,
  smsBody?:    string,      // raw SMS body for context override
) {
  // 1. DB-stored category wins if valid
  if (category && CATS[category]) return { id: category, ...CATS[category] };

  // 2. Body-based override — check before merchant match
  //    Prevents misclassification when merchant operates in multiple LOBs
  if (smsBody) {
    for (const [re, cat] of BODY_OVERRIDES) {
      if (re.test(smsBody)) return { id: cat, ...CATS[cat] };
    }
  }

  // 3. Merchant-name match
  const m = (merchant ?? '').toLowerCase();
  if (m) {
    const found = Object.entries(CATS).find(([key, v]) =>
      key !== 'other' && key !== 'transfer' && v.match &&
      new RegExp(v.match, 'i').test(m)
    );
    if (found) return { id: found[0], ...found[1] };
  }

  return { id: 'other', ...CATS.other };
}

// All valid category keys for dropdowns and validation
export const CATEGORY_KEYS = Object.keys(CATS).filter(k => k !== 'other');
