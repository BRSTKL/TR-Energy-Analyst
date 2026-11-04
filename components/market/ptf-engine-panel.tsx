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
  ChartBar as Bar,
  ChartGrid as CartesianGrid,
  ChartLegend as Legend,
  ChartLine as Line,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
  CHART_COLOR,
  SERIES,
} from "@/components/ui/chart";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Fold, FoldList } from "@/components/market/fold";
import { buildBidRows } from "@/lib/ptf/bid-table";
import type { PriceLimit } from "@/lib/analysis/price-limit";
import { ChartCard } from "@/components/market/chart-card";
import { hh } from "@/components/market/daily-dashboard";
import { DAY_CLASS_LABEL, type DayClass } from "@/lib/analysis/daily-market";
import { accuracySummary, type AccuracySummary } from "@/lib/ptf/accuracy";
import type { PtfLogHour } from "@/lib/ptf/forecast-log";
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
  onHours,
  limit,
  children,
  folds,
}: {
  date: string;
  /** Artınca yeniden hesaplatır ("Yenile") */
  reload: number;
  onMean?: (mean: number | null) => void;
  /** Saatlik tahmin (teklif masası tablosu için); tahmin kurulamadıysa null */
  onHours?: (hours: PtfLogHour[] | null) => void;
  /** Fiyat limiti (riskli saat tanımı teklif masasıyla aynı: lib/ptf/bid-table.ts) */
  limit?: PriceLimit | null;
  /** Grafikten sonra, kapalı bölümlerden önce gösterilir (teklif masası) */
  children?: React.ReactNode;
  /** Panelin kendi kapalı bölümlerinin devamına eklenir */
  folds?: React.ReactNode;
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
  const hoursOk = ok?.log.hours ?? null;
  useEffect(() => onHours?.(hoursOk), [hoursOk, onHours]);

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

      {!p && !error && data?.record && (
        <Card className="border-slate-300 shadow-sm">
          <CardContent className="p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-slate-500">{dmy(date)} · ortalama PTF tahmini</p>
              <StatusChip
                kind="record"
                label={`Günlük kayıt ${clock(data.record.issuedAt)}${data.record.onTime ? "" : " · kesimden sonra"}`}
              />
            </div>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">
              {nf(data.record.mean)} <span className="text-lg font-medium text-slate-500">TL/MWh</span>
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              Saatlik ayrıntı için güncel girdilerle yeniden hesaplanıyor
              {elapsed > 0 ? ` (${elapsed} sn)` : ""}; günlük kayıt değişmez.
            </p>
          </CardContent>
        </Card>
      )}

      {!p && !error && !data?.record && (
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

      {ok ? (
        <OkView
          date={date}
          preview={ok}
          record={data?.record ?? null}
          mean={mean ?? 0}
          limit={limit ?? null}
          folds={folds}
        >
          {children}
        </OkView>
      ) : (
        <>
          {children}
          {folds ? <FoldList>{folds}</FoldList> : null}
        </>
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

/** Kartın sağ üstü: motor yakın geçmişte fiyata ne kadar yakın tahmin etti (sade özet; ayrıntı alttaki cümlede) */
function AccuracyBox({ acc }: { acc: AccuracySummary }) {
  const vs = acc.vsBaselinePct;
  return (
    <div
      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:w-auto sm:min-w-56"
      title={`Son ${acc.days} günde motorun her saat için yaptığı tahmin, gerçekleşen fiyattan ortalama bu kadar saptı. Basit yöntem: aynı tür günlerin son 28 günlük ortancası.`}
    >
      <p className="text-xs font-medium text-slate-500">Ne kadar yakın tahmin ediyor?</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
        {acc.relPct !== null ? `%${nf(acc.relPct)}` : `±${nf(acc.maeTl)}`}{" "}
        <span className="text-sm font-medium text-slate-500">ortalama sapma</span>
      </p>
      <p className="text-xs text-slate-600">
        son {acc.days} gün
        {acc.relPct !== null
          ? ` · saat başına ±${nf(acc.maeTl)} TL/MWh`
          : " · TL/MWh, saat başına"}
      </p>
      {vs !== null && (
        <p
          className={`mt-1 text-xs font-medium ${vs >= 0 ? "text-emerald-700" : "text-amber-800"}`}
        >
          Basit yönteme göre %{nf(Math.abs(vs))} {vs >= 0 ? "daha yakın" : "daha uzak"}
        </p>
      )}
    </div>
  );
}

/**
 * Kartın ana sayısı, sayının aşamasına göre: açıklanan PTF varsa o (tahmin onunla kıyaslanır); yoksa günlük kayıt
 * (12:05 kesiminden önce yazılan, değişmeyen sayı: Bugün ve karne bunu kullanır); kayıt yoksa canlı yeniden hesap.
 */
function Headline({
  date,
  mean,
  record,
  actualMean,
  computedAt,
  lo,
  hi,
}: {
  date: string;
  mean: number;
  record: PtfPageForecast["record"];
  actualMean: number | null;
  computedAt: string;
  lo: number;
  hi: number;
}) {
  const range = Number.isFinite(lo) && Number.isFinite(hi) ? `olası aralık (ortalama) ${nf(lo)} – ${nf(hi)}` : null;
  const recordText = record
    ? `günlük kayıt ${clock(record.issuedAt)}${record.onTime ? "" : ", kesimden sonra"}`
    : null;
  if (actualMean !== null) {
    const ref = record ? record.mean : mean;
    const diff = ref - actualMean;
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-slate-500">{dmy(date)} · açıklanan ortalama PTF</p>
          <StatusChip kind="exact" label="Açıklanan" />
        </div>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">
          {nf(actualMean)} <span className="text-lg font-medium text-slate-500">TL/MWh</span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Tahmin ({recordText ?? `canlı hesap ${clock(computedAt)}`}){" "}
          <b className="tabular-nums">{nf(ref)}</b>: açıklanandan {nf(Math.abs(diff))} TL/MWh{" "}
          {Math.abs(diff) < 0.5 ? "farklı değil" : diff > 0 ? "yüksek" : "düşük"}.
        </p>
      </div>
    );
  }
  if (record) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-slate-500">{dmy(date)} · ortalama PTF tahmini</p>
          <StatusChip kind="record" label={`Günlük kayıt ${clock(record.issuedAt)}${record.onTime ? "" : " · kesimden sonra"}`} />
        </div>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">
          {nf(record.mean)} <span className="text-lg font-medium text-slate-500">TL/MWh</span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Canlı yeniden hesap ({clock(computedAt)}): <b className="tabular-nums">{nf(mean)}</b> TL/MWh.
          Grafik ve tablo bu hesaptan.
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-slate-500">{dmy(date)} · ortalama PTF tahmini</p>
        <StatusChip kind="estimate" label={`Canlı hesap ${clock(computedAt)}`} />
      </div>
      <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">
        {nf(mean)} <span className="text-lg font-medium text-slate-500">TL/MWh</span>
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {range ? `${range[0].toUpperCase()}${range.slice(1)} TL/MWh. ` : ""}Bu gün için günlük kayıt (12:05) yok.
      </p>
    </div>
  );
}

type OkPreview = Extract<NonNullable<PtfPageForecast["preview"]>, { ok: true }>;

const INPUT_SHORT: Record<PtfInputStatus["key"], string> = {
  lep: "yük tahmini",
  wind: "rüzgâr",
  sun: "güneş",
  ptfD1: "önceki gün PTF'si",
  kgupD1: "önceki gün KGÜP'ü",
};

/** Hero kartındaki kısa bilgi: etiket, değer, isteğe bağlı alt satır; uyarı tonu simgeyle de belli olur */
function Fact({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`flex items-center gap-1 text-base font-semibold tabular-nums ${warn ? "text-amber-800" : "text-slate-900"}`}>
        {warn && <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        {value}
      </dd>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/**
 * Tek satırlık veri durumu: kaç girdi alındı, hangisi yok ya da yedekle dolduruldu. Sorun yoksa yeşil, varsa sarı; ayrıntı
 * satıra tıklayınca açılır (önceden ayrı bir uyarı kutusu ile beş girdi kartı aynı şeyi iki kez söylüyordu).
 */
function DataStatus({ inputs, notes }: { inputs: PtfInputStatus[]; notes: string[] }) {
  const missing = inputs.filter((i) => i.state === "missing");
  const fallback = inputs.filter((i) => i.state === "fallback");
  const bad = [...missing, ...fallback];
  const clean = bad.length === 0 && notes.length === 0;
  const parts = [
    ...missing.map((i) => `${INPUT_SHORT[i.key]} yok`),
    ...fallback.map((i) => `${INPUT_SHORT[i.key]} yedekle`),
    ...(notes.length ? [`${notes.length} yedek kural`] : []),
  ];
  const Icon = clean ? CheckCircle2 : AlertTriangle;
  return (
    <details className="group">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 rounded-md border px-3 py-2 text-sm [&::-webkit-details-marker]:hidden ${clean ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <b>Veri durumu:</b> {inputs.length - bad.length}/{inputs.length} girdi alındı
          {parts.length ? ` · ${parts.join(" · ")}` : ""}
        </span>
        <span className="shrink-0 text-xs underline-offset-2 group-open:hidden">Ayrıntı</span>
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-9 text-sm text-slate-700">
        {bad.map((i) => (
          <li key={i.key}>
            <b>{INPUT_LABEL[i.key]}:</b> {i.detail}.
          </li>
        ))}
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
        {clean && <li>Motorun kullandığı beş girdinin hepsi alındı.</li>}
      </ul>
    </details>
  );
}

function OkView({
  date,
  preview,
  record,
  mean,
  limit,
  folds,
  children,
}: {
  date: string;
  preview: OkPreview;
  record: PtfPageForecast["record"];
  mean: number;
  limit: PriceLimit | null;
  folds?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { log, display: d, inputs, notes } = preview;
  const cap = log.cap;
  const p50 = log.hours.map((h) => h.p50);
  const known = (v: Array<number | null>) => v.filter((x): x is number => x !== null);
  const lo = avg(known(log.hours.map((h) => h.q10)));
  const hi = avg(known(log.hours.map((h) => h.q90)));
  const maxH = p50.indexOf(Math.max(...p50));
  const minH = p50.indexOf(Math.min(...p50));
  const acc = accuracySummary(log.band);
  const actualMean = d.actual ? avg(d.actual) : null;
  const actualMae = d.actual ? avg(d.actual.map((a, h) => Math.abs(a - p50[h]))) : null;
  const fallbacks = log.inputs.fallbacks
    .map(fallbackText)
    .filter((x): x is string => !!x);

  // Riskli saat: teklif masasıyla aynı tanım (tahmin ya da aralığın üstü limite yakın, alt aralık sıfıra iniyor)
  const bidRows = buildBidRows(log.hours, null, limit);
  const riskyHours = bidRows.filter((r) => r.risk !== null && r.risk !== "wide").length;
  const nearHours = new Set(bidRows.filter((r) => r.risk === "cap" || r.risk === "near").map((r) => r.hour));
  const yMax =
    Math.ceil(
      Math.max(cap ?? 0, ...log.hours.map((h) => h.q90 ?? h.p50), ...(d.actual ?? [])) / 500
    ) * 500 || undefined;

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
    /** Limite yakın saatlerin gölgesi (eksen üstüne kadar uzanan açık kırmızı sütun) */
    risk: yMax && nearHours.has(h.hour) ? yMax : null,
  }));
  const values: Partial<Record<PtfInputStatus["key"], string>> = {
    lep: `ort. ${gw(avg(d.lep))}`,
    wind: `ort. ${gw(avg(d.wind))}`,
    sun: `öğle zirvesi ${gw(Math.max(...d.sun))}`,
    ptfD1: `ort. ${nf(avg(d.ptfD1))} TL/MWh`,
    kgupD1: `termik ${gw(avg(d.kgupThermal))} · hidro ${gw(avg(d.kgupHydro))}`,
  };
  const tahmin = actualMean !== null ? "Tahminde " : "";

  return (
    <>
      <Card className="border-slate-300 shadow-sm">
        <CardContent className="space-y-4 p-5 lg:p-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
            <Headline
              date={date}
              mean={mean}
              record={record}
              actualMean={actualMean}
              computedAt={preview.computedAt}
              lo={lo}
              hi={hi}
            />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Fact label={`${tahmin}en pahalı saat`} value={`${hh(maxH)} · ${nf(p50[maxH])}`} />
              <Fact label={`${tahmin}en ucuz saat`} value={`${hh(minH)} · ${nf(p50[minH])}`} />
              <Fact
                label={`${tahmin}riskli saat`}
                value={`${riskyHours} / 24`}
                sub={cap !== null ? `limit ${nf(cap)} TL/MWh` : undefined}
                warn={riskyHours > 0}
              />
              {acc && (
                <Fact
                  label={`Son ${acc.days} günde sapma`}
                  value={acc.relPct !== null ? `%${nf(acc.relPct)}` : `±${nf(acc.maeTl)} TL/MWh`}
                  sub={
                    acc.vsBaselinePct !== null
                      ? `basit yöntemden %${nf(Math.abs(acc.vsBaselinePct))} ${acc.vsBaselinePct >= 0 ? "yakın" : "uzak"}`
                      : undefined
                  }
                />
              )}
            </dl>
          </div>
          <DataStatus inputs={inputs} notes={[...notes, ...fallbacks]} />
          <p className="text-xs text-slate-500">
            Hesap {clock(preview.computedAt)}
            {record ? ` · günlük kayıt ${clock(record.issuedAt)}${record.onTime ? "" : " (kesimden sonra)"}` : " · bu gün için günlük kayıt yok"}
            {" "}· al/sat önerisi değildir.
          </p>
        </CardContent>
      </Card>

      <ChartCard
        title="Saat saat PTF tahmini"
        description="Kesikli çizgi tahmin, açık bant olası aralık, kırmızı çizgi limit; gölgeli saatler limite yakın."
        unit="TL/MWh"
      >
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          barCategoryGap={0}
        >
          <CartesianGrid />
          <XAxis dataKey="hour" interval={2} tickFormatter={(h: number) => hh(h)} />
          <YAxis tickFormatter={(v: number) => nf(v)} domain={yMax ? [0, yMax] : undefined} />
          <Tooltip
            formatter={(v: unknown) =>
              Array.isArray(v)
                ? `${nf(Number(v[0]))} – ${nf(Number(v[1]))}`
                : `${nf(Number(v ?? 0))} TL/MWh`
            }
            labelFormatter={(h) => hh(Number(h))}
          />
          <Legend />
          <Bar
            name="Limite yakın saat"
            dataKey="risk"
            radius={0}
            fill="#FEE2E2"
            fillOpacity={0.7}
            maxBarSize={80}
            tooltipType="none"
            isAnimationActive={false}
          />
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
          <Area name="Olası aralık" dataKey="band" {...SERIES.band} isAnimationActive={false} />
          <Line name="Benzer günler" dataKey="base" {...SERIES.reference} isAnimationActive={false} />
          {d.actual && (
            <Line name="Açıklanan PTF" dataKey="actual" {...SERIES.actual} isAnimationActive={false} />
          )}
          <Line name="Tahmin" dataKey="p50" {...SERIES.forecast} isAnimationActive={false} />
        </ComposedChart>
      </ChartCard>

      {children}

      <FoldList>
        <Fold
          title="Bu tahmine ne kadar güvenebilirim?"
          hint={
            log.band.recentMae !== null
              ? `son ${log.band.days} günde saat başına ±${nf(log.band.recentMae)} TL/MWh`
              : undefined
          }
        >
          <div className="space-y-3 text-sm text-slate-700">
            {acc && <AccuracyBox acc={acc} />}
            {actualMean !== null && actualMae !== null && (
              <p className="rounded-md bg-sky-50 p-2 text-sky-900">
                <b>Açıklanan PTF:</b> ortalama {nf(actualMean)} TL/MWh. Canlı yeniden hesap saat
                başına ortalama {nf(actualMae)} TL/MWh saptı (hesap o günün kesiminde bilinen
                veriyle yapıldı).
              </p>
            )}
            <p>
              Aralık son {log.band.days} günün saatlik hatalarından kuruldu; geçmiş ölçümde gerçek
              fiyatın yaklaşık %84&apos;ü aralık içinde kaldı.
            </p>
            <p className="text-slate-600">
              {d.level?.basis
                ? `Dünkü kayıt (${dmy(d.level.basis)}) gerçekleşenden saptı: bugünün tahminine ${d.level.adj >= 0 ? "+" : "−"}${nf(Math.abs(d.level.adj))} TL/MWh düzeltme eklendi (dünkü sapmanın yarısı).`
                : "Dünkü kayıt yok: günlük seviye düzeltmesi uygulanmadı."}
            </p>
            <p className="text-slate-600">
              Düzeltmeden önce iki modelin ortalaması: doğrusal model{" "}
              {nf(avg(log.members["LEAR-ridge"]))}, ağaç tabanlı model{" "}
              {nf(avg(log.members.GBM))} TL/MWh.
              {log.shadow?.["ptf-ens-v1-ruzgar-ortalama"] &&
                ` Deneme sürümleri (düzeltmeli): rüzgârda EPİAŞ ve kendi tahminimizin ortalaması ${nf(avg(log.shadow["ptf-ens-v1-ruzgar-ortalama"]))}`}
              {log.shadow?.["ptf-ens-v1-hidro"] &&
                `${log.shadow["ptf-ens-v1-ruzgar-ortalama"] ? "," : " Deneme sürümü (düzeltmeli):"} hidro özellikli ${nf(avg(log.shadow["ptf-ens-v1-hidro"]))}`}
              {(log.shadow?.["ptf-ens-v1-ruzgar-ortalama"] ||
                log.shadow?.["ptf-ens-v1-hidro"]) &&
                " TL/MWh."}
            </p>
          </div>
        </Fold>

        <Fold title="Tahmine giren veriler" hint="yük, rüzgâr, güneş, önceki gün">
          <InputCards inputs={inputs} values={values} />
          <ChartCard
            title="Yük, rüzgâr ve güneş"
            description="Hepsi hedef gün için tahmin. Net yük = yük tahmini − rüzgâr − güneş: termik santrallerin karşılayacağı kısım; fiyatı en çok bu belirler."
            forecastOnly
          >
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid />
              <XAxis dataKey="hour" interval={2} tickFormatter={(h: number) => hh(h)} />
              <YAxis tickFormatter={(v: number) => nf(v / 1000)} unit=" GW" width={62} />
              <Tooltip
                formatter={(v: unknown) => `${nf(Number(v ?? 0) / 1000, 1)} GW`}
                labelFormatter={(h) => hh(Number(h))}
              />
              <Legend />
              <Line name="Yük tahmini" dataKey="lep" stroke={CHART_COLOR.slate} isAnimationActive={false} />
              <Line name="Benzer günlerin yükü" dataKey="lepRef" {...SERIES.reference} isAnimationActive={false} />
              <Line name="Net yük" dataKey="net" stroke={CHART_COLOR.indigo} isAnimationActive={false} />
              <Line name="Rüzgâr" dataKey="wind" stroke={CHART_COLOR.teal} isAnimationActive={false} />
              <Line name="Güneş" dataKey="sun" stroke={CHART_COLOR.amber} isAnimationActive={false} />
            </ComposedChart>
          </ChartCard>
        </Fold>

        <Fold title="Saatlik tahmin tablosu" hint="model girdileriyle">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="px-2 py-2 font-medium">Saat</th>
                  <th className="px-2 py-2 text-right font-medium">Tahmin (TL/MWh)</th>
                  <th className="px-2 py-2 text-right font-medium">Olası aralık</th>
                  {d.actual && <th className="px-2 py-2 text-right font-medium">Açıklanan</th>}
                  <th className="px-2 py-2 text-right font-medium">Benzer günler</th>
                  <th className="px-2 py-2 text-right font-medium">Önceki gün</th>
                  <th className="px-2 py-2 text-right font-medium">Yük (MW)</th>
                  <th className="px-2 py-2 text-right font-medium">Rüzgâr (MW)</th>
                  <th className="px-2 py-2 text-right font-medium">Güneş (MW)</th>
                  <th className="px-2 py-2 text-right font-medium">Net yük (MW)</th>
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
                      <td className="px-2 py-1.5 text-right">{r.actual === null ? "–" : nf(r.actual)}</td>
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
        </Fold>
        {folds}
      </FoldList>
    </>
  );
}
