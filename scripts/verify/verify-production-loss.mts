/** PLAN 20.6: güneş kaybını bağımsız yeniden hesaplar; veri yazmaz, ağ kullanmaz.
 * npx tsx --env-file=.env --tsconfig tsconfig.json scripts/verify/verify-production-loss.mts [santralId] [YYYY-MM]
 * Varsayılan kabul örneği: Viranşehir-7, Mayıs 2026. Geometri dahil bağımsız formüller;
 * uygulama yalnız karşılaştırılan sonuç için çağrılır. Yerel geliştirme verisini denetler.
 */
import { lossInputs } from "@/lib/services/production-loss";
import { detectLostHours, monthlyLoss } from "@/lib/forecast/curtailment";
import { prisma } from "@/lib/prisma";

const id = Number(process.argv[2] ?? 5005002);
const month = process.argv[3] ?? "2026-05";
if (!Number.isSafeInteger(id) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
  throw new Error("Santral kimliği ve YYYY-MM gerekli");
const H = 3600000,
  D = 24 * H,
  rad = Math.PI / 180;
const [year, mo] = month.split("-").map(Number);
try {
  const input = await lossInputs(id, Date.UTC(2024, 2, 8), Date.UTC(year, mo + 1, 1));
  if (!input) throw new Error("Konum, havuz veya uydu verisi yok; kabul yapılamadı");
  const rows = input.hours.filter((h) =>
    [h.uevm, h.satGhi, h.satDirect, h.satDiffuse].every((v) => v !== null)
  );
  if (!rows.length) throw new Error("Ortak üretim / uydu saati yok");
  // NOAA güneş vektörü; üretim saatinin dört iç noktasında izotropik panel ışınımı.
  function poa(
    t: number,
    ghi: number,
    beam: number,
    diffuse: number,
    tiltDeg: number | null
  ) {
    let total = 0;
    for (const minute of [7.5, 22.5, 37.5, 52.5]) {
      const utc = t - 3 * H + minute * 60000,
        date = new Date(utc);
      const day = Math.floor((utc - Date.UTC(date.getUTCFullYear(), 0, 1)) / D) + 1;
      const hour =
        date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
      const g = ((2 * Math.PI) / 365) * (day - 1 + (hour - 12) / 24);
      const dec = (a: number) =>
        0.006918 -
        0.399912 * Math.cos(a) +
        0.070257 * Math.sin(a) -
        0.006758 * Math.cos(2 * a) +
        0.000907 * Math.sin(2 * a) -
        0.002697 * Math.cos(3 * a) +
        0.00148 * Math.sin(3 * a);
      const equation =
        229.18 *
        (0.000075 +
          0.001868 * Math.cos(g) -
          0.032077 * Math.sin(g) -
          0.014615 * Math.cos(2 * g) -
          0.040849 * Math.sin(2 * g));
      const angle = ((hour * 60 + equation + 4 * input!.site.longitude) / 4 - 180) * rad;
      const lat = input!.site.latitude * rad;
      const z =
        Math.sin(lat) * Math.sin(dec(g)) +
        Math.cos(lat) * Math.cos(dec(g)) * Math.cos(angle);
      if (z <= 0) continue;
      const sine = Math.sqrt(1 - z * z);
      const declAz = dec(
        ((2 * Math.PI) / 365) * (day - 1 + (date.getUTCHours() - 12) / 24)
      );
      const azCos = Math.max(
        -1,
        Math.min(1, (Math.sin(declAz) - z * Math.sin(lat)) / (sine * Math.cos(lat)))
      );
      let tilt: number, incidence: number;
      if (tiltDeg === null) {
        incidence = Math.sqrt(Math.max(0, 1 - (sine * azCos) ** 2));
        tilt = Math.abs(Math.atan2(sine * Math.sqrt(1 - azCos * azCos), z));
      } else {
        tilt = tiltDeg * rad;
        incidence = z * Math.cos(tilt) - sine * Math.sin(tilt) * azCos;
      }
      total +=
        (z >= 0.05 ? beam / z : 0) * Math.max(0, incidence) +
        (diffuse * (1 + Math.cos(tilt))) / 2 +
        (ghi * 0.2 * (1 - Math.cos(tilt))) / 2;
    }
    return total / 4;
  }
  const q90 = (xs: number[]) =>
    xs.length < 20 ? null : xs.sort((a, b) => a - b)[Math.floor(0.9 * xs.length)];
  const key = (t: number) =>
    new Date(t).getUTCFullYear() * 12 + new Date(t).getUTCMonth();
  function select(rs: typeof rows) {
    const options = [20, 30, null].map((tilt) => {
      const ps = rs.map((h) => poa(h.t, h.satGhi!, h.satDirect!, h.satDiffuse!, tilt));
      const use = rs.map((h, i) => [h.uevm!, ps[i]]).filter((x) => x[1] > 50);
      const avg = (i: number) => use.reduce((s, x) => s + x[i], 0) / use.length;
      const a = avg(0),
        b = avg(1);
      let cov = 0,
        va = 0,
        vb = 0;
      for (const x of use) {
        cov += (x[0] - a) * (x[1] - b);
        va += (x[0] - a) ** 2;
        vb += (x[1] - b) ** 2;
      }
      return {
        ps,
        score: use.length >= 50 && va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : -1,
      };
    });
    return options.reduce((a, b) => (b.score > a.score ? b : a)).ps;
  }
  const first = select(rows),
    ratios = rows.flatMap((h, i) => (first[i] >= 300 ? [h.uevm! / first[i]] : []));
  const reference = q90(ratios);
  const daily = new Map<number, number>();
  rows.forEach((h, i) => {
    if (first[i] >= 300) {
      const d = Math.floor(h.t / D) * D;
      daily.set(d, Math.max(daily.get(d) ?? 0, h.uevm! / first[i]));
    }
  });
  const steady = reference
    ? ([...daily.keys()]
        .sort((a, b) => a - b)
        .find((d) => daily.get(d)! >= 0.8 * reference) ?? null)
    : null;
  const eligible = rows.filter((h) => steady === null || h.t >= steady),
    panels = select(eligible);
  const rates = new Map<number, number[]>();
  eligible.forEach((h, i) => {
    if (panels[i] >= 300) {
      const k = key(h.t);
      rates.set(k, [...(rates.get(k) ?? []), h.uevm! / panels[i]]);
    }
  });
  const expected = new Map<number, number>(),
    lost = new Map<number, string>();
  eligible.forEach((h, i) => {
    const k = key(h.t),
      ref = rates.has(k)
        ? q90([
            ...(rates.get(k - 1) ?? []),
            ...rates.get(k)!,
            ...(rates.get(k + 1) ?? []),
          ])
        : null;
    if (panels[i] < 200 || !ref || ref <= 0) return;
    const e = ref * panels[i];
    expected.set(h.t, e);
    if (h.uevm! < 0.5 * e)
      lost.set(
        h.t,
        h.kgupFirst !== null && h.kgupFirst < 0.1 * e ? "planned" : "unplanned"
      );
  });
  const actual = detectLostHours(input.hours, input.site, { commissioning: true });
  let errors = 0,
    maxDifference = 0,
    checked = 0;
  for (const h of rows.filter((h) => new Date(h.t).toISOString().startsWith(month))) {
    checked++;
    const diff = Math.abs((expected.get(h.t) ?? 0) - (actual.expected.get(h.t) ?? 0));
    maxDifference = Math.max(maxDifference, diff);
    if (diff > 1e-6 || lost.get(h.t) !== actual.lost.get(h.t)) errors++;
  }
  if (!checked) throw new Error("Hedef ayda ortak veri yok");
  const sum = { planned: 0, unplanned: 0, actual: 0, value: 0 };
  for (const h of input.hours.filter((h) =>
    new Date(h.t).toISOString().startsWith(month)
  )) {
    sum.actual += h.uevm ?? 0;
    const kind = lost.get(h.t);
    if (!kind) continue;
    const amount = expected.get(h.t)! - h.uevm!;
    sum[kind as "planned" | "unplanned"] += amount;
    sum.value += amount * Math.max(0, h.ptf ?? 0);
  }
  const result = monthlyLoss(input.hours, actual).find((m) => m.month === month);
  if (!result) throw new Error("Aylık sonuç yok");
  for (const delta of [
    sum.planned - result.plannedLossMwh,
    sum.unplanned - result.unplannedLossMwh,
    sum.actual - result.actualMwh,
    sum.value - result.plannedValueTl - result.unplannedValueTl,
  ])
    if (Math.abs(delta) > 1e-5) errors++;
  if (id === 5005002 && month === "2026-05")
    for (let hour = 10; hour <= 14; hour++)
      if (lost.get(Date.UTC(2026, 4, 15, hour)) !== "planned") errors++;
  console.log(
    JSON.stringify(
      {
        santral: id,
        ay: month,
        saat: checked,
        enBuyukFarkMwh: maxDifference,
        bagimsiz: sum,
        hata: errors,
      },
      null,
      2
    )
  );
  if (errors) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
