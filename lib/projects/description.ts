/**
 * TR-Energy Analyst - Proje açıklaması
 *
 * Eski sürümler EPİAŞ'tan eklenen santrallerin kaynak bilgisini proje açıklamasına not olarak ekliyordu:
 *   "EPİAŞ açık verisi: KGÜP ilk versiyon (plan) ve UEVM (gerçekleşen). Santral kimliği 7663, UEVÇB 1235449."
 *   "EPİAŞ: KORU RES: KGÜP ilk versiyon (plan) ve UEVM (gerçekleşen). Santral kimliği 9083, UEVÇB 3223551."
 * Bu bilgi artık santral kaydında tutulur (epiasPlantId, kgupVersion, uevcbIds). Bu modül açıklamayı kullanıcının
 * yazdığı metin ile teknik notlara ayırır: ekranlar yalnızca metni gösterir, geçiş betiği notları santrallere taşır.
 */

export interface EpiasSourceNote {
  /** Çok santralli biçimde santral adı; tek santralli eski biçimde null */
  plantName: string | null;
  kgupVersion: "FIRST" | "FINAL" | null;
  powerPlantId: number | null;
  uevcbIds: number[];
}

const NOTE = /(EPİAŞ açık verisi:|EPİAŞ: ([^:\n]+?):)\s*KGÜP(?: (ilk|son) versiyon)? \(plan\) ve UEVM \(gerçekleşen\)\.\s*Santral kimliği (\d+|\?), UEVÇB ([\d, ?]+)\./g;

export function splitProjectDescription(description: string | null | undefined): { text: string; notes: EpiasSourceNote[] } {
  if (!description) return { text: "", notes: [] };
  const notes: EpiasSourceNote[] = [];
  const text = description
    .replace(NOTE, (_m, _head, name: string | undefined, version: string | undefined, id: string, uevcb: string) => {
      notes.push({
        plantName: name?.trim() ?? null,
        kgupVersion: version === "son" ? "FINAL" : version === "ilk" ? "FIRST" : null,
        powerPlantId: /^\d+$/.test(id) ? Number(id) : null,
        uevcbIds: uevcb
          .split(",")
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
      });
      return "";
    })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return { text, notes };
}

/** Ekranda gösterilecek açıklama: teknik notlar ayıklanmış kullanıcı metni (yoksa boş) */
export const displayDescription = (description: string | null | undefined) => splitProjectDescription(description).text;
