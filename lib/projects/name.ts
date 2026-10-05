/**
 * TR-Energy Analyst - Proje adı
 *
 * Proje adı rapor kapağında, dosya adında ve proje kartında görünür. Ad oluşturulurken ve sonradan değiştirilirken aynı
 * kural: baştaki/sondaki boşluk atılır, art arda boşluklar teke iner, boş olamaz, en çok PROJECT_NAME_MAX karakter.
 */

export const PROJECT_NAME_MAX = 120;

export function normalizeProjectName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Proje adı metin olmalı." };
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value) return { ok: false, error: "Proje adı zorunludur." };
  if (value.length > PROJECT_NAME_MAX) return { ok: false, error: `Proje adı en çok ${PROJECT_NAME_MAX} karakter olabilir.` };
  return { ok: true, value };
}
