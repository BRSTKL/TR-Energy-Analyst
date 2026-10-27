/**
 * TR-Energy Analyst - Teklif öncesi karar sayfası: sinyal kuralları (ÖNİZLEME; saf, I/O yok)
 *
 * Önizleme ekranındaki verileri (model çıktısı, bağlam kartları, etki ölçümü) sade bir özete çevirir: bir başlık şeridi ve
 * her veri için tek satırlık bir sinyal kartı. Her kartın üç parçası var:
 *   yön       : fiyatı yukarı iten (up), aşağı iten (down), nötr (flat) ya da yalnız bilgi (info). Yön, aşağıdaki sayısal
 *               eşiklerle verilir (BRIEF_RULES); eşik tahmin değil, "normalden belirgin sapma var mı" sorusudur.
 *   kanıt     : veri fiyat tahminini KURUYOR mu (model), modele eklenince ÖLÇÜLDÜ mü ve sonuç ne (tested-*), yoksa hiç ölçülmedi mi
 *               (untested). Ölçümde şanstan ayırt edilemeyen veri "etkisi görünmüyor" diye işaretlenir: yön oku bağlamdır, kanıt değil.
 *   cümle     : düz Türkçe, sayıyla.
 * Sayfa al / sat tavsiyesi vermez; ne göründüğünü söyler.
 */

import { DAY_CLASS_LABEL } from "./daily-market";
import type { EffectId } from "./pre-bid-effects";
import type { PreBidView } from "./pre-bid";
import type { PriceLimit } from "./price-limit";
import type { PreBidContext } from "@/lib/services/pre-bid-context";
import type { PreBidEffects } from "@/lib/services/pre-bid-effects";

/** Yön eşikleri: bunların içi "nötr" */
export const BRIEF_RULES = {
  /** Net yük ve dünkü artık: ortalama katkı (TL/MWh) */
  contributionTl: 50,
  /** Doğal gaz: son 28 gün ortancasına göre değişim (%) */
  gasPct: 5,
  /** GÖP satış/alış teklif oranı: aynı saatin 28 gün ortancasına göre ortalama sapma (%) */
  bidRatioPct: 5,
  /** Gün içi ağırlıklı fiyat − PTF, hacim ağırlıklı ortalama (TL/MWh) */
  gipTl: 100,
  /** Süren arıza kaybı: son 14 günün öğle ortancasına göre fark (%) */
  outagePct: 15,
  /** Enerji amaçlı baraj doluluğu: geçen yılın aynı gününe göre fark (yüzde puan) */
  damPp: 5,
  /** PTF − Bulgaristan fiyatı (EUR/MWh) */
  neighborEur: 20,
  /** Üst ucu tavana dayanan saat sayısı: bu kadar ya da fazlasında tavan riski "yukarı" */
  limitHours: 4,
} as const;

export type Direction = "up" | "down" | "flat" | "info";
export type Evidence =
  "model" | "tested-noise" | "tested-better" | "tested-worse" | "untested" | "pending";
export type SignalGroup = "talep" | "arz" | "piyasa" | "dis";

export const GROUP_LABEL: Record<SignalGroup, string> = {
  talep: "Talep ve net yük",
  arz: "Arz",
  piyasa: "Piyasa",
  dis: "Dış ticaret",
};

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  model: "Tahmini kuruyor",
  "tested-noise": "Ölçüldü: etkisi görünmüyor",
  "tested-better": "Ölçüldü: tahmini iyileştiriyor",
  "tested-worse": "Ölçüldü: tahmini kötüleştiriyor",
  untested: "Ölçülmedi",
  pending: "Ölçüm yükleniyor",
};

export interface Signal {
  id: string;
  group: SignalGroup;
  title: string;
  /** Kartın büyük değeri ("+120 TL/MWh", "%58") */
  value: string;
  direction: Direction;
  sentence: string;
  evidence: Evidence;
  /** Ayrıntı kartının sayfadaki kimliği (yoksa null) */
  detailId: string | null;
  /** Veri yoksa nedeni; kart sönük gösterilir */
  missing?: string;
}

type View = Extract<PreBidView, { ok: true }>;

const nf = (v: number, digits = 0) =>
  v.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const signed = (v: number, digits = 0) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), digits)}`;
const mean = (v: Array<number | null | undefined>) => {
  const x = v.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return x.length ? x.reduce((s, n) => s + n, 0) / x.length : null;
};
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const dir = (v: number, threshold: number): Direction =>
  v > threshold ? "up" : v < -threshold ? "down" : "flat";

function evidenceFor(effects: PreBidEffects | null, id: EffectId): Evidence {
  if (!effects) return "pending";
  const row = effects.rows.find((r) => r.id === id);
  if (!row) return "untested";
  return row.verdict === "better"
    ? "tested-better"
    : row.verdict === "worse"
      ? "tested-worse"
      : "tested-noise";
}

const missing = (
  id: string,
  group: SignalGroup,
  title: string,
  why: string,
  detailId: string | null,
  evidence: Evidence
): Signal => ({
  id,
  group,
  title,
  value: "—",
  direction: "info",
  sentence: why,
  evidence,
  detailId,
  missing: why,
});

// ---------------------------------------------------------------- başlık

export interface Headline {
  date: string;
  dayClassLabel: string;
  meanExpected: number;
  meanLo: number | null;
  meanHi: number | null;
  meanBaseline: number;
  vsBaselinePct: number | null;
  peak: { hour: number; value: number } | null;
  hiAtCapHours: number;
  nearCapHours: number;
  cap: number | null;
  /** Düz Türkçe tek cümle özet */
  line: string;
  /** Geçmiş doğruluk: modelin referansa göre iyileşmesi (%) ve gün sayısı */
  accuracy: { improvementPct: number; days: number; betterDaysPct: number } | null;
}

export function buildHeadline(view: View, limit: PriceLimit | null): Headline {
  const s = view.summary;
  const lo = mean(view.rows.map((r) => r.lo));
  const hi = mean(view.rows.map((r) => r.hi));
  const parts = [
    `${dm(view.date)} günü için ortalama fiyat beklentisi ${nf(s.meanExpected ?? 0)} TL/MWh` +
      (s.vsBaselinePct !== null
        ? `, son 28 günün ${DAY_CLASS_LABEL[view.dayClass]} ortancasından %${nf(Math.abs(s.vsBaselinePct))} ${s.vsBaselinePct >= 0 ? "yüksek" : "düşük"}`
        : "") +
      ".",
  ];
  if (limit && s.hiAtCapHours > 0)
    parts.push(
      `${s.hiAtCapHours} saatte aralığın üst ucu fiyat limitine (${nf(limit.cap)} TL/MWh) dayanıyor.`
    );
  else if (limit && s.nearCapHours > 0)
    parts.push(`${s.nearCapHours} saatte beklenti limite yakın.`);
  return {
    date: view.date,
    dayClassLabel: DAY_CLASS_LABEL[view.dayClass],
    meanExpected: s.meanExpected ?? 0,
    meanLo: lo,
    meanHi: hi,
    meanBaseline: s.meanBaseline ?? 0,
    vsBaselinePct: s.vsBaselinePct,
    peak: s.peak,
    hiAtCapHours: s.hiAtCapHours,
    nearCapHours: s.nearCapHours,
    cap: limit?.cap ?? null,
    line: parts.join(" "),
    accuracy: view.backtest
      ? {
          improvementPct: view.backtest.improvementPct,
          days: view.backtest.days,
          betterDaysPct: view.backtest.betterDaysPct,
        }
      : null,
  };
}

// ---------------------------------------------------------------- sinyaller

/** Modelin kendi girdilerinden gelen kartlar (her zaman vardır) */
function modelSignals(view: View, limit: PriceLimit | null): Signal[] {
  const b = view.coefficients.load;
  const loadTl = mean(view.rows.map((r) => r.load)) ?? 0;
  const persTl = mean(view.rows.map((r) => r.persistence)) ?? 0;
  const lepMean = mean(view.rows.map((r) => r.lep));
  const windMean = mean(view.rows.map((r) => r.windF));
  const loadMw = b > 0 ? loadTl / b : null;
  const out: Signal[] = [];

  out.push({
    id: "netload",
    group: "talep",
    title: "Net yük (yük − rüzgâr − güneş)",
    value: `${signed(loadTl)} TL/MWh`,
    direction: dir(loadTl, BRIEF_RULES.contributionTl),
    sentence:
      `Yük tahmini ortalama ${lepMean !== null ? nf(lepMean) : "—"} MW, EPİAŞ rüzgâr tahmini ${windMean !== null ? nf(windMean) : "—"} MW. ` +
      (loadMw !== null
        ? `Net yük son günlerin aynı gün sınıfına göre ortalama ${signed(loadMw)} MW sapıyor ve fiyata ortalama ${signed(loadTl)} TL/MWh katkı yapıyor.`
        : `Fiyata ortalama ${signed(loadTl)} TL/MWh katkı yapıyor.`),
    evidence: "model",
    detailId: "kart-girdiler",
  });

  out.push({
    id: "persistence",
    group: "piyasa",
    title: "Dünkü fiyat sapması",
    value: `${signed(persTl)} TL/MWh`,
    direction: dir(persTl, BRIEF_RULES.contributionTl),
    sentence:
      persTl > BRIEF_RULES.contributionTl
        ? `Dünün fiyatı normalin üstündeydi; bunun yaklaşık %${nf(view.coefficients.persistence * 100)}'i yarına taşınıyor (ortalama +${nf(persTl)} TL/MWh).`
        : persTl < -BRIEF_RULES.contributionTl
          ? `Dünün fiyatı normalin altındaydı; bunun yaklaşık %${nf(view.coefficients.persistence * 100)}'i yarına taşınıyor (ortalama −${nf(Math.abs(persTl))} TL/MWh).`
          : `Dünün fiyatı normale yakındı; yarına taşınan katkı küçük (ortalama ${signed(persTl)} TL/MWh).`,
    evidence: "model",
    detailId: "kart-katkilar",
  });

  if (limit) {
    const s = view.summary;
    out.push({
      id: "limit",
      group: "piyasa",
      title: "Fiyat limiti",
      value: `${s.hiAtCapHours} saat`,
      direction: s.hiAtCapHours >= BRIEF_RULES.limitHours ? "up" : "flat",
      sentence:
        s.hiAtCapHours > 0
          ? `${s.hiAtCapHours} saatte %90'lık aralığın üst ucu ${nf(limit.cap)} TL/MWh limitine dayanıyor (beklentisi limite yakın saat: ${s.nearCapHours}). Son ${limit.windowDays} günde ${limit.hoursInWindow} saat limitte görüldü.`
          : `Aralığın üst ucu hiçbir saatte ${nf(limit.cap)} TL/MWh limitine dayanmıyor. Son ${limit.windowDays} günde ${limit.hoursInWindow} saat limitte görüldü.`,
      evidence: "model",
      detailId: null,
    });
  }
  return out;
}

/** Bağlam kartlarından gelen sinyaller; `ctx` null ise (yükleniyor) boş döner */
function contextSignals(ctx: PreBidContext, effects: PreBidEffects | null): Signal[] {
  const out: Signal[] = [];

  // Doğal gaz
  const g = ctx.gas?.summary;
  if (g && g.vsMedian28Pct !== null) {
    out.push({
      id: "gas",
      group: "arz",
      title: "Doğal gaz referans fiyatı",
      value: `${signed(g.vsMedian28Pct, 1)}%`,
      direction: dir(g.vsMedian28Pct, BRIEF_RULES.gasPct),
      sentence: `Son GRF ${nf(g.last.tl)} TL/1000 sm³ (${dm(g.last.date)}), son 28 günün ortancasına göre ${signed(g.vsMedian28Pct, 1)}%. Gazlı santralin yakıt maliyeti yaklaşık ${nf(g.fuelCost[0])}–${nf(g.fuelCost[1])} TL/MWh.`,
      evidence: evidenceFor(effects, "gas"),
      detailId: "kart-gaz",
    });
  } else
    out.push(
      missing(
        "gas",
        "arz",
        "Doğal gaz referans fiyatı",
        "Doğal gaz fiyatı alınamadı.",
        "kart-gaz",
        evidenceFor(effects, "gas")
      )
    );

  // Arz–talep eğrisi (dünün eğrisi): talep ±1.000 MW kaysa denge fiyatı
  const ch = ctx.curves?.hours ?? [];
  const slope = (hours: number[]) => {
    const v = ch
      .filter((x) => hours.includes(x.hour))
      .map((x) => {
        const up = x.shifts.find((s) => s.dq === 1000)?.price;
        const dn = x.shifts.find((s) => s.dq === -1000)?.price;
        return up !== undefined && dn !== undefined ? (up - dn) / 2 : null;
      });
    return mean(v);
  };
  const eve = slope([18, 19, 20, 21]);
  const noon = slope([11, 12, 13, 14]);
  if (eve !== null && noon !== null) {
    out.push({
      id: "curve",
      group: "piyasa",
      title: "Arz–talep eğrisi (dünün)",
      value: `${signed(eve)} TL / 1.000 MW`,
      direction: "info",
      sentence: `Dünün eğrisinde talep 1.000 MW artsaydı akşam (18–21) denge fiyatı ortalama ${signed(eve)} TL/MWh, öğlen (11–14) ${signed(noon)} TL/MWh oynardı. ${eve > noon * 1.5 ? "Akşam eğri daha dik: küçük talep farkı fiyatı daha çok oynatır." : "Eğri iki dilimde benzer dikliğte."}`,
      evidence: "untested",
      detailId: "kart-egri",
    });
  } else
    out.push(
      missing(
        "curve",
        "piyasa",
        "Arz–talep eğrisi (dünün)",
        "Arz–talep eğrisi alınamadı.",
        "kart-egri",
        "untested"
      )
    );

  // GÖP teklif oranı
  const br = ctx.bids?.hours.filter((h) => h.ratio !== null && h.ref !== null) ?? [];
  if (br.length >= 12) {
    const dev = mean(br.map((h) => (h.ratio! / h.ref! - 1) * 100))!;
    out.push({
      id: "bids",
      group: "piyasa",
      title: "GÖP satış / alış teklifi",
      value: `${signed(dev, 1)}%`,
      direction: dir(-dev, BRIEF_RULES.bidRatioPct), // satış teklifi görece az = sıkı = yukarı
      sentence:
        dev < -BRIEF_RULES.bidRatioPct
          ? `Satış teklifi alış teklifine oranla aynı saatlerin 28 günlük ortancasından ortalama %${nf(Math.abs(dev), 1)} az: piyasa daha sıkı.`
          : dev > BRIEF_RULES.bidRatioPct
            ? `Satış teklifi alış teklifine oranla ortancadan ortalama %${nf(dev, 1)} fazla: piyasa daha bol.`
            : `Satış / alış teklif oranı 28 günlük ortancaya yakın (${signed(dev, 1)}%).`,
      evidence: "untested",
      detailId: "kart-teklif",
    });
  } else
    out.push(
      missing(
        "bids",
        "piyasa",
        "GÖP satış / alış teklifi",
        "Teklif miktarları alınamadı.",
        "kart-teklif",
        "untested"
      )
    );

  // Gün içi işlem
  const gi = ctx.gip;
  if (gi) {
    let sw = 0;
    let sv = 0;
    for (const h of gi.hours) {
      const p = gi.ptf[h.hour];
      if (h.vwap !== null && p !== null && p !== undefined && h.volume > 0) {
        sw += (h.vwap - p) * h.volume;
        sv += h.volume;
      }
    }
    if (sv > 0) {
      const diff = sw / sv;
      out.push({
        id: "gip",
        group: "piyasa",
        title: "Gün içi fiyat − PTF",
        value: `${signed(diff)} TL/MWh`,
        direction: dir(diff, BRIEF_RULES.gipTl),
        sentence: `${dm(gi.day)} günü gün içi piyasada işlem gören fiyat, gün öncesi PTF'ye göre hacim ağırlıklı ortalama ${signed(diff)} TL/MWh ${diff > BRIEF_RULES.gipTl ? "yüksekti: gün öncesi eksik kalmıştı." : diff < -BRIEF_RULES.gipTl ? "düşüktü: gün öncesi fazla fiyatlanmıştı." : "farklıydı; fark küçük."}`,
        evidence: "untested",
        detailId: "kart-gip",
      });
    }
  } else
    out.push(
      missing(
        "gip",
        "piyasa",
        "Gün içi fiyat − PTF",
        "Gün içi işlem geçmişi alınamadı.",
        "kart-gip",
        "untested"
      )
    );

  // Arızalar
  const o = ctx.outages;
  if (o) {
    if (o.typical && o.typical.median > 0) {
      const pct = (o.ongoingMw / o.typical.median - 1) * 100;
      out.push({
        id: "outages",
        group: "arz",
        title: "Süren arıza ve bakımlar",
        value: `${nf(o.ongoingMw)} MW`,
        direction: dir(pct, BRIEF_RULES.outagePct),
        sentence: `Şu an ${o.ongoingCount} bildirimle ${nf(o.ongoingMw)} MW kapasite devre dışı, son 14 günün öğle ortancasına (${nf(o.typical.median)} MW) göre ${signed(pct)}%. Yarına sarkan: ${nf(o.carryMw)} MW. İleri tarihli bakım bilinmiyor.`,
        evidence: "untested",
        detailId: "kart-ariza",
      });
    } else
      out.push({
        id: "outages",
        group: "arz",
        title: "Süren arıza ve bakımlar",
        value: `${nf(o.ongoingMw)} MW`,
        direction: "info",
        sentence: `Şu an ${o.ongoingCount} bildirimle ${nf(o.ongoingMw)} MW kapasite devre dışı; yarına sarkan ${nf(o.carryMw)} MW. Kıyas için yeterli geçmiş yok.`,
        evidence: "untested",
        detailId: "kart-ariza",
      });
  } else
    out.push(
      missing(
        "outages",
        "arz",
        "Süren arıza ve bakımlar",
        "Arıza bildirimleri yalnız bugün ve yarın için canlı çekilir ya da alınamadı.",
        "kart-ariza",
        "untested"
      )
    );

  // Baraj doluluğu
  const energy = ctx.dams?.purposes.find((p) => p.purpose === "Energy");
  if (ctx.dams && energy) {
    const diff =
      energy.yearAgoPct !== null ? energy.occupancyPct - energy.yearAgoPct : null;
    const stale =
      ctx.dams.staleDays > 3 ? ` (son yayım ${ctx.dams.staleDays} gün önce)` : "";
    out.push({
      id: "dams",
      group: "arz",
      title: "Baraj doluluğu (enerji amaçlı)",
      value: `%${nf(energy.occupancyPct, 1)}`,
      direction: diff === null ? "info" : dir(-diff, BRIEF_RULES.damPp), // geçen yıldan çok doluysa su bol: aşağı
      sentence:
        diff === null
          ? `Enerji amaçlı barajlar %${nf(energy.occupancyPct, 1)} dolu${stale}; geçen yıl kıyası yok.`
          : `Enerji amaçlı barajlar %${nf(energy.occupancyPct, 1)} dolu, geçen yıl aynı günde %${nf(energy.yearAgoPct!, 1)} (${signed(diff, 1)} puan)${stale}. ${diff > BRIEF_RULES.damPp ? "Su geçen yıldan bol." : diff < -BRIEF_RULES.damPp ? "Su geçen yıldan az." : "Geçen yıla yakın."}`,
      evidence: evidenceFor(effects, "hydro"),
      detailId: "kart-baraj",
    });
  } else
    out.push(
      missing(
        "dams",
        "arz",
        "Baraj doluluğu (enerji amaçlı)",
        "DSİ baraj doluluğu havuzda yok (çekim sunucuda çalışır).",
        "kart-baraj",
        evidenceFor(effects, "hydro")
      )
    );

  // Komşu fiyatı ve sınır akışı
  const nb = ctx.neighbors;
  if (nb && nb.mean.spreadBg !== null) {
    const spread = nb.mean.spreadBg;
    const net =
      nb.mean.netBg !== null && nb.mean.netGr !== null
        ? nb.mean.netBg + nb.mean.netGr
        : null;
    out.push({
      id: "neighbors",
      group: "dis",
      title: "Komşu fiyatı ve sınır akışı",
      value: `${signed(spread)} EUR`,
      // PTF komşudan belirgin pahalıysa ithalat çekilir (aşağı), belirgin ucuzsa ihracat çekişi (yukarı)
      direction: dir(-spread, BRIEF_RULES.neighborEur),
      sentence:
        `${dm(nb.day)} günü PTF, Bulgaristan fiyatından ortalama ${nf(Math.abs(spread))} EUR/MWh ${spread < 0 ? "ucuzdu" : "pahalıydı"} (BG ${nb.mean.bg !== null ? nf(nb.mean.bg) : "—"}, PTF ${nb.mean.ptfEur !== null ? nf(nb.mean.ptfEur) : "—"} EUR/MWh). ` +
        (net !== null
          ? `Net ${net >= 0 ? "ihracat" : "ithalat"} ortalama ${nf(Math.abs(net))} MW. `
          : "") +
        "Komşu fiyatı Türkiye kapanışından sonra yayımlanır: bilinen bir önceki gündür.",
      evidence: evidenceFor(effects, "neighbor"),
      detailId: "kart-komsu",
    });
  } else
    out.push(
      missing(
        "neighbors",
        "dis",
        "Komşu fiyatı ve sınır akışı",
        "ENTSO-E komşu fiyatları havuzda yok (çekim sunucuda çalışır).",
        "kart-komsu",
        evidenceFor(effects, "neighbor")
      )
    );

  return out;
}

/** Güneş: veri sınırı kartı (yarının güneşi bilinmiyor) */
function solarSignal(effects: PreBidEffects | null): Signal {
  const row = effects?.rows.find((r) => r.id === "sunReal");
  return {
    id: "solar",
    group: "arz",
    title: "Güneş (veri sınırı)",
    value: "bilinmiyor",
    direction: "info",
    sentence:
      "EPİAŞ yarının sistem güneş tahminini yayımlamıyor; net yükte önceki 7 günün güneş ortancası kullanılıyor. " +
      (row
        ? `Yarının güneşini tam bilseydik bile (yaz–sonbahar ölçümü) hata yalnız %${nf(Math.abs(row.improvementPct))} ${row.improvementPct >= 0 ? "azalırdı" : "artardı"}. Ara mevsim ve bulutlu günlerde fark büyük olabilir.`
        : "Güneşin yarınki değerinin ne kadar önemli olduğu henüz ölçülmedi."),
    evidence: evidenceFor(effects, "sunReal"),
    detailId: "kart-etki",
  };
}

export interface Brief {
  /** Model beklentisi kurulamadıysa (arife, bayram, girdi eksik) null */
  headline: Headline | null;
  signals: Signal[];
  /** Yön sayıları (yalnız up/down/flat; info hariç) ve kanıt dağılımı */
  tally: {
    up: number;
    down: number;
    flat: number;
    info: number;
    model: number;
    tested: number;
    noise: number;
    untested: number;
  };
  /** Düz Türkçe: sinyallerin toplam okuması ve kanıt uyarısı */
  tallyLine: string;
}

export function buildBrief(input: {
  view: View | null;
  limit: PriceLimit | null;
  ctx: PreBidContext | null;
  effects: PreBidEffects | null;
}): Brief {
  const { view, limit, ctx, effects } = input;
  const signals = [
    ...(view ? modelSignals(view, limit) : []),
    ...(ctx ? contextSignals(ctx, effects) : []),
    solarSignal(effects),
  ];
  const order: SignalGroup[] = ["talep", "arz", "piyasa", "dis"];
  signals.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));

  const real = signals.filter((s) => !s.missing);
  const t = {
    up: real.filter((s) => s.direction === "up").length,
    down: real.filter((s) => s.direction === "down").length,
    flat: real.filter((s) => s.direction === "flat").length,
    info: real.filter((s) => s.direction === "info").length,
    model: real.filter((s) => s.evidence === "model").length,
    tested: real.filter((s) => s.evidence === "tested-better").length,
    noise: real.filter((s) => s.evidence === "tested-noise").length,
    untested: real.filter((s) => s.evidence === "untested" || s.evidence === "pending")
      .length,
  };
  const ctxNote = ctx ? "" : " Bağlam verileri hâlâ yükleniyor.";
  const noModel = view
    ? ""
    : " Model beklentisi kurulamadı: bu veriler yalnız bağlamdır.";
  return {
    headline: view ? buildHeadline(view, limit) : null,
    signals,
    tally: t,
    tallyLine:
      `${real.length} sinyalden ${t.up} yukarı, ${t.down} aşağı yönlü, ${t.flat} nötr, ${t.info} yalnız bilgi. ` +
      `Bunlardan ${t.model} tanesi tahmini kuruyor; ${t.noise} tanesi modele eklenince etkisi görünmedi, ${t.untested} tanesi hiç ölçülmedi: yön okları bağlamdır, tahmini değiştirmez.` +
      noModel +
      ctxNote,
  };
}
