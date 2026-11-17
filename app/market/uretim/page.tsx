"use client";

/**
 * Türkiye üretim tahmini: bütün sistemin rüzgâr ve güneş üretimi (tahmin, şirket planları, gerçekleşen) ve yük tahmini
 * (18.11.2026). Veri /api/market/production (lib/services/country-production.ts), EPİAŞ'tan canlı. PTF tahminini beklemez.
 * Portföyün kendi tahmini değildir (o: proje Üretim tahmini sayfası).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { ComposedChart } from "recharts";
import {
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
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/market/chart-card";
import { hh } from "@/components/market/daily-dashboard";
import type { CountryProduction } from "@/lib/services/country-production";

type Mode = "today" | "tomorrow" | "day";
type Series = Array<number | null>;

const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const sum = (s: Series) => s.reduce<number>((a, v) => a + (v ?? 0), 0);
const has = (s: Series) => s.some((v) => v !== null);
const peakHour = (s: Series) => s.reduce<number | null>((b, v, h) => (v !== null && (b === null || v > (s[b] ?? -Infinity)) ? h : b), null);
const gw = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${nf(v / 1000, 1)} GW`);
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const trToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

function Kpi({ label, value, unit, sub, color }: { label: string; value: string; unit?: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {color && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value} {unit && <span className="text-sm font-medium text-slate-500">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      {ok ? "✓ " : "… "}
      {children}
    </span>
  );
}

export default function CountryProductionPage() {
  const [mode, setMode] = useState<Mode>("today");
  const [day, setDay] = useState<string | null>(null);
  const [data, setData] = useState<CountryProduction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const today = trToday();

  const load = useCallback(() => {
    const q = mode === "day" ? (day ?? shift(today, -1)) : mode;
    setLoading(true);
    setError(null);
    fetch(`/api/market/production?day=${q}`)
      .then((r) => r.json())
      .then((j) => (j.success ? setData(j as CountryProduction) : (setData(null), setError(j.error ?? "Veri alınamadı."))))
      .catch(() => setError("Veri alınamadı."))
      .finally(() => setLoading(false));
  }, [mode, day, today]);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const sunPlan = data.kind === "tomorrow" ? data.sun.kgupReference ?? [] : data.sun.kgup;
    return Array.from({ length: 24 }, (_, h) => {
      const w = data.wind.forecast[h];
      const s = data.kind === "tomorrow" ? null : data.sun.kgup[h];
      const lep = data.lep[h];
      return {
        hour: h,
        windFc: w,
        windKgup: data.wind.kgup[h],
        windAct: data.wind.actual[h],
        sunKgup: data.sun.kgup[h],
        sunRef: data.sun.kgupReference?.[h] ?? null,
        sunAct: data.sun.actual[h],
        lep,
        ren: w !== null || s !== null ? (w ?? 0) + (s ?? sunPlan[h] ?? 0) : null,
        net: lep !== null && w !== null ? lep - w - (s ?? sunPlan[h] ?? 0) : null,
      };
    });
  }, [data]);

  const shownDate = data?.date ?? (mode === "today" ? today : mode === "tomorrow" ? shift(today, 1) : day);
  const tomorrow = data?.kind === "tomorrow";
  const windT = data ? sum(data.wind.forecast) : 0;
  const windA = data ? sum(data.wind.actual) : 0;
  const sunPlan = data ? (tomorrow ? data.sun.kgupReference ?? [] : data.sun.kgup) : [];
  const sunT = sum(sunPlan);
  const lepT = data ? sum(data.lep) : 0;
  const pkWind = data ? peakHour(data.wind.forecast) : null;
  const pkSun = peakHour(sunPlan);
  const actualHours = data ? data.wind.actual.filter((v) => v !== null).length : 0;
  const windFcSameHours = data ? data.wind.forecast.reduce<number>((a, v, h) => a + (data.wind.actual[h] !== null ? v ?? 0 : 0), 0) : 0;

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs">
              <Link href="/" className="flex items-center gap-1 text-slate-500 hover:text-slate-900">
                <ArrowLeft className="h-3 w-3" /> Bugün
              </Link>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-700">Türkiye üretim tahmini</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Türkiye üretim tahmini</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Türkiye genelinde rüzgâr ve güneş üretiminin tahmini, şirketlerin planı ve gerçekleşen; yanında yük tahmini. Bütün
              sistem, senin portföyün değil.
            </p>
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer">Veri nereden geliyor?</summary>
              <ul className="mt-1 max-w-3xl list-disc space-y-0.5 pl-4">
                <li>Rüzgâr tahmini: EPİAŞ&apos;ın Türkiye rüzgâr üretim tahmini (15 dakikalık, saat ortalaması). Yarın için sabah yayımlanır.</li>
                <li>Şirket planları (KGÜP): rüzgâr ve güneş (güneş lisanssız dahil). Yarının planı EPİAŞ&apos;ta henüz sorulamaz; yarın sekmesinde bugünün güneş planı karşılaştırma için kesik çizgiyle gösterilir.</li>
                <li>Gerçekleşen: EPİAŞ gerçek zamanlı üretim; lisanssız güneşi içermez, bu yüzden güneşte plandan düşük görünür. Bugün yalnız tamamlanmış saatler.</li>
                <li>Yük tahmini: EPİAŞ yük tahmin planı. Net yük = yük − rüzgâr − güneş.</li>
                <li>Veriler EPİAŞ&apos;tan istek anında alınır, 5 dakika saklanır; EPİAŞ geçmiş saatleri düzeltebilir.</li>
              </ul>
            </details>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            <Button variant="outline" size="sm" disabled={loading} onClick={load}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Yenile
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Gün" className="inline-flex max-w-full flex-wrap rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {(
              [
                ["today", "Bugün", today],
                ["tomorrow", "Yarın", shift(today, 1)],
              ] as const
            ).map(([id, label, d]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${mode === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
                <span className="ml-1.5 text-xs font-normal tabular-nums opacity-70">{shortDate(d)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-slate-500">Başka gün</span>
            <Button variant="outline" size="sm" aria-label="Önceki gün" onClick={() => (setMode("day"), setDay(shift(mode === "day" && day ? day : today, -1)))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="date"
              aria-label="Gün seç"
              max={shift(today, -1)}
              value={mode === "day" ? (day ?? shift(today, -1)) : ""}
              onChange={(e) => e.target.value && (setMode("day"), setDay(e.target.value))}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm tabular-nums"
            />
            <Button
              variant="outline"
              size="sm"
              aria-label="Sonraki gün"
              disabled={mode !== "day" || !day || day >= shift(today, -1)}
              onClick={() => day && setDay(shift(day, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {error && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}

        {data && (
          <>
            <div className="flex flex-wrap gap-2">
              <Pill ok={has(data.wind.forecast)}>{has(data.wind.forecast) ? "EPİAŞ rüzgâr tahmini" : "Rüzgâr tahmini bekleniyor"}</Pill>
              <Pill ok={tomorrow ? false : has(data.sun.kgup)}>{tomorrow ? "Yarının güneş planı henüz sorulamaz" : "Güneş planı (KGÜP)"}</Pill>
              <Pill ok={has(data.lep)}>{has(data.lep) ? "Yük tahmini" : "Yük tahmini bekleniyor"}</Pill>
              {data.kind === "today" && (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600">
                  Gerçekleşen: {data.lastActualHour === null ? "henüz yok" : `${hh(data.lastActualHour)}'e kadar`}
                </span>
              )}
              {data.notes.map((n) => (
                <span key={n} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800">
                  {n}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                label="Rüzgâr tahmini (EPİAŞ)"
                color={CHART_COLOR.teal}
                value={has(data.wind.forecast) ? nf(windT / 1000, 1) : "–"}
                unit="GWh"
                sub={
                  actualHours && windFcSameHours
                    ? `gerçekleşen ${nf(windA / 1000, 1)} GWh (${actualHours} saat) · tahmin %${nf(Math.abs((windFcSameHours / windA - 1) * 100))} ${windFcSameHours < windA ? "düşük" : "yüksek"}`
                    : pkWind !== null
                      ? `en yüksek ${hh(pkWind)} · ${gw(data.wind.forecast[pkWind])}`
                      : undefined
                }
              />
              <Kpi
                label={tomorrow ? "Güneş (bugünün planı)" : "Güneş planı (KGÜP)"}
                color={CHART_COLOR.amber}
                value={sunT ? nf(sunT / 1000, 1) : "–"}
                unit="GWh"
                sub={pkSun !== null ? `en yüksek ${hh(pkSun)} · ${gw(sunPlan[pkSun])}${tomorrow ? " · yarın için karşılaştırma" : ""}` : undefined}
              />
              <Kpi label="Yük tahmini" value={has(data.lep) ? nf(lepT / 1000) : "–"} unit="GWh" sub={has(data.lep) ? `en yüksek ${hh(peakHour(data.lep)!)} · ${gw(data.lep[peakHour(data.lep)!])}` : "EPİAŞ yayımlayınca"} />
              <Kpi
                label="Rüzgâr + güneşin payı"
                value={has(data.lep) && has(data.wind.forecast) ? `%${nf(((windT + sunT) / lepT) * 100, 1)}` : "–"}
                sub={has(data.lep) && has(data.wind.forecast) ? `yük tahminine göre · net yük ${nf((lepT - windT - sunT) / 1000)} GWh` : undefined}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Rüzgâr" unit="GW" description="EPİAŞ'ın Türkiye tahmini; şirketlerin planı (KGÜP) ve gerçekleşen yanında.">
                <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid />
                  <XAxis dataKey="hour" interval={2} tickFormatter={(h: number) => String(h).padStart(2, "0")} />
                  <YAxis tickFormatter={(v: number) => nf(v / 1000)} width={42} />
                  <Tooltip formatter={(v: unknown) => gw(Number(v))} labelFormatter={(h) => hh(Number(h))} />
                  <Legend />
                  <Bar name="Gerçekleşen" dataKey="windAct" fill={CHART_COLOR.teal} fillOpacity={0.3} isAnimationActive={false} />
                  <Line name="Şirket planları (KGÜP)" dataKey="windKgup" {...SERIES.reference} isAnimationActive={false} />
                  <Line name="EPİAŞ tahmini" dataKey="windFc" stroke={CHART_COLOR.teal} isAnimationActive={false} />
                </ComposedChart>
              </ChartCard>
              <ChartCard
                title="Güneş"
                unit="GW"
                description={
                  tomorrow
                    ? "Yarının güneş planı EPİAŞ'ta henüz sorulamaz; kesik çizgi bugünün planı (karşılaştırma)."
                    : "Şirketlerin güneş planı (lisanssız dahil). Gerçekleşen yalnız lisanslı santralleri kapsar, plandan düşük görünür."
                }
              >
                <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid />
                  <XAxis dataKey="hour" interval={2} tickFormatter={(h: number) => String(h).padStart(2, "0")} />
                  <YAxis tickFormatter={(v: number) => nf(v / 1000)} width={42} />
                  <Tooltip formatter={(v: unknown) => gw(Number(v))} labelFormatter={(h) => hh(Number(h))} />
                  <Legend />
                  {tomorrow ? (
                    <Line name="Bugünün planı (karşılaştırma)" dataKey="sunRef" {...SERIES.reference} isAnimationActive={false} />
                  ) : (
                    <>
                      <Bar name="Gerçekleşen (lisanslı)" dataKey="sunAct" fill={CHART_COLOR.amber} fillOpacity={0.3} isAnimationActive={false} />
                      <Line name="Güneş planı (KGÜP)" dataKey="sunKgup" stroke={CHART_COLOR.amber} isAnimationActive={false} />
                    </>
                  )}
                </ComposedChart>
              </ChartCard>
              <ChartCard
                wide
                title="Yük ve net yük"
                unit="GW"
                description="Net yük = yük tahmini − rüzgâr tahmini − güneş planı: termik ve hidro santrallerin karşılayacağı kısım. Fiyatı en çok bu belirler."
              >
                <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid />
                  <XAxis dataKey="hour" interval={2} tickFormatter={(h: number) => String(h).padStart(2, "0")} />
                  <YAxis tickFormatter={(v: number) => nf(v / 1000)} width={42} />
                  <Tooltip formatter={(v: unknown) => gw(Number(v))} labelFormatter={(h) => hh(Number(h))} />
                  <Legend />
                  <Bar name="Rüzgâr + güneş" dataKey="ren" fill={CHART_COLOR.teal} fillOpacity={0.25} isAnimationActive={false} />
                  <Line name="Yük tahmini" dataKey="lep" stroke={CHART_COLOR.slate} isAnimationActive={false} />
                  <Line name="Net yük" dataKey="net" stroke={CHART_COLOR.indigo} isAnimationActive={false} />
                </ComposedChart>
              </ChartCard>
            </div>
            <p className="text-xs text-slate-500">
              {shownDate ? `${shortDate(shownDate)} · ` : ""}güncellendi {new Date(data.updatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
