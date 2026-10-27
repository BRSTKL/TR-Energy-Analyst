"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { BarChart, Cell, ComposedChart, ReferenceArea } from "recharts";
import { ChartArea as Area, ChartBar as Bar, ChartGrid as CartesianGrid, ChartLegend as Legend, ChartLine as Line, ChartTip as Tooltip, ChartXAxis as XAxis, ChartYAxis as YAxis } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MethodLink } from "@/components/method-link";
import { ChartCard } from "@/components/market/chart-card";
import { CHART_COLOR } from "@/components/ui/chart";
import { DIRECTION_LABEL, DailyTable } from "@/components/market/daily-table";
import { DAY_CLASS_LABEL, MIX_GROUPS, REFERENCE_DAYS, type DailyMarket, type MixKey } from "@/lib/analysis/daily-market";
import { nf } from "@/lib/format";

interface Availability {
  start: string;
  end: string;
  systemEnd: string | null;
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const trDay = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const weekday = (d: string) => WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const gw = (mw: number) => `${nf(mw / 1000, 1)} GW`;
const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}%${nf(Math.abs(v))}`;

/** Karma renkleri: rüzgâr / güneş / lisanssız güneş açık tonlar, termik koyu */
const MIX_COLOR: Record<MixKey, string> = {
  wind: CHART_COLOR.teal,
  sun: CHART_COLOR.amber,
  unlicensedSun: CHART_COLOR.amberLight,
  river: CHART_COLOR.sky,
  dam: CHART_COLOR.indigo,
  gas: CHART_COLOR.orange,
  coal: CHART_COLOR.gray,
  other: CHART_COLOR.violet,
};
const DIRECTION_COLOR: Record<string, string> = { DEFICIT: CHART_COLOR.red, SURPLUS: CHART_COLOR.blue, BALANCED: CHART_COLOR.slateLight };

const axis = {
  x: { dataKey: "hour", interval: 2 as const, tickFormatter: (h: number) => hh(h) },
  y: {},
};

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-slate-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-bold tracking-tight sm:text-2xl ${tone === "warn" ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function DailyMarketPage() {
  const [requested, setRequested] = useState<string | null>(null);
  const [day, setDay] = useState<DailyMarket | null>(null);
  const [available, setAvailable] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/market/daily${requested ? `?date=${requested}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) throw new Error(d.error);
        setDay(d.day);
        setAvailable(d.available);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Günlük pano yüklenemedi."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [requested]);

  const date = day?.date ?? requested;
  const go = (d: string) => available && d >= available.start && d <= available.end && setRequested(d);

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs">
              <Link href="/" className="flex items-center gap-1 text-slate-500 hover:text-slate-900">
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span className="text-slate-300">/</span>
              <Link href="/market" className="text-slate-500 hover:text-slate-900">
                Piyasa
              </Link>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-700">Günlük pano</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Günlük piyasa panosu{day ? ` · ${trDay(day.date)}` : ""}
            </h1>
            <MethodLink section="gunluk-pano" label="Yöntem ve varsayımlar" />
            {day && (
              <p className="mt-1 text-xs text-slate-500">
                {weekday(day.date)}, {DAY_CLASS_LABEL[day.dayClass]} günü. Fiyatlar ve sistem yönü EPİAŞ&apos;ın doğrulanmış verisi; tüketim ve rüzgâr gerçek zamanlı ölçüm
                (EPİAŞ düzeltebilir), güneş KGÜP planı (lisanssız dahil).
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            <Button variant="outline" size="sm" aria-label="Önceki gün" disabled={!date || !available || date <= available.start} onClick={() => date && go(shift(date, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="date"
              aria-label="Gün"
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={date ?? ""}
              min={available?.start}
              max={available?.end}
              onChange={(e) => e.target.value && go(e.target.value)}
            />
            <Button variant="outline" size="sm" aria-label="Sonraki gün" disabled={!date || !available || date >= available.end} onClick={() => date && go(shift(date, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={!available || date === available.end} onClick={() => available && setRequested(available.end)}>
              Son gün
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {!day && !error && <div className="text-sm text-slate-500">Yükleniyor…</div>}

        {day && (
          <>
            {(day.warnings.length > 0 || (available?.systemEnd && available.systemEnd < day.date)) && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <ul className="space-y-0.5">
                  {day.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                  {available?.systemEnd && available.systemEnd < day.date && <li>Sistem verisi (tüketim, üretim) en son {trDay(available.systemEnd)} gününe kadar havuzda.</li>}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <Kpi
                label="PTF ortalaması"
                value={day.prices.ptfMean === null ? "–" : `${nf(day.prices.ptfMean)} TL/MWh`}
                sub={day.prices.vsReferencePct !== null && day.reference ? `Son ${day.reference.days} ${DAY_CLASS_LABEL[day.dayClass]} gününün ortancasına göre ${signedPct(day.prices.vsReferencePct)}` : "Kıyas bandı yok"}
              />
              <Kpi label="SMF ortalaması" value={day.prices.smfMean === null ? "–" : `${nf(day.prices.smfMean)} TL/MWh`} />
              <Kpi label="Makas (ort. |SMF − PTF|)" value={day.prices.spreadMean === null ? "–" : `${nf(day.prices.spreadMean)} TL/MWh`} />
              <Kpi
                label="En pahalı / en ucuz saat"
                value={day.prices.ptfMax && day.prices.ptfMin ? `${hh(day.prices.ptfMax.hour)} / ${hh(day.prices.ptfMin.hour)}` : "–"}
                sub={day.prices.ptfMax && day.prices.ptfMin ? `${nf(day.prices.ptfMax.value)} / ${nf(day.prices.ptfMin.value)} TL/MWh${day.prices.zeroHours ? ` · ${day.prices.zeroHours} sıfır fiyatlı saat` : ""}` : undefined}
              />
              <Kpi
                label="Sistem yönü"
                value={`${day.direction.deficit} açık / ${day.direction.surplus} fazla`}
                sub={day.direction.balanced ? `${day.direction.balanced} saat dengede` : "saat sayısı"}
              />
              <Kpi
                label="Akşam rampası (net yük)"
                value={day.net.ramp ? `+${gw(day.net.ramp.rise)}` : "–"}
                sub={
                  day.net.ramp
                    ? `${hh(day.net.ramp.fromHour)}–${hh(day.net.ramp.toHour)}, ${day.net.ramp.definitions === 2 ? `iki tanım arasında ${gw(day.net.ramp.low)}–${gw(day.net.ramp.high)}` : "tek tanımla"}`
                    : day.net.hours
                      ? "Artış yok"
                      : "Net yük hesaplanamadı"
                }
              />
            </div>

            {day.sentences.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Günün özeti</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {day.sentences.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-slate-500">Cümleler veriyi betimler; bir ilişkinin nedenini ya da yarının fiyatını söylemez.</p>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title="PTF, SMF ve kıyas bandı"
                description={`TL/MWh. Gri bant: son ${REFERENCE_DAYS} günün aynı sınıftaki (${DAY_CLASS_LABEL[day.dayClass]}) günlerinin çeyrekler arası aralığı, kesikli çizgi ortanca.`}
              >
                <ComposedChart data={day.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid />
                  <XAxis {...axis.x} />
                  <YAxis {...axis.y} tickFormatter={(v: number) => nf(v)} />
                  <Tooltip formatter={(v: unknown) => (Array.isArray(v) ? `${nf(Number(v[0]))} – ${nf(Number(v[1]))}` : `${nf(Number(v ?? 0))} TL/MWh`)} labelFormatter={(h) => hh(Number(h))} />
                  <Legend />
                  <Area name="Kıyas bandı (%25–%75)" dataKey={(r: any) => (r.refLow === null || r.refHigh === null ? null : [r.refLow, r.refHigh])} stroke="none" fill={CHART_COLOR.slateLight} fillOpacity={0.2} isAnimationActive={false} />
                  <Line name="Kıyas ortancası" dataKey="refMedian" stroke={CHART_COLOR.slateLight} strokeDasharray="4 4" strokeWidth={1.5} isAnimationActive={false} />
                  <Line name="PTF" dataKey="ptf" stroke={CHART_COLOR.blue} isAnimationActive={false} />
                  <Line name="SMF" dataKey="smf" stroke={CHART_COLOR.orange} isAnimationActive={false} />
                </ComposedChart>
              </ChartCard>

              <ChartCard
                title="Net yük ve akşam rampası"
                description="MW (saatlik ortalama). Net yük (tüketim taraflı) = tüketim − rüzgâr − güneş planı; kesikli: arz taraflı = termik, hidro, diğer + net ithalat. Mavi şerit: en büyük 3 saatlik artış."
              >
                <ComposedChart data={day.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid />
                  <XAxis {...axis.x} />
                  <YAxis {...axis.y} tickFormatter={(v: number) => nf(v / 1000)} unit=" GW" width={62} />
                  <Tooltip formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`} labelFormatter={(h) => hh(Number(h))} />
                  <Legend />
                  {day.net.ramp && <ReferenceArea x1={day.net.ramp.fromHour} x2={day.net.ramp.toHour} fill={CHART_COLOR.blue} fillOpacity={0.08} stroke="none" />}
                  <Line name="Tüketim" dataKey="consumption" stroke={CHART_COLOR.slate} isAnimationActive={false} />
                  <Line name="Rüzgâr (gerçek zamanlı)" dataKey="wind" stroke={MIX_COLOR.wind} isAnimationActive={false} />
                  <Line name="Güneş (KGÜP planı)" dataKey="sunPlan" stroke={MIX_COLOR.sun} isAnimationActive={false} />
                  <Line name="Net yük (tüketim taraflı)" dataKey="net" stroke={CHART_COLOR.red} isAnimationActive={false} />
                  <Line name="Net yük (arz taraflı)" dataKey="netSupply" stroke={CHART_COLOR.red} strokeDasharray="4 4" isAnimationActive={false} />
                </ComposedChart>
              </ChartCard>

              <ChartCard title="Üretim karması" description="MW. Gerçek zamanlı üretim (lisanssız güneş hariç); açık sarı bant lisanssız güneşin KGÜP planına göre tahmini payı.">
                <ComposedChart data={day.mix} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid />
                  <XAxis {...axis.x} />
                  <YAxis {...axis.y} tickFormatter={(v: number) => nf(v / 1000)} unit=" GW" width={62} />
                  <Tooltip formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`} labelFormatter={(h) => hh(Number(h))} />
                  <Legend />
                  {MIX_GROUPS.map((g) => (
                    <Area key={g.key} name={g.label} dataKey={g.key} stackId="mix" stroke={MIX_COLOR[g.key]} fill={MIX_COLOR[g.key]} fillOpacity={0.85} isAnimationActive={false} />
                  ))}
                </ComposedChart>
              </ChartCard>

              <ChartCard title="Net talimat ve sistem yönü" description="MWh. Çubuk: o saatte verilen net yük alma (+) ya da yük atma (−) talimatı; renk sistem yönü.">
                <BarChart data={day.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid />
                  <XAxis {...axis.x} />
                  <YAxis {...axis.y} tickFormatter={(v: number) => nf(v)} />
                  <Tooltip formatter={(v: unknown) => `${nf(Number(v ?? 0))} MWh`} labelFormatter={(h) => hh(Number(h))} cursor={{ fill: "#f1f5f9" }} />
                  <Bar name="Net talimat" dataKey="netInstruction" isAnimationActive={false}>
                    {day.rows.map((r) => (
                      <Cell key={r.hour} fill={DIRECTION_COLOR[r.direction ?? ""] ?? CHART_COLOR.slateLight} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
              {Object.entries(DIRECTION_LABEL).map(([k, label]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DIRECTION_COLOR[k] }} /> {label}
                </span>
              ))}
              {day.importExportMean !== null && (
                <span>
                  Ortalama {day.importExportMean < 0 ? "net ihracat" : "net ithalat"}: {nf(Math.abs(day.importExportMean))} MW (gerçek zamanlı)
                </span>
              )}
            </div>

            <details className="rounded-md border bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">Saatlik tablo</summary>
              <div className="overflow-x-auto px-2 pb-3">
                <DailyTable rows={day.rows} />
              </div>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
