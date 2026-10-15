/**
 * TR-Energy Analyst - Kör doğrulama paketi (PLAN, Bekleyen işler: kalibrasyon)
 *
 * Şirketten veri istemeden raporun gerçeğe yakınlığını ölçmek için: bir ay için, açık veriyle hesapladığımız uzlaştırma
 * tutarlarını tek sayfada göstermek; şirket yalnız "faturanızla fark hangi aralıkta?" sorusunu cevaplar.
 *
 * Dengesizlik EPİAŞ'ta piyasa katılımcısı (uzlaştırma birimi) bazında faturalanır: birim sonuç sayfasıyla aynı (şirket;
 * toplayıcıda toplayıcı). Pozisyon vekili son KGÜP'tür (fatura gün içi işlemlerden sonraki pozisyona göre); son planı
 * olmayan saatte ilk KGÜP. Fiyatlar projenin profiliyle (mevzuat profilinde EPİAŞ'ın resmi dengesizlik fiyatları).
 * KÜPST santral bazında; toplayıcıda topluluk bazında (EPDK 14029 md. 4).
 * Tutarlar: alacak = pozitif dengesizlik × pozitif fiyat, borç = negatif dengesizlik × negatif fiyat (PYS bildirimindeki
 * gibi); maliyet = PTF'den satılsaydı farka göre (uygulamanın ana ölçüsü).
 */

import { pricedMarket, processHourlyRecord } from "@/lib/calculations/engine";
import { kupstCommunityTotal, kupstTotal } from "@/lib/calculations/kupst";
import type { HourlyResult, MarketPriceRecord } from "@/lib/calculations/types";
import { settleByCompanyGroups } from "@/lib/report/plant-report";
import { loadProjectHourly } from "@/lib/services/project-hourly";

export interface ValidationPlant {
  name: string;
  epiasPlantId: number | null;
  type: string;
  uevmMwh: number;
  firstPlanMwh: number;
  finalPlanMwh: number;
  /** Santral bazında KÜPST (TL); toplayıcıda bilgi amaçlı (fatura topluluk bazında) */
  kupstTl: number;
}

export interface ValidationUnit {
  key: string;
  name: string;
  /** Toplayıcı portföyü mü (KÜPST topluluk bazında) */
  aggregator: boolean;
  plants: ValidationPlant[];
  hours: number;
  /** Son planı olan santral-saat payı (%) */
  finalPlanCoveragePct: number;
  uevmMwh: number;
  positiveMwh: number;
  negativeMwh: number;
  receivableTl: number;
  payableTl: number;
  netAmountTl: number;
  imbalanceCostTl: number;
  kupstTl: number;
}

export interface ValidationPack {
  project: { id: string; name: string };
  month: string;
  months: string[];
  units: ValidationUnit[];
  /** Fiyat kaynağı: resmi dengesizlik fiyatı olan saat payı (%) */
  officialPriceSharePct: number;
}

const monthOf = (t: Date | string) => new Date(t).toISOString().slice(0, 7);

export async function projectValidationPack(projectId: string, month?: string | null): Promise<ValidationPack | { error: string }> {
  const data = await loadProjectHourly(projectId);
  if (!data) return { error: "Proje bulunamadı." };
  const withData = data.plants.filter((p) => p.hourly.length > 0);
  if (!withData.length) return { error: "Projede saatlik veri yok." };
  const months = Array.from(new Set(withData.flatMap((p) => p.hourly.map((h) => monthOf(h.timestamp))))).sort();
  const m = month && months.includes(month) ? month : months[months.length - 1];

  // Ayın saatleri; pozisyon son KGÜP (yoksa ilk)
  const inMonth = withData.map((p) => {
    const hourly = p.hourly.filter((h) => monthOf(h.timestamp) === m);
    const final = hourly.map((h: HourlyResult) =>
      processHourlyRecord(
        { timestamp: h.timestamp, actualMwh: h.actualMwh, forecastMwh: h.forecastFinalMwh ?? h.forecastMwh, forecastFinalMwh: h.forecastFinalMwh },
        pricedMarket(h) as MarketPriceRecord,
        data.profile
      )
    );
    return { plant: p, hourly, final };
  });

  const aggregator = !!data.aggregator;
  const groups = settleByCompanyGroups(
    inMonth.map((x) => ({ plantId: x.plant.plantId, organizationId: x.plant.organizationId, hourly: x.final })),
    data.profile
  );
  const unitKeyOf = (p: (typeof withData)[number]) => (p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`);
  let official = 0;
  let allHours = 0;
  const units: ValidationUnit[] = groups.map((g) => {
    const members = inMonth.filter((x) => unitKeyOf(x.plant) === g.key);
    let pos = 0;
    let neg = 0;
    let rec = 0;
    let pay = 0;
    let cost = 0;
    for (const h of g.hourly) {
      if (h.imbalanceMwh > 0) pos += h.imbalanceMwh;
      else neg -= h.imbalanceMwh;
      if (h.imbalanceAmount > 0) rec += h.imbalanceAmount;
      else pay -= h.imbalanceAmount;
      cost += h.imbalanceCost;
      allHours++;
      if (h.imbalancePosPrice != null && h.imbalanceNegPrice != null) official++;
    }
    let total = 0;
    let withFinal = 0;
    for (const x of members)
      for (const h of x.hourly) {
        total++;
        if (h.forecastFinalMwh !== null && h.forecastFinalMwh !== undefined) withFinal++;
      }
    const plants: ValidationPlant[] = members.map((x) => ({
      name: x.plant.plantName,
      epiasPlantId: x.plant.epiasPlantId,
      type: x.plant.plantType,
      uevmMwh: x.hourly.reduce((a, h) => a + h.actualMwh, 0),
      firstPlanMwh: x.hourly.reduce((a, h) => a + h.forecastMwh, 0),
      finalPlanMwh: x.hourly.reduce((a, h) => a + (h.forecastFinalMwh ?? h.forecastMwh), 0),
      kupstTl: kupstTotal(x.hourly, x.plant.plantType),
    }));
    const kupst = aggregator
      ? kupstCommunityTotal(members.map((x) => ({ hourly: x.hourly, plantType: x.plant.plantType, capacityMw: x.plant.capacityMw })))
      : plants.reduce((a, p) => a + p.kupstTl, 0);
    const first = members[0]?.plant;
    const name = aggregator ? data.aggregator!.name : first?.organizationId !== null ? first?.organizationName ?? g.key : first?.plantName ?? g.key;
    return {
      key: g.key,
      name: name ?? g.key,
      aggregator,
      plants: plants.sort((a, b) => b.uevmMwh - a.uevmMwh),
      hours: g.hourly.length,
      finalPlanCoveragePct: total > 0 ? (withFinal / total) * 100 : 0,
      uevmMwh: plants.reduce((a, p) => a + p.uevmMwh, 0),
      positiveMwh: pos,
      negativeMwh: neg,
      receivableTl: rec,
      payableTl: pay,
      netAmountTl: rec - pay,
      imbalanceCostTl: cost,
      kupstTl: kupst,
    };
  });

  return {
    project: data.project,
    month: m,
    months,
    units: units.sort((a, b) => b.uevmMwh - a.uevmMwh),
    officialPriceSharePct: allHours > 0 ? (official / allHours) * 100 : 0,
  };
}
