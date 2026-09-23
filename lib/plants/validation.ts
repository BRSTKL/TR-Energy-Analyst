/**
 * Santral tanımı doğrulaması: proje oluşturma, santral ekleme ve santral düzenleme aynı kuralları kullanır.
 * - ad zorunlu ve proje içinde benzersiz (büyük/küçük harf duyarsız, Türkçe kurallarıyla)
 * - tür RES, HES veya GES
 * - kurulu güç 0'dan büyük
 */

export const PLANT_TYPES = ["RES", "HES", "GES"] as const;
export type PlantType = (typeof PLANT_TYPES)[number];

export interface PlantInput {
  name: string;
  type: PlantType;
  capacityMw: number;
}

export const plantNameKey = (name: string) => name.trim().toLocaleLowerCase("tr-TR");

/**
 * Tek bir santral tanımını doğrular.
 * @param takenNames Projede zaten kullanılan adların plantNameKey değerleri (düzenlenen santralin kendi adı hariç)
 */
export function validatePlantInput(
  raw: unknown,
  takenNames: Set<string>
): { ok: true; value: PlantInput } | { ok: false; error: string } {
  const pl = (raw ?? {}) as Record<string, unknown>;
  const name = typeof pl.name === "string" ? pl.name.trim() : "";
  const type = typeof pl.type === "string" ? pl.type.toUpperCase() : "";
  const capacityMw = Number(pl.capacityMw);

  if (!name) return { ok: false, error: "santral adı zorunlu" };
  if (takenNames.has(plantNameKey(name))) {
    return { ok: false, error: `"${name}" adı bu projede zaten kullanılıyor` };
  }
  if (!(PLANT_TYPES as readonly string[]).includes(type)) return { ok: false, error: "tür RES, HES veya GES olmalı" };
  if (!Number.isFinite(capacityMw) || capacityMw <= 0) return { ok: false, error: "kurulu güç 0'dan büyük olmalı" };

  return { ok: true, value: { name, type: type as PlantType, capacityMw } };
}

/**
 * Kayıtlı kolon eşleştirme şablonundan (JSON: santral id → eşleştirme) bir santrali çıkarır.
 * Şablon boşalırsa null döner.
 */
export function removePlantFromTemplate(template: string | null, plantId: string): string | null {
  if (!template) return null;
  try {
    const parsed = JSON.parse(template) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || !(plantId in parsed)) return template;
    delete parsed[plantId];
    return Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : null;
  } catch {
    return template;
  }
}
