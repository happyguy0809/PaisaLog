// src/screens/spend/categories.ts
export const CATS: Record<string, { label: string; icon: string; color: string; match?: string }> = {
  food:          { label: 'Food & Dining',   icon: '🍽', color: '#F59E0B', match: 'swiggy|zomato|food|restaurant|cafe' },
  groceries:     { label: 'Groceries',       icon: '🛒', color: '#10B981', match: 'blinkit|zepto|bigbasket|grocer|dmart' },
  shopping:      { label: 'Shopping',        icon: '🛍', color: '#8B5CF6', match: 'amazon|flipkart|myntra|ajio|meesho' },
  transport:     { label: 'Transport',       icon: '🚆', color: '#3B82F6', match: 'uber|ola|irctc|rapido|metro' },
  bills:         { label: 'Bills & Utilities',icon: '⚡', color: '#0EA5E9', match: 'electricity|water|gas|bsnl|jio|airtel' },
  entertainment: { label: 'Entertainment',   icon: '🎬', color: '#EC4899', match: 'netflix|hotstar|spotify|prime|youtube' },
  health:        { label: 'Health',          icon: '💊', color: '#EF4444', match: 'pharmacy|apollo|medplus|netmeds|1mg' },
  travel:        { label: 'Travel',          icon: '✈',  color: '#06B6D4', match: 'makemytrip|goibibo|cleartrip|hotel' },
  investment:    { label: 'Investments',     icon: '📈', color: '#1A8045', match: 'groww|zerodha|kuvera|sip|mutual' },
  income:        { label: 'Income',           icon: '💰', color: '#43AA8B', match: 'salary|freelance|transfer|received' },
  home:          { label: 'Home',            icon: '🏠', color: '#84CC16', match: 'rent|maintenance|furniture|ikea' },
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
