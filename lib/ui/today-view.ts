/**
 * TR-Energy Analyst - Bugün kokpiti "Görünüm" seçici (yalnız bölüm sırası; veri ya da yetki değişmez)
 *
 * Aynı uygulama farklı işler için: üretici teklif hazırlar, piyasa analisti fiyata bakar, toplayıcı portföyü izler, yönetim
 * sonuca. Seçim tarayıcıda `localStorage` (kolaylık; kapalı olabilir, her erişim try/catch içinde, yoksa "Üretici").
 */

export type TodaySection = "tomorrow" | "score" | "market" | "alerts" | "portfolio";
export type TodayRole = "producer" | "market" | "aggregator" | "management";

export const ROLES: ReadonlyArray<{ id: TodayRole; label: string; hint: string }> = [
  { id: "producer", label: "Üretici", hint: "Teklif hazırlığı ve üretim tahmini önde" },
  { id: "market", label: "Piyasa", hint: "Fiyat tahmini, karnesi ve piyasa önde" },
  { id: "aggregator", label: "Toplayıcı", hint: "Portföy ve uyarılar önde" },
  { id: "management", label: "Yönetim", hint: "Sonuç, karne ve portföy önde" },
];

export const SECTION_ORDER: Record<TodayRole, TodaySection[]> = {
  producer: ["tomorrow", "market", "score", "alerts", "portfolio"],
  market: ["tomorrow", "score", "market", "alerts", "portfolio"],
  aggregator: ["portfolio", "alerts", "tomorrow", "score", "market"],
  management: ["score", "portfolio", "market", "tomorrow", "alerts"],
};

const KEY = "tre:todayRole";
export const DEFAULT_ROLE: TodayRole = "producer";

export const isRole = (v: unknown): v is TodayRole => ROLES.some((r) => r.id === v);

export function readRole(): TodayRole {
  try {
    const v = window.localStorage.getItem(KEY);
    return isRole(v) ? v : DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}

export function writeRole(role: TodayRole): void {
  try {
    window.localStorage.setItem(KEY, role);
  } catch {
    // saklanamazsa seçim yalnız bu oturumda geçerli
  }
}
