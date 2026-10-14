"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Info, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LOW_PRICE_MAX, ZERO_PRICE_MAX, pairMonths, type MarketSummary } from "@/lib/analysis/market-summary";
import type { DirectionBacktest, Forecaster } from "@/lib/analysis/direction-backtest";

import { MethodLink } from "@/components/method-link";
import { pctOf } from "@/lib/format";
interface MarketResponse {
  available: { start: string; end: string; lastFullMonthEnd: string };
  period: { start: string; end: string; label: string };
  previousPeriod: { start: string; end: string; label: string; verifiedHours: number; compared: boolean };
  current: MarketSummary;
  previous: MarketSummary | null;
  sentences: string[];
  unverifiedHours: { current: number; previous: number };
  units: {
    real: UnitView & { baseMonth: string };
    usd: UnitView;
    sources: { usdTry: string; cpi: string };
  };
}

interface UnitView {
  current: MarketSummary;
  previous: MarketSummary | null;
  label: string;
  short: string;
  filled: string[];
}

type Unit = "TL" | "REAL" | "USD";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** Doğrulanmış renk seti: seçilen dönem vurgulu, önceki yıl gri; sistem yönü kırmızı (açık) ↔ mavi (fazla), dengede gri */
const COLOR = { cur: "#2a78d6", prev: "#b4b2a9", smf: "#eb6834", deficit: "#e34948", surplus: "#2a78d6", balanced: "#c8c7c1", grid: "#e2e8f0", axis: "#64748b" };

const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (a: number, b: number) => (a === 0 ? null : ((b - a) / Math.abs(a)) * 100);
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±");
const signed = (v: number, d = 0) => `${sign(v)}${nf(Math.abs(v), d)}`;
/** Türkçe yüzde: "+%45" */
const signedPct = (v: number) => `${sign(v)}%${nf(Math.abs(v))}`;
const monthName = (key: string) => MONTHS_SHORT[Number(key.slice(5, 7)) - 1];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Seçilebilir aylar: doğrulanmış verinin ilk ve son ayı arasında, o yıla düşenler */
function monthsOf(year: number, a: MarketResponse["available"]): number[] {
  const [sy, sm] = [Number(a.start.slice(0, 4)), Number(a.start.slice(5, 7))];
  const [ey, em] = [Number(a.end.slice(0, 4)), Number(a.end.slice(5, 7))];
  const from = year === sy ? sm : 1;
  const to = year === ey ? em : 12;
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

function ChartCard({ title, description, children, wide }: { title: string; description: string; children: React.ReactElement; wide?: boolean }) {
  return (
    <Card className={`shadow-sm ${wide ? "lg:col-span-2" : ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

const axis = {
  x: { tick: { fontSize: 11 }, stroke: COLOR.axis, tickLine: false },
  y: { tick: { fontSize: 11 }, stroke: COLOR.axis, tickLine: false, axisLine: false, width: 52, tickFormatter: (v: number) => nf(v) },
};
/** Lejant yazısı metin renginde; seri rengini yanındaki işaret taşır */
const legend = { wrapperStyle: { fontSize: 12 }, formatter: (v: string) => <span className="text-slate-600">{v}</span> };
const tlTooltip = (unit: string, d = 0) => (v: unknown) => `${nf(Number(v ?? 0), d)} ${unit}`;
function downloadCsv(data: MarketResponse, view: { current: MarketSummary; previous: MarketSummary | null }, priceUnit: string, names: { cur: string; prev: string }) {
  const num = (v: number | null | undefined, d = 1) => (v == null ? "" : v.toFixed(d).replace(".", ","));
  const u = ` (${priceUnit})`;
  const head = ["Ay", "Saat", `PTF ort.${u}`, `SMF ort.${u}`, `Makas ort.${u}`, `Makas P90${u}`, `Makas ${names.prev}${u}`, "Açık %", "Fazla %", "Dengede %", "Sıfır fiyatlı saat", "1.000 TL altı saat (nominal)", `GİP AOF${u}`, "GİP hacmi MWh"];
  const lines = pairMonths(view.previous, view.current).map(({ key, cur, prev }) =>
    [key, String(cur.hours), num(cur.ptfMean), num(cur.smfMean), num(cur.spreadMean), num(cur.spreadP90), num(prev?.spreadMean), num(cur.deficitPct), num(cur.surplusPct), num(cur.balancedPct), String(cur.zeroHours), String(cur.lowHours), num(cur.gipWeightedPrice), num(cur.gipVolumeMwh, 0)]
      .map((c) => `"${c.replace(/"/g, '""')}"`)
      .join(";")
  );
  // Türkçe Excel ayırıcı olarak noktalı virgül ve ondalık virgül bekler; BOM Türkçe karakterleri korur
  const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `piyasa_ozeti_${data.period.start}_${data.period.end}${priceUnit === "TL/MWh" ? "" : priceUnit.startsWith("$") ? "_usd" : "_reel"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function MarketPage() {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [unit, setUnit] = useState<Unit>("TL");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/market${range ? `?start=${range.start}&end=${range.end}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Piyasa verisi yüklenemedi."))
      .finally(() => setLoading(false));
  }, [range]);

  // Fiyatlar seçilen birimde; sayımlar (saat, sıfır fiyatlı saat, yön) birimden bağımsız
  const view = useMemo(
    () => (!data ? null : unit === "TL" ? { current: data.current, previous: data.previous } : unit === "REAL" ? data.units.real : data.units.usd),
    [data, unit]
  );
  const pairs = useMemo(() => (view ? pairMonths(view.previous, view.current) : []), [view]);

  if (!data || !view) {
    return error ? (
      <div className="mx-auto max-w-3xl space-y-3 p-8">
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>
        <Link href="/projects" className="text-sm text-sky-700 underline">
          Projelerim ekranındaki &quot;EPİAŞ Canlı Veri Çek&quot; ile piyasa verisini çekin
        </Link>
      </div>
    ) : (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Piyasa verisi yükleniyor…
      </div>
    );
  }

  const c = view.current;
  const p = view.previous;
  /** Fiyat birimi ve basamak: USD küçük sayılar, bir ondalık */
  const pu = unit === "TL" ? "TL/MWh" : unit === "REAL" ? `${data.units.real.short}/MWh` : "$/MWh";
  const pd = unit === "USD" ? 1 : 0;
  const money = (v: number) => nf(v, pd);
  const unitNote =
    unit === "REAL"
      ? `Reel TL: her saat kendi ayının TÜFE'siyle ${data.units.real.label} fiyatlarına taşındı.`
      : unit === "USD"
        ? "USD: her saat kendi ayının TL/USD kuruyla (EPİAŞ PTF TL / USD oranı, aylık medyan) çevrildi."
        : "Nominal TL: yıllar arası kıyasta enflasyon dahildir; reel TL ya da USD seçerek arındırabilirsiniz.";
  const filled = unit === "REAL" ? data.units.real.filled : unit === "USD" ? data.units.usd.filled : [];
  const year = Number(data.period.start.slice(0, 4));
  const sameYear = data.period.end.startsWith(String(year));
  const names = sameYear ? { cur: String(year), prev: String(year - 1) } : { cur: "Seçilen dönem", prev: "Bir yıl önce" };
  const years = Array.from({ length: Number(data.available.end.slice(0, 4)) - Number(data.available.start.slice(0, 4)) + 1 }, (_, i) => Number(data.available.start.slice(0, 4)) + i);
  const months = monthsOf(year, data.available);
  const startMonth = Number(data.period.start.slice(5, 7));
  const endMonth = sameYear ? Number(data.period.end.slice(5, 7)) : months[months.length - 1];
  /** Ay aralığından dönem: bitiş, verinin son gününü aşmaz */
  const select = (y: number, from: number, to: number) => {
    const end = iso(y, to, lastDay(y, to));
    setRange({ start: iso(y, from, 1), end: end > data.available.end ? data.available.end : end });
  };

  const monthly = pairs.map(({ key, cur, prev }) => ({
    month: monthName(key),
    [`Makas ${names.cur}`]: cur.spreadMean,
    [`Makas ${names.prev}`]: prev?.spreadMean ?? null,
    [`PTF ${names.cur}`]: cur.ptfMean,
    [`SMF ${names.cur}`]: cur.smfMean,
    [`PTF ${names.prev}`]: prev?.ptfMean ?? null,
    [`Sıfır fiyatlı saat ${names.cur}`]: cur.zeroHours,
    [`Sıfır fiyatlı saat ${names.prev}`]: prev?.zeroHours ?? null,
    "Sistem açığı": cur.deficitPct,
    Dengede: cur.balancedPct,
    "Sistem fazlası": cur.surplusPct,
  }));
  const hourly = c.hourProfile.map((b, hr) => ({
    hour: String(hr).padStart(2, "0"),
    [`Makas ${names.cur}`]: b.spreadMean,
    [`Makas ${names.prev}`]: p?.hourProfile[hr].spreadMean ?? null,
    [`Sıfır fiyatlı saat ${names.cur}`]: b.zeroHours,
    [`Sıfır fiyatlı saat ${names.prev}`]: p?.hourProfile[hr].zeroHours ?? null,
  }));
  const peakSpreadHour = c.hourProfile.reduce((best, b, hr) => (b.spreadMean > c.hourProfile[best].spreadMean ? hr : best), 0);
  const peakZeroHour = c.hourProfile.reduce((best, b, hr) => (b.zeroHours > c.hourProfile[best].zeroHours ? hr : best), 0);

  const vsPrev = (cur: number, prev: number | undefined, kind: "pct" | "pt" = "pct") => {
    if (prev === undefined) return null;
    if (kind === "pt") return `${names.prev}: %${nf(prev)} · ${signed(cur - prev, 1)} puan`;
    const ch = pct(prev, cur);
    return `${names.prev}: ${unit === "USD" ? nf(prev, 1) : nf(prev)}${ch === null ? "" : ` · ${signedPct(ch)}`}`;
  };
  const tiles: Array<{ label: string; value: string; sub: string; delta: string | null; key?: boolean }> = [
    {
      label: "SMF–PTF makası",
      value: `${money(c.spread.mean)} ${pu}`,
      sub:
        (c.spreadPctOfPtf !== null ? `PTF'nin ${pctOf(c.spreadPctOfPtf)}${p?.spreadPctOfPtf != null ? ` (${names.prev}: %${nf(p.spreadPctOfPtf)})` : ""} · ` : "") +
        `P90 ${money(c.spread.p90)} · açıkta SMF ${signed(c.directionalSpread.deficit, pd)}, fazlada ${signed(-c.directionalSpread.surplus, pd)}`,
      delta: vsPrev(c.spread.mean, p?.spread.mean),
      key: true,
    },
    { label: "Ortalama PTF", value: `${money(c.ptf.mean)} ${pu}`, sub: `medyan ${money(c.ptf.median)} · P10–P90 ${money(c.ptf.p10)}–${money(c.ptf.p90)}`, delta: vsPrev(c.ptf.mean, p?.ptf.mean) },
    { label: "Ortalama SMF", value: `${money(c.smf.mean)} ${pu}`, sub: `medyan ${money(c.smf.median)} · P10–P90 ${money(c.smf.p10)}–${money(c.smf.p90)}`, delta: vsPrev(c.smf.mean, p?.smf.mean) },
    {
      label: "Sistem açığındaki saat",
      value: `%${nf(c.direction.deficitPct)}`,
      sub: `fazla %${nf(c.direction.surplusPct)} · dengede %${nf(c.direction.balancedPct)}`,
      delta: vsPrev(c.direction.deficitPct, p?.direction.deficitPct, "pt"),
    },
    {
      label: "Sıfır fiyatlı saat",
      value: nf(c.zeroHours),
      sub: `${nf(LOW_PRICE_MAX)} TL/MWh (nominal) altı ${nf(c.lowHours)} saat (dönemin %${nf((c.lowHours / c.hours) * 100, 1)})`,
      delta: vsPrev(c.zeroHours, p?.zeroHours),
    },
    {
      label: "GİP ağırlıklı ortalama fiyat",
      value: c.gip.weightedPrice === null ? "–" : `${money(c.gip.weightedPrice)} ${pu}`,
      sub: c.gip.hours ? `saatte ort. ${nf(c.gip.avgHourlyVolumeMwh)} MWh · toplam ${nf(c.gip.totalVolumeMwh / 1000)} GWh` : "GİP verisi yok",
      delta: c.gip.weightedPrice !== null && p?.gip.weightedPrice != null ? vsPrev(c.gip.weightedPrice, p.gip.weightedPrice) : null,
    },
  ];

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
              <span className="font-medium text-slate-700">Piyasa</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Piyasa özeti {data.period.label}</h1>
            <MethodLink section="piyasa" label="Yöntem ve varsayımlar" />
            <p className="mt-1 max-w-3xl text-xs text-slate-600 sm:text-sm">
              EPİAŞ saatlik PTF, SMF, sistem yönü ve GİP verisinden {nf(c.hours)} saat. SMF–PTF makası, dengesizliğin gün öncesi
              fiyatından ne kadar uzakta uzlaştığını gösterir; sistemle aynı yöndeki her MWh sapmanın bedeli bu farkla büyür.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            <div role="group" aria-label="Fiyat birimi" className="flex h-9 overflow-hidden rounded-md border border-slate-200 bg-white text-sm">
              {([
                ["TL", "Nominal TL"],
                ["REAL", "Reel TL"],
                ["USD", "USD"],
              ] as Array<[Unit, string]>).map(([u, label]) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unit === u}
                  onClick={() => setUnit(u)}
                  className={`px-3 ${unit === u ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              aria-label="Yıl"
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={year}
              onChange={(e) => {
                const y = Number(e.target.value);
                const ms = monthsOf(y, data.available);
                select(y, ms[0], ms[ms.length - 1]);
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              aria-label="Başlangıç ayı"
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={startMonth}
              onChange={(e) => select(year, Number(e.target.value), Math.max(Number(e.target.value), endMonth))}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {MONTHS[m - 1]}
                </option>
              ))}
            </select>
            <span className="text-slate-400">–</span>
            <select
              aria-label="Bitiş ayı"
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={endMonth}
              onChange={(e) => select(year, Math.min(startMonth, Number(e.target.value)), Number(e.target.value))}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {MONTHS[m - 1]}
                </option>
              ))}
            </select>
            <Button asChild variant="outline" size="sm">
              <Link href="/sector">Sektör karnesi</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

        <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Ne değişti? {data.period.label} ile {data.previousPeriod.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.sentences.length > 0 ? (
              <>
                <p className="text-lg font-semibold leading-snug text-slate-900">{data.sentences[0]}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {data.sentences.slice(1).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            ) : data.previousPeriod.compared ? (
              <p className="text-sm text-slate-700">İki dönem arasında belirgin bir değişim yok (makas ve PTF farkı %5&apos;in altında).</p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-slate-700">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <span>
                  {data.previousPeriod.label} için karşılaştırılabilir doğrulanmış veri yok ({nf(data.previousPeriod.verifiedHours)} saat
                  {data.unverifiedHours.previous > 0 ? `; ${nf(data.unverifiedHours.previous)} saat eski formatta, doğrulanmamış` : ""}).
                  Bu dönemin piyasa verisi EPİAŞ&apos;tan yeniden çekilince karşılaştırma açılır.
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        <p className="-mb-3 text-xs text-slate-600">
          {unitNote}
          {filled.length > 0 && ` ${filled.join(", ")} için seride veri yok; en yakın ayın değeri kullanıldı.`}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className={`rounded-lg border bg-white p-3 ${t.key ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"}`}>
              <p className="text-xs font-medium text-slate-500">{t.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{t.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t.sub}</p>
              {t.delta && <p className="mt-1 text-xs font-medium text-slate-700">{t.delta}</p>}
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            wide
            title="Aylık SMF–PTF makası"
            description={`Saat başına ortalama |SMF − PTF| (${pu})${p ? `, ${names.prev} aynı aylarıyla yan yana` : ""}.`}
          >
            <BarChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="month" {...axis.x} />
              <YAxis {...axis.y} />
              <Tooltip formatter={tlTooltip(pu, pd)} cursor={{ fill: "#f1f5f9" }} />
              <Legend {...legend} />
              {p && <Bar isAnimationActive={false} dataKey={`Makas ${names.prev}`} fill={COLOR.prev} radius={[4, 4, 0, 0]} />}
              <Bar isAnimationActive={false} dataKey={`Makas ${names.cur}`} fill={COLOR.cur} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard title="Aylık PTF ve SMF" description={`Aylık ortalama (${pu})${p ? `; gri: ${names.prev} PTF` : ""}.`}>
            <LineChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="month" {...axis.x} />
              <YAxis {...axis.y} domain={["auto", "auto"]} />
              <Tooltip formatter={tlTooltip(pu, pd)} />
              <Legend {...legend} />
              {p && <Line isAnimationActive={false} type="monotone" dataKey={`PTF ${names.prev}`} stroke={COLOR.prev} strokeWidth={2} dot={false} />}
              <Line isAnimationActive={false} type="monotone" dataKey={`PTF ${names.cur}`} stroke={COLOR.cur} strokeWidth={2} dot={{ r: 3 }} />
              <Line isAnimationActive={false} type="monotone" dataKey={`SMF ${names.cur}`} stroke={COLOR.smf} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartCard>

          <ChartCard title="Sistem yönü, aylık" description="Saatlerin yüzde kaçında sistem açıkta, dengede ya da fazlada.">
            <BarChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="month" {...axis.x} />
              <YAxis {...axis.y} domain={[0, 100]} tickFormatter={(v: number) => `%${v}`} />
              <Tooltip formatter={(v: unknown) => `%${nf(Number(v ?? 0), 1)}`} cursor={{ fill: "#f1f5f9" }} />
              <Legend {...legend} />
              <Bar isAnimationActive={false} stackId="d" dataKey="Sistem açığı" fill={COLOR.deficit} stroke="#fff" strokeWidth={1} />
              <Bar isAnimationActive={false} stackId="d" dataKey="Dengede" fill={COLOR.balanced} stroke="#fff" strokeWidth={1} />
              <Bar isAnimationActive={false} stackId="d" dataKey="Sistem fazlası" fill={COLOR.surplus} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard
            wide
            title="Günün saatine göre makas"
            description={`Türkiye saati; ortalama |SMF − PTF| (${pu}). En geniş: ${String(peakSpreadHour).padStart(2, "0")}:00, ${money(c.hourProfile[peakSpreadHour].spreadMean)} ${pu}.`}
          >
            <BarChart data={hourly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={1}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="hour" {...axis.x} interval={2} />
              <YAxis {...axis.y} />
              <Tooltip formatter={tlTooltip(pu, pd)} labelFormatter={(h) => `${h}:00`} cursor={{ fill: "#f1f5f9" }} />
              <Legend {...legend} />
              {p && <Bar isAnimationActive={false} dataKey={`Makas ${names.prev}`} fill={COLOR.prev} radius={[2, 2, 0, 0]} />}
              <Bar isAnimationActive={false} dataKey={`Makas ${names.cur}`} fill={COLOR.cur} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard title="Sıfır fiyatlı saatler, aylık" description={`PTF ≤ ${nf(ZERO_PRICE_MAX)} TL/MWh olan saat sayısı.`}>
            <BarChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="month" {...axis.x} />
              <YAxis {...axis.y} allowDecimals={false} />
              <Tooltip formatter={tlTooltip("saat")} cursor={{ fill: "#f1f5f9" }} />
              <Legend {...legend} />
              {p && <Bar isAnimationActive={false} dataKey={`Sıfır fiyatlı saat ${names.prev}`} fill={COLOR.prev} radius={[4, 4, 0, 0]} />}
              <Bar isAnimationActive={false} dataKey={`Sıfır fiyatlı saat ${names.cur}`} fill={COLOR.cur} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard
            title="Sıfır fiyatlı saatler, günün saatine göre"
            description={c.zeroHours ? `Türkiye saati. En sık: ${String(peakZeroHour).padStart(2, "0")}:00 (${nf(c.hourProfile[peakZeroHour].zeroHours)} saat).` : "Dönemde sıfır fiyatlı saat yok."}
          >
            <BarChart data={hourly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={1}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="hour" {...axis.x} interval={2} />
              <YAxis {...axis.y} allowDecimals={false} />
              <Tooltip formatter={tlTooltip("saat")} labelFormatter={(h) => `${h}:00`} cursor={{ fill: "#f1f5f9" }} />
              <Legend {...legend} />
              {p && <Bar isAnimationActive={false} dataKey={`Sıfır fiyatlı saat ${names.prev}`} fill={COLOR.prev} radius={[2, 2, 0, 0]} />}
              <Bar isAnimationActive={false} dataKey={`Sıfır fiyatlı saat ${names.cur}`} fill={COLOR.cur} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>

        <DirectionForecastCard />

        <Card className="shadow-sm">
          <CardHeader className="gap-3 pb-3 md:flex-row md:items-center md:justify-between md:space-y-0">
            <div>
              <CardTitle className="text-base">Ay ay piyasa tablosu</CardTitle>
              <CardDescription>Fiyatlar {pu}; makas sütununda {p ? `${names.prev} → ${names.cur}` : "seçilen dönem"}.</CardDescription>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv(data, view, pu, names)}>
              <Download className="h-3.5 w-3.5" /> Excel (CSV)
            </Button>
          </CardHeader>
          <CardContent className="overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ay</TableHead>
                  <TableHead className="text-right">PTF</TableHead>
                  <TableHead className="text-right">SMF</TableHead>
                  <TableHead className="text-right">Makas</TableHead>
                  <TableHead className="text-right">Makas P90</TableHead>
                  <TableHead className="text-right">Açık %</TableHead>
                  <TableHead className="text-right">Sıfır fiyatlı saat</TableHead>
                  <TableHead className="text-right">{nf(LOW_PRICE_MAX)} TL altı saat (nominal)</TableHead>
                  <TableHead className="text-right">GİP AOF</TableHead>
                  <TableHead className="text-right">GİP hacmi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairs.map(({ key, cur, prev }) => {
                  const ch = prev ? pct(prev.spreadMean, cur.spreadMean) : null;
                  return (
                    <TableRow key={key}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {MONTHS[Number(key.slice(5, 7)) - 1]} {key.slice(0, 4)}
                        {cur.hours < lastDay(Number(key.slice(0, 4)), Number(key.slice(5, 7))) * 24 && (
                          <span className="ml-1 text-xs font-normal text-slate-500">({nf(cur.hours)} saat)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(cur.ptfMean)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(cur.smfMean)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {prev && <span className="text-slate-500">{money(prev.spreadMean)} → </span>}
                        <span className="font-semibold text-slate-900">{money(cur.spreadMean)}</span>
                        {ch !== null && <span className="ml-1 text-xs text-slate-500">({signedPct(ch)})</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(cur.spreadP90)}</TableCell>
                      <TableCell className="text-right tabular-nums">%{nf(cur.deficitPct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{nf(cur.zeroHours)}</TableCell>
                      <TableCell className="text-right tabular-nums">{nf(cur.lowHours)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cur.gipWeightedPrice === null ? "–" : money(cur.gipWeightedPrice)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{nf(cur.gipVolumeMwh / 1000)} GWh</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-xs text-slate-500">
          Kaynak: EPİAŞ Şeffaflık Platformu saatlik PTF, SMF, sistem yönü ve GİP (saatlik kontrat eşleşmeleri); yalnızca EPİAŞ&apos;tan
          çekilmiş ya da dosyadan yüklenmiş doğrulanmış kayıtlar.
          {data.unverifiedHours.current > 0 && ` Bu dönemde ${nf(data.unverifiedHours.current)} saat eski formatta (doğrulanmamış) olduğu için dışarıda.`} Makas
          |SMF − PTF|; açıkta SMF − PTF, fazlada PTF − SMF. Sıfır fiyatlı saat: PTF ≤ {nf(ZERO_PRICE_MAX)} TL/MWh. GİP AOF hacim
          ağırlıklıdır. Karşılaştırma bir önceki yılın aynı günleriyle ve ancak o dönemin en az %90&apos;ı doluysa yapılır. Birimler: TL/USD{" "}
          {data.units.sources.usdTry}; TÜFE {data.units.sources.cpi.split(" · ")[0]}.
        </p>
      </main>
    </div>
  );
}

type DirectionSummary = Omit<DirectionBacktest, "predictions">;

const FORECASTER_LABEL: Record<Forecaster, string> = { model: "Model", climatology: "Saat bazında geçmiş oran", persistence: "Son bilinen yön" };
const INFO_LABEL = { "D-1": "Gün öncesi (D-2 sonuna kadarki veri)", "H-2": "Gün içi (2 saat önceki veri)" } as const;

/** Aşama 14.3: sistem yönü tahmininin geçmişle sınaması (kendi verisini ayrı çeker) */
function DirectionForecastCard() {
  const [results, setResults] = useState<DirectionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/market/direction")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setResults(d.results);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yön tahmini yüklenemedi."));
  }, []);

  const calibration = useMemo(() => {
    if (!results) return [];
    return results[0].calibration.map((bin, i) => {
      const row: Record<string, number | string | null> = { label: bin.label, "Kusursuz kalibrasyon": (i + 0.5) * 10 };
      for (const r of results) {
        const b = r.calibration[i];
        row[INFO_LABEL[r.infoTime]] = b.n >= 30 ? Math.round(b.observedRate * 1000) / 10 : null;
      }
      return row;
    });
  }, [results]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sistem yönü tahmini: geçmişte ne kadar tuttu?</CardTitle>
        <CardDescription>
          Her ay, model yalnız önceki (en çok 4) aydan öğrenip o ayın her saati için sistemin açık verme olasılığını tahmin eder. İki basit rakiple
          kıyaslanır. Brier skoru düşük olan daha iyi; 0,25 yazı-tura düzeyidir. Ayrıntı: Metodoloji.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {!results && !error && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Sınama çalıştırılıyor…
          </p>
        )}
        {results && (
          <div className="grid gap-4 lg:grid-cols-2">
            {results.map((r) => {
              const s = r.total.scores;
              // Makas: en iyi rakibe göre fark %2'den küçükse "aynı düzeyde"
              const bestRival = Math.min(s.climatology.spreadMae, s.persistence.spreadMae);
              const spreadGain = bestRival > 0 ? (bestRival - s.model.spreadMae) / bestRival : 0;
              const spreadNote =
                spreadGain >= 0.02
                  ? ` Makas tahmini de en iyi rakipten %${nf(spreadGain * 100)} iyi.`
                  : spreadGain > -0.02
                    ? " Makas büyüklüğü tahmininde model rakipleriyle aynı düzeyde; kararda yalnız yön olasılığı kullanılır."
                    : " Makas büyüklüğü tahmininde model rakiplerini yenemiyor; kararda yalnız yön olasılığı kullanılır.";
              return (
                <div key={r.infoTime} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">{INFO_LABEL[r.infoTime]}</p>
                  <p className={`text-sm ${r.gate.passed ? "text-emerald-800" : "text-amber-800"}`}>{r.gate.verdict}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tahminci</TableHead>
                        <TableHead className="text-right">Brier</TableHead>
                        <TableHead className="text-right">Yön isabeti</TableHead>
                        <TableHead className="text-right">Makas hatası</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(["model", "climatology", "persistence"] as Forecaster[]).map((f) => (
                        <TableRow key={f}>
                          <TableCell className={f === "model" ? "font-medium" : "text-slate-600"}>{FORECASTER_LABEL[f]}</TableCell>
                          <TableCell className="text-right tabular-nums">{nf(s[f].brier, 3)}</TableCell>
                          <TableCell className="text-right tabular-nums">%{nf(s[f].accuracy * 100, 1)}</TableCell>
                          <TableCell className="text-right tabular-nums">{nf(s[f].spreadMae)} TL</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-slate-500">
                    {nf(r.months.length)} test ayı ({monthName(r.months[0]?.month ?? "2025-01")} {r.months[0]?.month.slice(0, 4)} –{" "}
                    {monthName(r.months.at(-1)?.month ?? "2025-01")} {r.months.at(-1)?.month.slice(0, 4)}), {nf(r.total.scores.model.n)} saat.
                    {spreadNote}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {results && (
          <div>
            <p className="mb-1 text-sm font-medium text-slate-800">Kalibrasyon: model &quot;%X açık&quot; dediğinde gerçekte ne oldu?</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calibration} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={COLOR.grid} />
                  <XAxis dataKey="label" {...axis.x} />
                  <YAxis {...axis.y} domain={[0, 100]} tickFormatter={(v) => `%${v}`} />
                  <Tooltip formatter={(v: unknown) => (v === null ? "–" : `%${nf(Number(v), 1)}`)} />
                  <Legend {...legend} />
                  <Line isAnimationActive={false} dataKey="Kusursuz kalibrasyon" stroke={COLOR.prev} strokeDasharray="4 4" dot={false} />
                  <Line isAnimationActive={false} dataKey={INFO_LABEL["D-1"]} stroke={COLOR.smf} connectNulls />
                  <Line isAnimationActive={false} dataKey={INFO_LABEL["H-2"]} stroke={COLOR.cur} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500">
              Kesikli çizgiye yakınlık iyi kalibrasyon demektir. 30 saatten az örneği olan kutular gösterilmez. Tatil takvimi ve yük / YEK
              tahmini gibi dış girdiler henüz modelde yok.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
