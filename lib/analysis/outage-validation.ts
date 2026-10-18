/**
 * TR-Energy Analyst - Olası arıza bloklarının resmi bildirimlerle doğrulanması (Aşama 12.4)
 *
 * detectOutages (outage-detection.ts) planın yüksek, üretimin sıfıra yakın olduğu blokları işaretler; neden bilinmez.
 * Burada aynı santralin EPİAŞ piyasa mesaj sistemi bildirimleriyle (arıza / bakım, havuz: data/pool/umm) karşılaştırılır:
 * - İsabet: işaretlenen blokların (ve saatlerin) kaçı bir bildirimle örtüşüyor.
 * - Yakalama: kuralın yakalayabileceği bildirimlerin (olay anında kapasite işletmedeki gücün ≤ %2'si, ≥ 3 saat) kaçında
 *   blok var. Kısmi kayıplı bildirimler kuralın tasarımı gereği yakalanmaz; ayrıca raporlanır.
 * - Neden: örtüşen bildirimin gerekçe metninden kaba sınıf (arıza, bakım, yük atma / talimat, diğer).
 *
 * Örtüşme saat bazındadır: blok saati [t, t+1s) ile bildirim [başlangıç, bitiş) kesişirse. Zamanlar duvar saati ms.
 * SAF: I/O yok.
 */

import { OUTAGE_RULE, type OutageEvent } from "@/lib/analysis/outage-detection";
import { wallClockMs } from "@/lib/analysis/outage-capacity";
import type { UmmMessage } from "@/lib/pool/umm-codec";

const HOUR = 3_600_000;

export type NoticeCause = "fault" | "maintenance" | "curtailment" | "economic" | "other";

/**
 * Gerekçe metninden kaba neden. Sıra önemli: ekonomik duruş ("fiyat kaynaklı") ve arıza (TEİAŞ hat arızası dahil)
 * talimattan önce; talimat / yük atma / kısıt sonra; bakım en son.
 */
export function noticeCause(reason: string | null | undefined): NoticeCause {
  const r = (reason ?? "").toLocaleLowerCase("tr-TR");
  if (/fiyat/.test(r)) return "economic";
  if (/arıza|ariza|açma|acma|trip|devre dışı|devre disi|patla|yangın|hasar|kaçak|çöktü|durdu|düştü/.test(r)) return "fault";
  if (/yük\s*(atma|tevzi)|yat\b|talimat|kısıt|kesinti talebi/.test(r)) return "curtailment";
  if (/bakım|revizyon|periyodik|planlı|test|kontrol/.test(r)) return "maintenance";
  return "other";
}

export interface Notice {
  id: number;
  start: number;
  end: number;
  operatorPower: number;
  capacityAtCaseTime: number;
  cause: NoticeCause;
  /** Gerekçe su / kaynak durumu (kaynak yetersizliği, düşük göl seviyesi, boğulma): hidroda kayıp değil (18.10.2026) */
  resource?: boolean;
}

/** Su / kaynak durumu gerekçesi (hidro kayıp hesabında kayıptan ayrılır; gerekçe metni saklanmaz) */
export const isResourceReason = (reason: string | null | undefined) =>
  /kaynak\s*yetersiz|g[öo]l\s*seviye|su\s*seviye|d[üu][şs][üu]k\s*su|su\s*yetersiz|bo[ğg]ulma|kurakl[ıi]k|debi/i.test((reason ?? "").toLocaleLowerCase("tr-TR"));

export function toNotice(m: UmmMessage): Notice | null {
  const start = wallClockMs(m.caseStartDate);
  const end = wallClockMs(m.caseEndDate);
  if (start === null || end === null || end <= start) return null;
  return {
    id: m.id,
    start,
    end,
    operatorPower: Number(m.operatorPower ?? 0),
    capacityAtCaseTime: Number(m.capacityAtCaseTime ?? 0),
    cause: noticeCause(m.reason),
    resource: isResourceReason(m.reason),
  };
}

/** Kuralın yakalayabileceği bildirim: tam duruşa yakın ve en az minHours saatlik plan dönemi kapsayabilecek uzunlukta */
export const isDetectable = (n: Notice) =>
  n.operatorPower > 0 && n.capacityAtCaseTime <= OUTAGE_RULE.maxActualShare * n.operatorPower && n.end - n.start >= OUTAGE_RULE.minHours * HOUR;

/** Aynı saatte bu kadar santralde blok varsa eşzamanlı sayılır (olası sistem kısıntısı) */
export const CONCURRENT_MIN = 3;

const overlaps = (aStart: number, aEnd: number, n: Notice) => aStart < n.end && n.start < aEnd;

export interface PlantValidationInput {
  epiasPlantId: number;
  type: string;
  events: OutageEvent[];
  notices: Notice[];
  /** Santralin verisinin (plan + gerçekleşen) olduğu ilk ve son saat; dönem dışı bildirimler sayılmaz */
  dataFrom: number;
  dataTo: number;
  /** Saatin planı / kapasite (tespitle aynı kapasite); yoksa null. Yakalanmayan bildirimde plan düşürülmüş mü diye bakılır */
  planShareAt?: (t: number) => number | null;
  /** Saat → aynı türde o saatte blok içinde olan santral sayısı (eşzamanlılık: olası sistem kısıntısı) */
  concurrentAt?: (t: number) => number;
}

export interface ValidationCounts {
  plants: number;
  blocks: number;
  blocksConfirmed: number;
  hours: number;
  hoursConfirmed: number;
  /** Blokların plan − gerçekleşen toplamı ve bildirimle örtüşen bloklardaki payı (MWh) */
  lostMwh: number;
  lostMwhConfirmed: number;
  /** Örtüşen bildirimin nedenine göre doğrulanan blok sayısı (bir blok birden çok nedene sayılabilir) */
  confirmedByCause: Record<NoticeCause, number>;
  noticesDetectable: number;
  noticesDetectableCaught: number;
  /** Yakalanmayan yakalanabilir bildirimlerden planı kural eşiğinin altına düşürülmüş olanlar (dengesizlik yok, doğru) */
  noticesDetectablePlannedAround: number;
  /** Bildirimle örtüşmeyen bloklardan en az bir saati aynı türde ≥ CONCURRENT_MIN santralde blok olanlar */
  blocksUnconfirmedConcurrent: number;
  /** Karşılaştırma: bildirimle doğrulanan bloklardan eşzamanlı olanlar (ölçüt anlamlıysa belirgin düşük olmalı) */
  blocksConfirmedConcurrent: number;
  /** Kısmi kayıplı ya da kısa bildirimler (kural gereği yakalanmaz) */
  noticesOther: number;
  noticesOtherCaught: number;
}

const emptyCounts = (): ValidationCounts => ({
  plants: 0,
  blocks: 0,
  blocksConfirmed: 0,
  hours: 0,
  hoursConfirmed: 0,
  lostMwh: 0,
  lostMwhConfirmed: 0,
  confirmedByCause: { fault: 0, maintenance: 0, curtailment: 0, economic: 0, other: 0 },
  noticesDetectable: 0,
  noticesDetectableCaught: 0,
  noticesDetectablePlannedAround: 0,
  blocksUnconfirmedConcurrent: 0,
  blocksConfirmedConcurrent: 0,
  noticesOther: 0,
  noticesOtherCaught: 0,
});

export function validatePlant(p: PlantValidationInput): ValidationCounts {
  const c = emptyCounts();
  c.plants = 1;
  const blockHours = p.events.map((e) => {
    const start = Date.parse(e.start);
    const end = Date.parse(e.end) + HOUR;
    return { start, end, hours: e.hours, lostMwh: e.lostMwh };
  });
  for (const b of blockHours) {
    c.blocks++;
    c.hours += b.hours;
    c.lostMwh += b.lostMwh;
    const hits = p.notices.filter((n) => overlaps(b.start, b.end, n));
    let concurrent = false;
    if (p.concurrentAt)
      for (let t = b.start; t < b.end && !concurrent; t += HOUR) concurrent = p.concurrentAt(t) >= CONCURRENT_MIN;
    if (hits.length) {
      c.blocksConfirmed++;
      c.lostMwhConfirmed += b.lostMwh;
      for (const cause of new Set(hits.map((n) => n.cause))) c.confirmedByCause[cause]++;
      if (concurrent) c.blocksConfirmedConcurrent++;
    } else if (concurrent) c.blocksUnconfirmedConcurrent++;
    for (let t = b.start; t < b.end; t += HOUR) if (p.notices.some((n) => overlaps(t, t + HOUR, n))) c.hoursConfirmed++;
  }
  for (const n of p.notices) {
    if (n.end <= p.dataFrom || n.start > p.dataTo) continue;
    const caught = blockHours.some((b) => overlaps(b.start, b.end, n));
    if (isDetectable(n)) {
      c.noticesDetectable++;
      if (caught) c.noticesDetectableCaught++;
      else if (p.planShareAt) {
        // Bildirim süresince planın kural eşiğini (≥ %30) geçtiği saat sayısı; minHours'tan azsa plan düşürülmüş
        let high = 0;
        for (let t = Math.ceil(n.start / HOUR) * HOUR; t < n.end; t += HOUR) {
          const share = p.planShareAt(t);
          if (share !== null && share >= OUTAGE_RULE.minForecastShare) high++;
        }
        if (high < OUTAGE_RULE.minHours) c.noticesDetectablePlannedAround++;
      }
    } else {
      c.noticesOther++;
      if (caught) c.noticesOtherCaught++;
    }
  }
  return c;
}

export function sumCounts(list: ValidationCounts[]): ValidationCounts {
  const s = emptyCounts();
  for (const c of list) {
    for (const k of [
      "plants",
      "blocks",
      "blocksConfirmed",
      "hours",
      "hoursConfirmed",
      "lostMwh",
      "lostMwhConfirmed",
      "noticesDetectable",
      "noticesDetectableCaught",
      "noticesDetectablePlannedAround",
      "blocksUnconfirmedConcurrent",
      "blocksConfirmedConcurrent",
      "noticesOther",
      "noticesOtherCaught",
    ] as const)
      s[k] += c[k];
    for (const k of Object.keys(s.confirmedByCause) as NoticeCause[]) s.confirmedByCause[k] += c.confirmedByCause[k];
  }
  return s;
}

/**
 * Rapordaki blokları resmi bildirimlerle işaretler: bildirim verisinin kapsadığı ([coveredFrom, coveredTo)) bloklarda
 * `official` = en çok örtüşen bildirimin nedeni ya da null (bildirim yok). Kapsam dışındaki bloklar işaretlenmez.
 * Yeni dizi döner; olaylar kopyalanır.
 */
export function annotateOutages(events: OutageEvent[], notices: Notice[], coveredFrom: number, coveredTo: number): OutageEvent[] {
  return events.map((e) => {
    const start = Date.parse(e.start);
    const end = Date.parse(e.end) + HOUR;
    if (start < coveredFrom || end > coveredTo) return { ...e };
    let best: Notice | null = null;
    let bestOverlap = 0;
    for (const n of notices) {
      const overlap = Math.min(end, n.end) - Math.max(start, n.start);
      if (overlap > bestOverlap) {
        best = n;
        bestOverlap = overlap;
      }
    }
    return { ...e, official: best ? { cause: best.cause, noticeId: best.id } : null };
  });
}

export interface OfficialOutageSummary {
  /** Bildirim verisinin kapsadığı blok sayısı ve bunların bildirimle doğrulananları */
  checkedBlocks: number;
  confirmedBlocks: number;
  confirmedCostTl: number;
  /** Doğrulanan blokların neden sınıfı */
  byCause: Record<NoticeCause, number>;
  /** Bildirim verisinin kapsamadığı blok (ör. veri başlangıcından önce) */
  uncheckedBlocks: number;
  /** Bildirim verisinin dönemi ("YYYY-AA") */
  coverage: { from: string; to: string };
}

export function summarizeOfficial(events: OutageEvent[], coverage: { from: string; to: string }): OfficialOutageSummary {
  const s: OfficialOutageSummary = {
    checkedBlocks: 0,
    confirmedBlocks: 0,
    confirmedCostTl: 0,
    byCause: { fault: 0, maintenance: 0, curtailment: 0, economic: 0, other: 0 },
    uncheckedBlocks: 0,
    coverage,
  };
  for (const e of events) {
    if (e.official === undefined) {
      s.uncheckedBlocks++;
      continue;
    }
    s.checkedBlocks++;
    if (e.official) {
      s.confirmedBlocks++;
      s.confirmedCostTl += e.costTl;
      s.byCause[e.official.cause]++;
    }
  }
  return s;
}

/** Neden sınıflarının okunur adları (rapor ve ekran) */
export const NOTICE_CAUSE_LABEL: Record<NoticeCause, string> = {
  fault: "arıza",
  maintenance: "bakım",
  curtailment: "talimat / kısıntı",
  economic: "fiyat kaynaklı duruş",
  other: "diğer (şebeke kesintisi, buzlanma, kaynak yetersizliği…)",
};

/** Rapor bağlamı: santral kimliği → bildirimler ve bildirim verisinin kapsamı (lib/services/outage-notices doldurur) */
export interface OutageNoticeContext {
  /** EPİAŞ santral kimliği → santralin bildirimleri (UEVÇB'leri bilinen santraller; bildirimi olmayan santral boş liste) */
  byPlant: Map<number, Notice[]>;
  /** Bildirim verisinin kapsadığı aralık (duvar saati ms) ve okunur hâli */
  coveredFrom: number;
  coveredTo: number;
  coverage: { from: string; to: string };
}

const nfTr = (v: number) => v.toLocaleString("tr-TR");

/**
 * Ekran ve rapor için tek cümle: kaç blok resmi bildirimle doğrulandı, nedenleri, kaçı bildirimsiz. Neden sınıfları
 * yazılır; gerekçe metni yazılmaz (santral adı içerebilir, anonim raporda sızar).
 */
export function officialOutageSentence(s: OfficialOutageSummary): string {
  if (s.checkedBlocks === 0)
    return s.uncheckedBlocks > 0 ? "Bloklar EPİAŞ arıza bildirimleriyle karşılaştırılamadı (santral eşleşmesi ya da bildirim dönemi yok)." : "";
  const causes = (Object.keys(s.byCause) as NoticeCause[])
    .filter((c) => s.byCause[c] > 0)
    .sort((a, b) => s.byCause[b] - s.byCause[a])
    .map((c) => `${NOTICE_CAUSE_LABEL[c].split(" (")[0]} ${nfTr(s.byCause[c])}`);
  const unconfirmed = s.checkedBlocks - s.confirmedBlocks;
  let text =
    s.confirmedBlocks > 0
      ? `EPİAŞ arıza / bakım bildirimleriyle: ${nfTr(s.checkedBlocks)} bloğun ${nfTr(s.confirmedBlocks)} tanesi resmi bildirimle doğrulandı (${causes.join(", ")}); ${nfTr(unconfirmed)} blok bildirimsiz (yük atma talimatı, bildirilmeyen arıza ya da fiyat kaynaklı duruş olabilir).`
      : `EPİAŞ arıza / bakım bildirimleriyle: ${nfTr(s.checkedBlocks)} bloğun hiçbiri resmi bildirimle örtüşmüyor (yük atma talimatı, bildirilmeyen arıza ya da fiyat kaynaklı duruş olabilir).`;
  if (s.uncheckedBlocks > 0) text += ` ${nfTr(s.uncheckedBlocks)} blok karşılaştırılamadı.`;
  return text;
}
