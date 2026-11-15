/**
 * TR-Energy Analyst - Dengeden sorumlu grup (DSG) temsilcileriyle ad eşleşmesi (SAF; 15.11.2026 denetimi)
 *
 * EPİAŞ DSG üyelerini yayımlamaz; yalnız grubun mali sorumluluğunu üstlenen temsilci şirketlerin listesini yayımlar
 * (`/markets/imbalance/data/dsg-organization-list`, 15.11.2026'da 29 şirket). Projedeki bir şirketin adı bir temsilcinin
 * ayırt edici ilk kelimesiyle başlıyorsa (ör. "BİLGİN GÜÇ SANTRALLERİ" ↔ "BİLGİN GRUBU TOPTAN ELEKTRİK SATIŞI") şirket
 * büyük olasılıkla zaten o grupta: DSG sayfasının gösterdiği fayda yeni değil, alınıyor olabilir. Ad eşleşmesi kanıt
 * değildir; yalnız uyarıdır.
 */

export interface DsgLeader {
  organizationId: number;
  name: string;
}

/** Ayırt edici olmayan ilk kelimeler (perakende lisans ön ekleri ve genel sözcükler) */
const GENERIC = new Set(["K1", "K2", "K3", "ELEKTRİK", "ENERJİ", "TÜRKİYE", "TURKIYE", "ANADOLU", "İSTANBUL"]);

const firstWord = (name: string) => {
  const words = name.toLocaleUpperCase("tr-TR").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  const w = words.find((x) => !GENERIC.has(x));
  return w && w.length >= 4 ? w : null;
};

/** Temsilci → adı aynı ilk kelimeyle başlayan proje şirketleri (eşleşme yoksa boş) */
export function likelyExistingDsg(companyNames: string[], leaders: DsgLeader[]): Array<{ leader: string; companies: string[] }> {
  const out: Array<{ leader: string; companies: string[] }> = [];
  for (const l of leaders) {
    const key = firstWord(l.name);
    if (!key) continue;
    const companies = companyNames.filter((c) => firstWord(c) === key);
    if (companies.length) out.push({ leader: l.name, companies });
  }
  return out;
}
