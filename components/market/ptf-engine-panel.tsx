"use client";

/**
 * Teklif öncesi sayfası: PTF motorunun tahmini (lib/services/ptf-engine.ts), dayandığı veriler ve alınamayan girdiler.
 * Hesap sunucuda ayrı süreçte yapılır (yaklaşık 1–2 dakika); panel sonuç gelene kadar birkaç saniyede bir sorar.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Cpu,
  Loader2,
  XCircle,
} from "lucide-react";
import { ComposedChart, ReferenceLine } from "recharts";
import {
  ChartArea as Area,
  ChartGrid as CartesianGrid,
  ChartLegend as Legend,
  ChartLine as Line,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
  CHART_COLOR,
} from "@/components/ui/chart";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard } from "@/components/market/chart-card";
import { hh } from "@/components/market/daily-dashboard";
import { DAY_CLASS_LABEL, type DayClass } from "@/lib/analysis/daily-market";
import { nf } from "@/lib/format";
import type { PtfPageForecast } from "@/lib/services/ptf-forecast-page";
import type { PtfInputStatus } from "@/lib/services/ptf-engine";

const POLL_MS = 4_000;
const avg = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
const gw = (mw: number) => `${nf(mw / 1000, 1)} GW`;

const INPUT_LABEL: Record<PtfInputStatus["key"], string> = {
  lep: "Yük tahmini (hedef gün)",
  wind: "Rüzgâr üretimi (hedef gün)",
  sun: "Güneş üretimi (hedef gün)",
  ptfD1: "Önceki günün PTF'si",
  kgupD1: "Önceki günün üretim planı (KGÜP)",
};

const STATE_STYLE = {
  ok: {
    icon: CheckCircle2,
    text: "Alındı",
    cls: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  fallback: {
    icon: CircleDashed,
    text: "Yedek kullanıldı",
    cls: "text-amber-800 bg-amber-50 border-amber-200",
  },
  missing: {
    icon: XCircle,
    text: "Alınamadı",
    cls: "text-red-700 bg-red-50 border-red-200",
  },
} as const;

/** Modelin yedeğe düştüğü ayrıntılar (lib/ptf/features.ts `fallbacks`) */
function fallbackText(f: string): string | null {
  if (f.startsWith("base:"))
    return `Benzer gün ortancası için yeterli gün yok; ${DAY_CLASS_LABEL[f.slice(5) as DayClass] ?? f.slice(5)} günleri kullanıldı.`;
  if (f === "ptfD2") return "İki gün önceki PTF yok; önceki günün fiyatı kullanıldı.";
  if (f === "ptfD7") return "Geçen haftanın PTF'si yok; benzer gün ortancası kullanıldı.";
  if (f === "lepDev") return "Benzer günlerin yük tahmini ortancası kurulamadı.";
  if (f === "netDev") return "Benzer günlerin net yük ortancası kurulamadı.";
  if (f.startsWith("kgup:")) return null; // KGÜP kartında
  if (f === "wind" || f === "sun" || f === "gas") return null; // kartta ya da modelde kullanılmıyor
  return f;
}

function StateBadge({ state }: { state: PtfInputStatus["state"] }) {
  const s = STATE_STYLE[state];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      <Icon className="h-3.5 w-3.5" /> {s.text}
    </span>
  );
}

function MissingBox({
  inputs,
  notes,
  title,
}: {
  inputs: PtfInputStatus[];
  notes: string[];
  title: string;
}) {
  const bad = inputs.filter((i) => i.state !== "ok");
  if (!bad.length && !notes.length) return null;
  return (
    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {bad.map((i) => (
            <li key={i.key}>
              <b>{INPUT_LABEL[i.key]}:</b> {i.detail}.
            </li>
          ))}
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PtfEnginePanel({
  date,
  reload,
  onMean,
}: {
  date: string;
  /** Artınca yeniden hesaplatır ("Yenile") */
  reload: number;
  onMean?: (mean: number | null) => void;
}) {
  const [data, setData] = useState<PtfPageForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // "Yenile" yalnız reload değişince yeniden hesaplatır; gün değişince önbellekteki sonuç kullanılır
  const lastReload = useRef(reload);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = reload !== lastReload.current;
    lastReload.current = reload;
    setData(null);
    setError(null);
    const ask = (withRefresh: boolean) =>
      fetch(`/api/market/ptf-forecast?date=${date}${withRefresh ? "&refresh=1" : ""}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (!d.success) throw new Error(d.error);
          setData(d as PtfPageForecast);
          if (d.state === "computing") timer = setTimeout(() => ask(false), POLL_MS);
        })
        .catch(
          (e) =>
            !cancelled && setError(e instanceof Error ? e.message : "Tahmin alınamadı.")
        );
    ask(refresh);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [date, reload]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const p = data?.preview;
  const ok = p && p.ok ? p : null;
  const mean = ok ? avg(ok.log.hours.map((h) => h.p50)) : null;
  useEffect(() => onMean?.(mean), [mean, onMean]);

  const computing = data?.state === "computing";
  const elapsed = data?.startedAt
    ? Math.max(0, Math.round((now - Date.parse(data.startedAt)) / 1000))
    : 0;

  return (
    <section aria-labelledby="ptf-motor" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ptf-motor" className="text-xl font-semibold text-slate-900">
          PTF tahmini
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white">
          <Cpu className="h-3.5 w-3.5" /> Tahmin motoru
        </span>
        {computing && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {p ? "Güncel girdilerle yeniden hesaplanıyor" : "Hesaplanıyor"} ({elapsed} sn)
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Tahmin alınamadı: {error}
        </div>
      )}

      {!p && !error && (
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-5 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            <div>
              <p className="font-medium text-slate-900">Tahmin hesaplanıyor…</p>
              <p>
                İki model (doğrusal ve ağaç tabanlı) geçmiş iki yılın verisiyle
                eğitiliyor; yaklaşık 1–2 dakika sürer.{" "}
                {elapsed > 0 && `Geçen süre: ${elapsed} sn.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {p && !p.ok && (
        <>
          <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{dmy(date)} için tahmin kurulamadı.</p>
              <p className="mt-1">
                Aşağıdaki zorunlu veri eksik. Veri yayımlanınca &quot;Yenile&quot;ye
                basın. Hesap {clock(p.computedAt)}&apos;te yapıldı.
              </p>
            </div>
          </div>
          <InputCards inputs={p.inputs} />
          <MissingBox inputs={p.inputs} notes={p.notes} title="Alınamayan veriler" />
        </>
      )}

      {ok && (
        <OkView date={date} preview={ok} record={data?.record ?? null} mean={mean ?? 0} />
      )}
    </section>
  );
}

function InputCards({
  inputs,
  values,
}: {
  inputs: PtfInputStatus[];
  values?: Partial<Record<PtfInputStatus["key"], string>>;
}) {
  if (!inputs.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {inputs.map((i) => (
        <Card key={i.key} className="shadow-sm">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{INPUT_LABEL[i.key]}</p>
            </div>
            <StateBadge state={i.state} />
            {values?.[i.key] && (
              <p className="text-lg font-semibold tracking-tight text-slate-900">
                {values[i.key]}
              </p>
            )}
            <p className="text-xs leading-relaxed text-slate-500">{i.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type OkPreview = Extract<NonNullable<PtfPageForecast["preview"]>, { ok: true }>;

function OkView({
  date,
  preview,
  record,
  mean,
}: {
  date: string;
  preview: OkPreview;
  record: PtfPageForecast["record"];
  mean: number;
}) {
  const { log, display: d, inputs, notes } = preview;
  const cap = log.cap;
  const p50 = log.hours.map((h) => h.p50);
  const known = (v: Array<number | null>) => v.filter((x): x is number => x !== null);
  const lo = avg(known(log.hours.map((h) => h.q10)));
  const hi = avg(known(log.hours.map((h) => h.q90)));
  const maxH = p50.indexOf(Math.max(...p50));
  const minH = p50.indexOf(Math.min(...p50));
  const baseMean = avg(d.base);
  const vsBase = baseMean > 0 ? (mean / baseMean - 1) * 100 : null;
  const nearCap = cap ? p50.filter((v) => v >= cap * 0.9).length : 0;
  const actualMean = d.actual ? avg(d.actual) : null;
  const actualMae = d.actual ? avg(d.actual.map((a, h) => Math.abs(a - p50[h]))) : null;
  const fallbacks = log.inputs.fallbacks
    .map(fallbackText)
    .filter((x): x is string => !!x);

  const rows = log.hours.map((h) => ({
    hour: h.hour,
    p50: h.p50,
    band: h.q10 !== null && h.q90 !== null ? [h.q10, h.q90] : null,
    base: d.base[h.hour],
    ptfD1: d.ptfD1[h.hour],
    actual: d.actual?.[h.hour] ?? null,
    lep: d.lep[h.hour],
    lepRef: d.lepRef[h.hour],
    wind: d.wind[h.hour],
    sun: d.sun[h.hour],
    net: d.net[h.hour],
  }));
  const values: Partial<Record<PtfInputStatus["key"], string>> = {
    lep: `ort. ${gw(avg(d.lep))}`,
    wind: `ort. ${gw(avg(d.wind))}`,
    sun: `öğle zirvesi ${gw(Math.max(...d.sun))}`,
    ptfD1: `ort. ${nf(avg(d.ptfD1))} TL/MWh`,
    kgupD1: `termik ${gw(avg(d.kgupThermal))} · hidro ${gw(avg(d.kgupHydro))}`,
  };

  return (
    <>
      <Card className="border-slate-300 shadow-sm">
        <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {dmy(date)} · ortalama PTF tahmini
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              {nf(mean)}{" "}
              <span className="text-lg font-medium text-slate-500">TL/MWh</span>
            </p>
            {Number.isFinite(lo) && Number.isFinite(hi) && (
              <p className="mt-1 text-sm text-slate-600">
                Olası aralık (ortalama) {nf(lo)} – {nf(hi)} TL/MWh
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                En pahalı {hh(maxH)} · {nf(p50[maxH])}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                En ucuz {hh(minH)} · {nf(p50[minH])}
              </span>
              {vsBase !== null && (
                <span
                  className={`rounded-full px-2.5 py-1 ${vsBase > 3 ? "bg-amber-100 text-amber-800" : vsBase < -3 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
                >
                  Benzer günlere göre {vsBase >= 0 ? "+" : "−"}%{nf(Math.abs(vsBase))}
                </span>
              )}
              {cap !== null && (
                <span
                  className={`rounded-full px-2.5 py-1 ${nearCap ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}
                >
                  Limite yakın: {nearCap} saat
                </span>
              )}
            </div>
          </div>
          <div className="space-y-3 text-sm text-slate-700">
            {actualMean !== null && actualMae !== null && (
              <p className="rounded-md bg-sky-50 p-2 text-sky-900">
                <b>Gerçekleşen:</b> ortalama {nf(actualMean)} TL/MWh. Tahmin saat başına
                ortalama {nf(actualMae)} TL/MWh saptı (deneme: o günün kesiminde bilinen
                veriyle hesaplandı).
              </p>
            )}
            <p>
              Son {log.band.days} günde motor saat başına ortalama{" "}
              <b>
                {log.band.recentMae !== null ? `±${nf(log.band.recentMae)}` : "—"} TL/MWh
              </b>{" "}
              saptı. Aralık bu hatalardan kuruldu; geçmiş ölçümde gerçek fiyatın yaklaşık
              %84&apos;ü aralık içinde kaldı.
            </p>
            <p className="text-slate-600">
              {d.level?.basis
                ? `Dünkü kayıt (${dmy(d.level.basis)}) gerçekleşenden saptı: bugünün tahminine ${d.level.adj >= 0 ? "+" : "−"}${nf(Math.abs(d.level.adj))} TL/MWh düzeltme eklendi (dünkü sapmanın yarısı).`
                : "Dünkü kayıt yok: günlük seviye düzeltmesi uygulanmadı."}
            </p>
            <p className="text-slate-600">
              Düzeltmeden önce iki modelin ortalaması: doğrusal model {nf(avg(log.members["LEAR-ridge"]))},
              ağaç tabanlı model {nf(avg(log.members.GBM))} TL/MWh.
              {log.shadow?.["ptf-ens-v1-ruzgar-ortalama"] &&
                ` Deneme sürümleri (düzeltmeli): rüzgârda EPİAŞ ve kendi tahminimizin ortalaması ${nf(avg(log.shadow["ptf-ens-v1-ruzgar-ortalama"]))}`}
              {log.shadow?.["ptf-ens-v1-hidro"] &&
                `${log.shadow["ptf-ens-v1-ruzgar-ortalama"] ? "," : " Deneme sürümü (düzeltmeli):"} hidro özellikli ${nf(avg(log.shadow["ptf-ens-v1-hidro"]))}`}
              {(log.shadow?.["ptf-ens-v1-ruzgar-ortalama"] || log.shadow?.["ptf-ens-v1-hidro"]) &&
                " TL/MWh."}
            </p>
            <p className="text-xs text-slate-500">
              Hesap {clock(preview.computedAt)}. Al/sat önerisi değildir.{" "}
              {record
                ? `Günlük kayıt ${clock(record.issuedAt)}'te yazıldı (ortalama ${nf(record.mean)} TL/MWh${record.onTime ? ", kesimden önce" : ", kesimden sonra"}).`
                : "Bu gün için günlük kayıt (12:05) yazılmadı."}
            </p>
          </div>
        </CardContent>
      </Card>

      <MissingBox
        inputs={inputs}
        notes={[...notes, ...fallbacks]}
        title="Eksik ya da yedekle tamamlanan veriler"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Saat saat PTF tahmini"
          description="TL/MWh. Mavi çizgi tahmin, açık mavi bant olası aralık, gri kesikli benzer günlerin ortancası, açık gri önceki gün, kırmızı kesikli fiyat limiti."
        >
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid />
            <XAxis dataKey="hour" interval={2} tickFormatter={(h: number) => hh(h)} />
            <YAxis tickFormatter={(v: number) => nf(v)} />
            <Tooltip
              formatter={(v: unknown) =>
                Array.isArray(v)
                  ? `${nf(Number(v[0]))} – ${nf(Number(v[1]))}`
                  : `${nf(Number(v ?? 0))} TL/MWh`
              }
              labelFormatter={(h) => hh(Number(h))}
            />
            <Legend />
            {cap !== null && (
              <ReferenceLine
                y={cap}
                stroke={CHART_COLOR.red}
                strokeDasharray="6 3"
                label={{
                  value: `Limit ${nf(cap)}`,
                  position: "insideTopLeft",
                  fontSize: 11,
                  fill: CHART_COLOR.red,
                }}
              />
            )}
            <Area
              name="Olası aralık"
              dataKey="band"
              stroke="none"
              fill={CHART_COLOR.blue}
              fillOpacity={0.15}
              isAnimationActive={false}
            />
            <Line
              name="Benzer günler"
              dataKey="base"
              stroke={CHART_COLOR.slateLight}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Line
              name="Önceki gün"
              dataKey="ptfD1"
              stroke={CHART_COLOR.gray}
              strokeOpacity={0.45}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            {d.actual && (
              <Line
                name="Gerçekleşen"
                dataKey="actual"
                stroke={CHART_COLOR.orange}
                isAnimationActive={false}
              />
            )}
            <Line
              name="Tahmin"
              dataKey="p50"
              stroke={CHART_COLOR.blue}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartCard>

        <ChartCard
          title="Tahmine giren yük, rüzgâr ve güneş"
          description="MW. Net yük = yük tahmini − rüzgâr − güneş: termik santrallerin karşılayacağı kısım; fiyatı en çok bu belirler."
        >
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid />
            <XAxis dataKey="hour" interval={2} tickFormatter={(h: number) => hh(h)} />
            <YAxis tickFormatter={(v: number) => nf(v / 1000)} unit=" GW" width={62} />
            <Tooltip
              formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`}
              labelFormatter={(h) => hh(Number(h))}
            />
            <Legend />
            <Line
              name="Yük tahmini"
              dataKey="lep"
              stroke={CHART_COLOR.slate}
              isAnimationActive={false}
            />
            <Line
              name="Benzer günlerin yükü"
              dataKey="lepRef"
              stroke={CHART_COLOR.slateLight}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Line
              name="Net yük"
              dataKey="net"
              stroke={CHART_COLOR.indigo}
              isAnimationActive={false}
            />
            <Line
              name="Rüzgâr"
              dataKey="wind"
              stroke={CHART_COLOR.teal}
              isAnimationActive={false}
            />
            <Line
              name="Güneş"
              dataKey="sun"
              stroke={CHART_COLOR.amber}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartCard>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">
          Motorun kullandığı veriler
        </h3>
        <InputCards inputs={inputs} values={values} />
      </div>

      <details className="rounded-md border bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
          Saatlik tablo
        </summary>
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="px-2 py-2 font-medium">Saat</th>
                <th className="px-2 py-2 text-right font-medium">Tahmin</th>
                <th className="px-2 py-2 text-right font-medium">Olası aralık</th>
                {d.actual && (
                  <th className="px-2 py-2 text-right font-medium">Gerçekleşen</th>
                )}
                <th className="px-2 py-2 text-right font-medium">Benzer günler</th>
                <th className="px-2 py-2 text-right font-medium">Önceki gün</th>
                <th className="px-2 py-2 text-right font-medium">Yük (MW)</th>
                <th className="px-2 py-2 text-right font-medium">Rüzgâr</th>
                <th className="px-2 py-2 text-right font-medium">Güneş</th>
                <th className="px-2 py-2 text-right font-medium">Net yük</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hour} className="border-b tabular-nums last:border-0">
                  <td className="px-2 py-1.5">{hh(r.hour)}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{nf(r.p50)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-500">
                    {r.band ? `${nf(r.band[0])} – ${nf(r.band[1])}` : "–"}
                  </td>
                  {d.actual && (
                    <td className="px-2 py-1.5 text-right">
                      {r.actual === null ? "–" : nf(r.actual)}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right text-slate-500">{nf(r.base)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{nf(r.ptfD1)}</td>
                  <td className="px-2 py-1.5 text-right">{nf(r.lep)}</td>
                  <td className="px-2 py-1.5 text-right">{nf(r.wind)}</td>
                  <td className="px-2 py-1.5 text-right">{nf(r.sun)}</td>
                  <td className="px-2 py-1.5 text-right">{nf(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
