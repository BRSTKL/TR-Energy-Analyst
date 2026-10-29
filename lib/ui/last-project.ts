/**
 * TR-Energy Analyst - son açılan proje (yalnız kolaylık: menüdeki "Üretim tahmini" bağlantısı onun tahminine gider)
 *
 * Tarayıcıda `localStorage`; kapalı ya da dolu olabilir, her erişim try/catch içinde ve yokluğunda menü `/projects`'e düşer.
 */

const KEY = "tre:lastProject";
export const LAST_PROJECT_EVENT = "tre:lastProject";

export function readLastProject(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && /^[\w-]{1,64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeLastProject(id: string): void {
  try {
    if (window.localStorage.getItem(KEY) === id) return;
    window.localStorage.setItem(KEY, id);
    window.dispatchEvent(new Event(LAST_PROJECT_EVENT));
  } catch {
    // saklanamazsa menü varsayılana düşer
  }
}

/** Menüdeki Üretim tahmini bağlantısı: son proje varsa onun tahmini, yoksa proje listesi */
export function forecastHref(lastProject: string | null): string {
  return lastProject ? `/projects/${lastProject}/forecast` : "/projects";
}
