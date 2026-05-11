export const restaurant = {
  name: "Maison Olivier",
  owner: "Camille Laurent",
};

export const kpis = {
  foodCost: { value: 31.2, prev: 29.8, target: 30 }, // %
  margin: { value: 68.8, prev: 70.2 },
  revenue: { value: 84230, prev: 79120 },
  invoices: { value: 47, prev: 39 },
};

export const marginTrend = [
  { month: "Jan", margin: 71.2, foodCost: 28.8 },
  { month: "Feb", margin: 70.8, foodCost: 29.2 },
  { month: "Mar", margin: 70.5, foodCost: 29.5 },
  { month: "Apr", margin: 69.9, foodCost: 30.1 },
  { month: "May", margin: 70.4, foodCost: 29.6 },
  { month: "Jun", margin: 69.1, foodCost: 30.9 },
  { month: "Jul", margin: 68.8, foodCost: 31.2 },
];

export const topIngredients = [
  { name: "Beef tenderloin", spend: 4820 },
  { name: "Atlantic salmon", spend: 3640 },
  { name: "Burrata", spend: 2110 },
  { name: "Truffle oil", spend: 1890 },
  { name: "Saffron", spend: 1320 },
];

export type Invoice = {
  id: string;
  supplier: string;
  date: string;
  total: number;
  status: "Processed" | "Processing" | "Review";
  items: number;
};

export const invoices: Invoice[] = [
  { id: "INV-2841", supplier: "Boucherie Lafayette", date: "2026-05-08", total: 1284.5, status: "Processed", items: 12 },
  { id: "INV-2840", supplier: "Marée du Jour", date: "2026-05-07", total: 962.1, status: "Processed", items: 8 },
  { id: "INV-2839", supplier: "Fromagerie Alpine", date: "2026-05-06", total: 478.9, status: "Review", items: 6 },
  { id: "INV-2838", supplier: "Maraîcher Bio", date: "2026-05-05", total: 312.4, status: "Processed", items: 21 },
  { id: "INV-2837", supplier: "Caves Vincent", date: "2026-05-03", total: 2104.0, status: "Processing", items: 18 },
  { id: "INV-2836", supplier: "Épicerie Fine", date: "2026-05-02", total: 188.75, status: "Processed", items: 9 },
];

export type Recipe = {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  sold: number;
};

export const recipes: Recipe[] = [
  { id: "r1", name: "Filet Mignon Rossini", category: "Mains", price: 48, cost: 17.4, sold: 142 },
  { id: "r2", name: "Risotto au Safran", category: "Mains", price: 28, cost: 7.1, sold: 211 },
  { id: "r3", name: "Tartare de Saumon", category: "Starters", price: 18, cost: 6.8, sold: 168 },
  { id: "r4", name: "Burrata Pugliese", category: "Starters", price: 16, cost: 5.9, sold: 134 },
  { id: "r5", name: "Tarte Tatin", category: "Desserts", price: 12, cost: 2.4, sold: 198 },
  { id: "r6", name: "Côte de Bœuf 1kg", category: "Mains", price: 86, cost: 38.2, sold: 56 },
];

export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  current: number;
  prev: number;
  supplier: string;
  history: { d: string; p: number }[];
};

const hist = (base: number, pts: number[]) =>
  pts.map((delta, i) => ({ d: `W${i + 1}`, p: +(base * (1 + delta)).toFixed(2) }));

export const ingredients: Ingredient[] = [
  { id: "i1", name: "Beef tenderloin", unit: "kg", current: 42.8, prev: 38.4, supplier: "Boucherie Lafayette", history: hist(38, [0, 0.01, 0.03, 0.04, 0.07, 0.1, 0.126]) },
  { id: "i2", name: "Atlantic salmon", unit: "kg", current: 24.1, prev: 25.6, supplier: "Marée du Jour", history: hist(26, [0, -0.01, -0.02, -0.04, -0.05, -0.06, -0.073]) },
  { id: "i3", name: "Burrata", unit: "pc", current: 4.2, prev: 4.0, supplier: "Fromagerie Alpine", history: hist(4, [0, 0, 0.01, 0.02, 0.03, 0.04, 0.05]) },
  { id: "i4", name: "Saffron", unit: "g", current: 9.8, prev: 8.6, supplier: "Épicerie Fine", history: hist(8.5, [0, 0.02, 0.04, 0.06, 0.09, 0.12, 0.153]) },
  { id: "i5", name: "Truffle oil", unit: "L", current: 86, prev: 82, supplier: "Épicerie Fine", history: hist(82, [0, 0.01, 0.02, 0.03, 0.035, 0.04, 0.049]) },
  { id: "i6", name: "Tomatoes", unit: "kg", current: 3.1, prev: 3.4, supplier: "Maraîcher Bio", history: hist(3.4, [0, 0, -0.02, -0.05, -0.07, -0.08, -0.088]) },
];

export type Alert = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  recipe?: string;
  delta: number;
  time: string;
};

export const alerts: Alert[] = [
  { id: "a1", severity: "high", title: "Beef tenderloin price up 11.5%", detail: "Boucherie Lafayette raised prices this week. Filet Mignon Rossini margin dropped from 64% to 58%.", recipe: "Filet Mignon Rossini", delta: 11.5, time: "2h ago" },
  { id: "a2", severity: "high", title: "Saffron supplier inflation", detail: "Saffron up 15.3% over 6 weeks. Risotto au Safran is now 4 points below target margin.", recipe: "Risotto au Safran", delta: 15.3, time: "6h ago" },
  { id: "a3", severity: "medium", title: "Truffle oil trending up", detail: "Steady 4.9% increase. Consider adjusting menu pricing on signature dishes.", delta: 4.9, time: "1d ago" },
  { id: "a4", severity: "low", title: "Salmon prices easing", detail: "Marée du Jour down 7.3%. Opportunity to expand salmon offering or improve margin.", recipe: "Tartare de Saumon", delta: -7.3, time: "2d ago" },
  { id: "a5", severity: "medium", title: "Burrata creeping up", detail: "Fromagerie Alpine: +5% over the month. Watch starter margins closely.", delta: 5, time: "3d ago" },
];
