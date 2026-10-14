/**
 * Olası arıza bloklarının resmi arıza / bakım bildirimleriyle doğrulanması (Aşama 12.4).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/outage-validation.mts [yıllar=2024,2025,2026]
 *
 * Girdi: santral havuzu (ilk KGÜP + UEVM; tür ve UEVÇB'leri bilinen RES / GES / HES) ve bildirim havuzu (data/pool/umm).
 * EPİAŞ'a gidilmez. Tespit sektör karnesiyle aynı: detectOutages, kurulu güç yerine dönemin en yüksek üretimi.
 * Çıktı: .cache/epias/outage-validation.json ve özet.
 */

import fs from "node:fs";
import path from "node:path";
import { detectOutages } from "@/lib/analysis/outage-detection";
import { sumCounts, toNotice, validatePlant, type Notice, type NoticeCause, type ValidationCounts } from "@/lib/analysis/outage-validation";
import { mergeUmmYears } from "@/lib/pool/umm-codec";
import { readUmmYear } from "@/lib/pool/umm-store";
import { listPoolPlants, readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { readRange, type PoolYear } from "@/lib/pool/pool-codec";
import type { HourlyResult } from "@/lib/calculations/types";

const years = (process.argv[2] ?? "2024,2025,2026").split(",").map(Number);
const OUT = path.join(process.cwd(), ".cache", "epias", "outage-validation.json");

// Bildirimler UEVÇB'ye göre
const messages = mergeUmmYears(await Promise.all(years.map(readUmmYear)));
const byUevcb = new Map<number, Notice[]>();
const messageById = new Map(messages.map((m) => [m.id, m]));
for (const m of messages) {
  const n = toNotice(m);
  if (!n || !Number.isFinite(m.uevcbId)) continue;
  const list = byUevcb.get(m.uevcbId as number) ?? [];
  list.push(n);
  byUevcb.set(m.uevcbId as number, list);
}
const ummMonths = (await Promise.all(years.map(readUmmYear))).flatMap((d) => (d ? Object.keys(d.months).map((mm) => `${d.year}-${mm}`) : [])).sort();
const ummFrom = Date.UTC(Number(ummMonths[0].slice(0, 4)), Number(ummMonths[0].slice(5, 7)) - 1, 1);
console.log(`Bildirim: ${messages.length} (${ummMonths[0]} – ${ummMonths.at(-1)})`);

const perType = new Map<string, ValidationCounts[]>();
const plantsOut: Array<{ epiasPlantId: number; name?: string; type: string; counts: ValidationCounts }> = [];
const unconfirmedSamples: Array<{ plant: string; start: string; hours: number }> = [];
const confirmedReasons = new Map<NoticeCause, Map<string, number>>();
let skippedNoUevcb = 0;

interface Prepared {
  id: number;
  name: string;
  type: string;
  events: ReturnType<typeof detectOutages>["events"];
  notices: Notice[];
  dataFrom: number;
  dataTo: number;
  plan: Map<number, number>;
  cap: number;
}
const prepared: Prepared[] = [];
for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.type || info.kind || !info.uevcbs?.length) {
    if (info?.type && !info.uevcbs?.length) skippedNoUevcb++;
    continue;
  }
  const docs = (await Promise.all(years.map((y) => readPoolYear(id, y)))).filter((d): d is PoolYear => d !== null);
  if (!docs.length) continue;
  const rows = readRange(docs, `${Math.min(...years)}-01-01`, `${Math.max(...years)}-12-31`).filter(
    (r) => r.kgupFirst !== null && r.uevm !== null && r.timestamp.getTime() >= ummFrom
  );
  if (rows.length < 24 * 30) continue;
  const hourly = rows.map((r) => ({ timestamp: r.timestamp, forecastMwh: r.kgupFirst!, actualMwh: r.uevm!, imbalanceCost: 0 }) as HourlyResult);
  // detectOutages ile aynı kapasite: kurulu güç bilinmediğinde dönemin en yüksek üretimi
  const cap = Math.max(0, ...hourly.map((h) => h.actualMwh));
  prepared.push({
    id,
    name: info.name ?? String(id),
    type: info.type,
    events: detectOutages(info.name ?? String(id), hourly, 0).events,
    notices: info.uevcbs.flatMap((u) => byUevcb.get(u.id) ?? []),
    dataFrom: rows[0].timestamp.getTime(),
    dataTo: rows[rows.length - 1].timestamp.getTime() + 3_600_000,
    plan: new Map(hourly.map((h) => [new Date(h.timestamp).getTime(), h.forecastMwh])),
    cap,
  });
}

// Eşzamanlılık: tür → saat → blok içindeki santral sayısı
const concurrent = new Map<string, Map<number, number>>();
for (const p of prepared) {
  const map = concurrent.get(p.type) ?? new Map<number, number>();
  for (const e of p.events) for (let t = Date.parse(e.start); t <= Date.parse(e.end); t += 3_600_000) map.set(t, (map.get(t) ?? 0) + 1);
  concurrent.set(p.type, map);
}

for (const p of prepared) {
  const counts = validatePlant({
    epiasPlantId: p.id,
    type: p.type,
    events: p.events,
    notices: p.notices,
    dataFrom: p.dataFrom,
    dataTo: p.dataTo,
    planShareAt: (t) => {
      const f = p.plan.get(t);
      return f === undefined || p.cap <= 0 ? null : f / p.cap;
    },
    concurrentAt: (t) => concurrent.get(p.type)?.get(t) ?? 0,
  });
  perType.set(p.type, [...(perType.get(p.type) ?? []), counts]);
  plantsOut.push({ epiasPlantId: p.id, name: p.name, type: p.type, counts });
  for (const e of p.events) {
    const s = Date.parse(e.start);
    const t = Date.parse(e.end) + 3_600_000;
    const hits = p.notices.filter((n) => s < n.end && n.start < t);
    if (!hits.length) {
      if (unconfirmedSamples.length < 400) unconfirmedSamples.push({ plant: p.name, start: e.start, hours: e.hours });
      continue;
    }
    for (const n of hits) {
      const reason = (messageById.get(n.id)?.reason ?? "").trim().slice(0, 60);
      const map = confirmedReasons.get(n.cause) ?? new Map<string, number>();
      map.set(reason, (map.get(reason) ?? 0) + 1);
      confirmedReasons.set(n.cause, map);
    }
  }
}

const pct = (a: number, b: number) => (b > 0 ? `%${((a / b) * 100).toFixed(0)}` : "–");
const line = (label: string, c: ValidationCounts) =>
  `${label.padEnd(6)} santral ${String(c.plants).padStart(4)} | blok ${String(c.blocks).padStart(5)}, bildirimle örtüşen ${pct(c.blocksConfirmed, c.blocks).padStart(4)} (saat ${pct(c.hoursConfirmed, c.hours)}, kayıp MWh ${pct(c.lostMwhConfirmed, c.lostMwh)}) | ` +
  `yakalanabilir bildirim ${c.noticesDetectable}, yakalanan ${pct(c.noticesDetectableCaught, c.noticesDetectable)}, planı düşürülmüş ${pct(c.noticesDetectablePlannedAround, c.noticesDetectable)}, ` +
  `planı düşürülmeyenlerde yakalama ${pct(c.noticesDetectableCaught, c.noticesDetectable - c.noticesDetectablePlannedAround)} | ` +
  `eşzamanlı: bildirimsiz blokta ${pct(c.blocksUnconfirmedConcurrent, c.blocks - c.blocksConfirmed)}, bildirimli blokta ${pct(c.blocksConfirmedConcurrent, c.blocksConfirmed)} | kısmi/kısa ${c.noticesOther}, blokla örtüşen ${pct(c.noticesOtherCaught, c.noticesOther)} | ` +
  `doğrulanan blok nedeni: arıza ${c.confirmedByCause.fault}, bakım ${c.confirmedByCause.maintenance}, talimat/kısıntı ${c.confirmedByCause.curtailment}, fiyat kaynaklı ${c.confirmedByCause.economic}, diğer ${c.confirmedByCause.other}`;

console.log(`\nTür ve UEVÇB'si bilinen havuz santralleri (UEVÇB'si olmadığı için atlanan ${skippedNoUevcb}):`);
const totals: Record<string, ValidationCounts> = {};
for (const [type, list] of [...perType.entries()].sort()) {
  totals[type] = sumCounts(list);
  console.log(line(type, totals[type]));
}
const all = sumCounts([...perType.values()].flat());
console.log(line("Toplam", all));

for (const [cause, map] of confirmedReasons) {
  const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r, n]) => `${r || "(boş)"} ×${n}`);
  console.log(`  ${cause}: ${top.join(" | ")}`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), years, ummFrom: ummMonths[0], ummTo: ummMonths.at(-1), totals, all, plants: plantsOut }, null, 1));
console.log(`Yazıldı: ${path.relative(process.cwd(), OUT)}`);
