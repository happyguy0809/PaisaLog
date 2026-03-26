// src/screens/spend/categories.ts
export const CATS: Record<string, { label: string; icon: string; color: string; match?: string }> = {
  food:          { label: 'Food & Dining',   icon: '🍽', color: '#F59E0B', match: 'swiggy|zomato|food|restaurant|cafe|instamart|swiggylimited|dunzo' },
  groceries:     { label: 'Groceries',       icon: '🛒', color: '#10B981', match: 'blinkit|zepto|bigbasket|grocer|dmart|zeptomarket|zeptomkt' },
  shopping:      { label: 'Shopping',        icon: '🛍', color: '#8B5CF6', match: 'amazon|flipkart|myntra|ajio|meesho|nykaa|tatacliq|snapdeal' },
  transport:     { label: 'Transport',       icon: '🚆', color: '#3B82F6', match: 'uber|ola|irctc|rapido|metro|hppay|petrol|fuel|parking|fastag|nhai' },
  bills:         { label: 'Bills & Utilities',icon: '⚡', color: '#0EA5E9', match: 'electricity|water|gas|bsnl|jio|airtel|bharti|vodafone|bescom|tneb|bses|msedcl|tata power|broadband|dth|dish' },
  entertainment: { label: 'Entertainment',   icon: '🎬', color: '#EC4899', match: 'netflix|hotstar|spotify|prime|youtube|bookmyshow|pvr|inox|zee5|sonyliv' },
  health:        { label: 'Health',          icon: '💊', color: '#EF4444', match: 'pharmacy|apollo|medplus|netmeds|1mg|pharmeasy|practo|hospital|clinic|healthkart' },
  travel:        { label: 'Travel',          icon: '✈',  color: '#06B6D4', match: 'makemytrip|goibibo|cleartrip|hotel|oyo|airasia|indigo|spicejet|redbus' },
  investment:    { label: 'Investments',     icon: '📈', color: '#1A8045', match: 'groww|zerodha|kuvera|sip|mutual|upstox|smallcase|nps|ppf|elss|coin' },
  income:        { label: 'Income',           icon: '💰', color: '#43AA8B', match: 'salary|freelance|transfer|received|payroll|credited by|neft cr|imps cr' },
  home:          { label: 'Home',            icon: '🏠', color: '#84CC16', match: 'rent|maintenance|furniture|ikea|society|housing|pg|hostel' },
  other:         { label: 'Other',           icon: '•',  color: '#9A9A96' },
};

export function getCat(category: string | null, merchant: string | null) {
  if (category && CATS[category]) return { id: category, ...CATS[category] };
  const m = (merchant ?? '').toLowerCase();
  const found = Object.entries(CATS).find(([, v]) =>
    v.match && new RegExp(v.match).test(m)
  );
  return found ? { id: found[0], ...found[1] } : { id: 'other', ...CATS.other };
}
