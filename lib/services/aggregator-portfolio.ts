/**
 * TR-Energy Analyst - Toplayıcı portföyünün teknoloji dağılımı (rapor kapak ve kapsam cümlesi)
 *
 * Portföy toplayıcı seçildiği an kaydedilir ve tür santral adından tahmin edilir: adında HES geçmeyen hidro santraller
 * ("Erfelek", "Kayalık") "diğer" sayılıyordu (Gain kapağı: 29 hidro, 6 rüzgâr, 5 diğer; gerçekte 32 / 6 / 2). Veri
 * havuzunda tür UEVM kaynak kırılımından bilinir (kıyas ve sektör karnesiyle aynı sınıflandırma); listedeki her santralin
 * türü havuzda varsa dağılım oradan sayılır, biri bile eksikse kaydedilen tahmin korunur.
 */
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { parseAggregatorPortfolio, type AggregatorPortfolio } from "@/lib/projects/aggregator";

export async function refinePortfolioTypes(p: AggregatorPortfolio | null): Promise<AggregatorPortfolio | null> {
  if (!p || p.plantIds.length === 0) return p;
  const infos = await Promise.all(p.plantIds.map((id) => readPoolPlantInfo(id).catch(() => null)));
  const byType: Record<string, number> = {};
  for (const info of infos) {
    const t = info?.type ?? (info?.kind === "OTHER" ? "OTHER" : null);
    if (!t) return p;
    byType[t] = (byType[t] ?? 0) + 1;
  }
  return { ...p, byType };
}

/** Kayıtlı portföy JSON'u → türleri havuzdan düzeltilmiş portföy */
export const loadAggregatorPortfolio = (raw: string | null | undefined) => refinePortfolioTypes(parseAggregatorPortfolio(raw));
