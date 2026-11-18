"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileDown, Loader2 } from "lucide-react";
import { ResponsiveContainer, Scatter, ScatterChart, ZAxis, Cell } from "recharts";
import { ChartGrid as CartesianGrid, ChartTip as Tooltip, ChartXAxis as XAxis, ChartYAxis as YAxis } from "@/components/ui/chart";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MethodLink } from "@/components/method-link";
import { placeLabels, type LabelSide as Side } from "@/lib/chart-labels";
import type { AggregatorBenchmarkRow } from "@/lib/analysis/aggregator-benchmark";

/** Sektör karnesi · Toplayıcılar sekmesi (PLAN 9.1); görünümler aşağıda `AggregatorBenchmarkTab` açıklamasında. */

interface BenchmarkResponse {
  success: boolean;
  error?: string;
  years: number[];
  year: number;
  period: { start: string; end: string };
  membershipAsOf: string;
  /** Ay ay üyelik uygulandıysa son üyelik ayı ("09") */
  membershipMonthlyTo?: string | null;
  sectorMedians?: Record<string, number>;
  aggregators: AggregatorBenchmarkRow[];
}

type Scale = "large" | "mid" | "small" | "all";
type Mix = "all" | "HES" | "RES" | "GES";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const mTl = (v: number) => `${nf(v / 1e6, 1)} M ₺`;
const gwh = (mwh: number) => `${nf(mwh / 1000, 0)} GWh`;
/** Kapsam bu oranın altındaysa (santral bazında üretimi yayımlanan santral / listedeki santral) uyarı */
const LOW_COVERAGE = 0.6;
/** Teknoloji süzgecinde o teknolojinin üretimdeki en az payı (%) */
const MIN_TECH_SHARE = 20;
const TECH_COLOR: Record<string, string> = { HES: "#2563eb", RES: "#0891b2", GES: "#f59e0b" };

function shortName(name: string) {
  const cap = (w: string) => `${w.charAt(0)}${w.slice(1).replace(/İ/g, "i").toLowerCase()}`;
  const ws = name.trim().split(/\s+/);
  return ws[0] === "ENERJİSA" || ws[0] === "ENERJISA" ? `${cap(ws[0])} ${cap(ws[1] ?? "")}` : cap(ws[0]);
}

const mixShare = (a: AggregatorBenchmarkRow) => {
  const tot = Object.values(a.byTypeMwh ?? {}).reduce((x, y) => x + y, 0) || 1;
  return Object.fromEntries(["HES", "RES", "GES"].map((t) => [t, ((a.byTypeMwh?.[t] ?? 0) / tot) * 100])) as Record<string, number>;
};

const TECH_NAME: Record<string, string> = { HES: "Hidro", RES: "Rüzgâr", GES: "Güneş" };

/** Teknoloji karışımı: yalnız çubuk; yüzdeler üzerine gelince (renk açıklaması tablonun üstünde) */
function MixBar({ a }: { a: AggregatorBenchmarkRow }) {
  const m = mixShare(a);
  const title = (["HES", "RES", "GES"] as const)
    .filter((t) => m[t] >= 1)
    .map((t) => `${TECH_NAME[t]} %${nf(m[t])}`)
    .join(" · ");
  return (
    <div className="flex h-2 w-32 overflow-hidden rounded-full bg-slate-100" title={title}>
      {(["HES", "RES", "GES"] as const).map((t) => (m[t] > 0 ? <div key={t} style={{ width: `${m[t]}%`, background: TECH_COLOR[t] }} /> : null))}
    </div>
  );
}

type ScatterPoint = { x: number; y: number; z: number; name: string; low: boolean };

const LABEL_FONT = 10;

/** Büyüklük–endeks dağılımı; etiketler çakışmayacak biçimde yerleştirilir (noktaların ekran konumu çizimden okunur) */
function ScatterPanel({ scatter }: { scatter: ScatterPoint[] }) {
  const pos = useRef<Record<number, { x: number; y: number; r: number }>>({});
  const [sides, setSides] = useState<Side[]>([]);
  // Her çizimden sonra (yeniden boyutlanma dahil) yerleşimi hesapla; değişmediyse durum güncellenmez
  // Bağımlılık dizisi bilerek yok: yerleşim her çizimde okunur; durum yalnızca değişince güncellendiğinden döngü oluşmaz
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const pts = scatter.map((p, i) => ({ ...(pos.current[i] ?? { x: 0, y: 0, r: 0 }), name: p.name }));
    if (pts.some((p) => p.x === 0 && p.y === 0)) return;
    const next = placeLabels(pts);
    setSides((cur) => (cur.length === next.length && cur.every((v, i) => v === next[i]) ? cur : next));
  });
  const renderLabel = (props: any) => {
    // x ve y noktanın sınır kutusunun sol üst köşesidir; merkez ve yarıçap kutudan
    const { index, width, height } = props;
    const r = (width ?? 12) / 2;
    const x = props.x + r;
    const y = props.y + (height ?? 12) / 2;
    pos.current[index] = { x, y, r };
    const side = sides[index] ?? "top";
    const name = scatter[index]?.name ?? "";
    const gap = r + 4;
    const at = {
      top: { x, y: y - gap, anchor: "middle" },
      bottom: { x, y: y + gap + LABEL_FONT - 2, anchor: "middle" },
      right: { x: x + gap, y: y + LABEL_FONT / 2 - 1, anchor: "start" },
      left: { x: x - gap, y: y + LABEL_FONT / 2 - 1, anchor: "end" },
    }[side];
    return (
      <text key={index} x={at.x} y={at.y} textAnchor={at.anchor as any} fontSize={LABEL_FONT} fill="#475569">
        {name}
      </text>
    );
  };
  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 24, right: 40, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" dataKey="x" name="Üretim" unit=" GWh" tickMargin={6} tick={{ fontSize: 11 }} stroke="#64748b" tickFormatter={(v) => nf(Number(v))} />
          <YAxis type="number" dataKey="y" name="Endeks" tick={{ fontSize: 11 }} stroke="#64748b" width={48} tickCount={6} tickFormatter={(v) => nf(Number(v), 2)} domain={[(d: number) => Math.max(0, Math.floor((d - 0.05) * 10) / 10), (d: number) => Math.ceil((d + 0.03) * 10) / 10]} />
          <ZAxis type="number" dataKey="z" range={[40, 400]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as ScatterPoint | undefined;
              if (!p) return null;
              return (
                <div className="rounded-lg border bg-popover p-3 text-xs shadow-sm shadow-black/5">
                  <b>{p.name}</b>
                  <div>
                    {nf(p.x)} GWh · endeks {nf(p.y, 2)} · {p.z} santral
                  </div>
                  {p.low && <div className="text-amber-700">düşük kapsam</div>}
                </div>
              );
            }}
          />
          <Scatter data={scatter} label={renderLabel}>
            {scatter.map((p) => (
              <Cell key={p.name} fill={p.low ? "#f59e0b" : "#0e8c7e"} fillOpacity={0.75} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

type View = "forecast" | "invoice";

/** Faturaya yakın maliyet (TL/MWh): son plana göre dengesizlik + GİP işlem maliyeti; son plan yoksa null */
const invoiceTlPerMwh = (a: AggregatorBenchmarkRow) => (a.intraday ? (a.intraday.finalCostTl + a.intraday.tradeCostTl) / a.productionMwh : null);
/** Tahmin kalitesi (TL/MWh): ilk plana göre, portföyde netleşmiş */
const forecastTlPerMwh = (a: AggregatorBenchmarkRow) => a.nettedTlPerMwh;

/**
 * Sektör karnesi · Toplayıcılar sekmesi (sadeleştirildi 18.11.2026): tek tablo, iki görünüm.
 *   - Tahmin kalitesi: ilk plana göre (gün içi işlemler öncesi) netleşmiş maliyet; "sektöre göre" teknoloji karışımından
 *     arındırılmış endeks (portföy maliyeti / aynı karışımdaki sektör ortalaması).
 *   - Faturaya yakın: son plana göre dengesizlik + GİP işlem maliyeti ((ilk − son plan) × (GİP − PTF); lib/analysis/
 *     aggregator-benchmark.ts `aggregatorIntraday`). Fatura son plana göre kesilir; ikili anlaşma ve gerçek işlem fiyatı yok.
 * Yöntem ayrıntıları "Nasıl hesaplandı?" altında.
 */
export function AggregatorBenchmarkTab({ year }: { year: number | null }) {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<Scale>("all");
  const [mix, setMix] = useState<Mix>("all");
  const [view, setView] = useState<View>("forecast");

  useEffect(() => {
    setError(null);
    fetch(`/api/sector/aggregators${year ? `?year=${year}` : ""}`)
      .then((r) => r.json())
      .then((d: BenchmarkResponse) => (d.success ? setData(d) : setError(d.error ?? "Kıyas yüklenemedi.")))
      .catch(() => setError("Kıyas yüklenemedi."));
  }, [year]);

  // Ölçek eşikleri dönemin ay sayısıyla orantılı (8 ayda 1.000 GWh / 300 GWh)
  const factor = useMemo(() => {
    if (!data) return 1;
    const ym = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
    return Math.max(1, ym(data.period.end) - ym(data.period.start) + 1) / 8;
  }, [data]);
  const LARGE = 1_000_000 * factor;
  const MID = 300_000 * factor;

  const filtered = useMemo(() => {
    if (!data) return [];
    const inScale = (a: AggregatorBenchmarkRow) =>
      scale === "all" || (scale === "large" ? a.productionMwh >= LARGE : scale === "mid" ? a.productionMwh >= MID && a.productionMwh < LARGE : a.productionMwh < MID);
    // Teknoloji süzgeci: o teknoloji üretimin en az MIN_TECH_SHARE payıysa
    const hasTech = (a: AggregatorBenchmarkRow, t: string) => mixShare(a)[t] >= MIN_TECH_SHARE;
    return data.aggregators.filter((a) => a.productionMwh > 0 && inScale(a) && (mix === "all" || hasTech(a, mix)));
  }, [data, scale, mix, LARGE, MID]);

  // Tahmin kalitesinde sıra karışıma göre düzeltilmiş endeksle (ham TL/MWh hidro ağırlıklı portföyleri kayırır); faturada TL/MWh ile
  const rows = useMemo(() => {
    const key = (a: AggregatorBenchmarkRow) => (view === "forecast" ? a.mixAdjustedIndex : invoiceTlPerMwh(a)) ?? Infinity;
    return [...filtered].sort((a, b) => key(a) - key(b));
  }, [filtered, view]);
  /** Tahmin kalitesindeki sıra (faturada sıra değişimini göstermek için) */
  const forecastRank = useMemo(() => {
    const s = [...filtered].sort((a, b) => (a.mixAdjustedIndex ?? Infinity) - (b.mixAdjustedIndex ?? Infinity));
    return new Map(s.map((a, i) => [a.id, i + 1]));
  }, [filtered]);

  if (error)
    return (
      <Card>
        <CardContent className="py-8 text-sm text-rose-700">{error}</CardContent>
      </Card>
    );
  if (!data)
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Toplayıcı kıyası yükleniyor…
      </p>
    );

  const label = `${MONTHS[Number(data.period.start.slice(5, 7)) - 1]}–${MONTHS[Number(data.period.end.slice(5, 7)) - 1]} ${data.year}`;
  // Kapsam, analiz edilen türlerdeki (rüzgâr, güneş, hidro) santrallere göre
  const eligible = (a: AggregatorBenchmarkRow) => a.listedPlants - (a.otherTechPlants ?? 0);
  const coverage = (a: AggregatorBenchmarkRow) => (eligible(a) > 0 ? a.coveredPlants / eligible(a) : 0);
  const cost = (a: AggregatorBenchmarkRow) => (view === "forecast" ? forecastTlPerMwh(a) : invoiceTlPerMwh(a));
  const costs = rows.map(cost).filter((v): v is number => v !== null).sort((x, y) => x - y);
  const median = costs.length ? costs[(costs.length - 1) >> 1] : null;
  const best = rows[0];

  const downloadCsv = () => {
    const head = ["Toplayıcı", "Santral (analizde)", "Üretim MWh", "HES %", "RES %", "GES %", "Tahmin kalitesi TL/MWh (ilk plan)", "Sektöre göre endeks", "Portföy kazancı TL", "Faturaya yakın TL/MWh", "Gün içi kazanç %"];
    const lines = rows.map((a) => {
      const m = mixShare(a);
      const inv = invoiceTlPerMwh(a);
      return [a.name, a.coveredPlants, a.productionMwh.toFixed(0), m.HES.toFixed(1), m.RES.toFixed(1), m.GES.toFixed(1), a.nettedTlPerMwh.toFixed(1), a.mixAdjustedIndex?.toFixed(3) ?? "", a.nettingValueTl.toFixed(0), inv?.toFixed(1) ?? "", a.intraday?.netPct.toFixed(1) ?? ""]
        .map((v) => String(v).replace(/\./g, ","))
        .join(";");
    });
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `toplayici-kiyasi-${data.year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const scatter = rows
    .filter((a) => a.mixAdjustedIndex !== null)
    .map((a) => ({ x: a.productionMwh / 1000, y: a.mixAdjustedIndex!, z: a.coveredPlants, name: shortName(a.name), low: coverage(a) < LOW_COVERAGE }));

  const pill = <T extends string>(value: T, current: T, set: (v: T) => void, text: string, group = "") => (
    <Button key={`${group}-${value}`} size="sm" variant={current === value ? "default" : "outline"} className="h-8 text-xs" onClick={() => set(value)}>
      {text}
    </Button>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Toplayıcılar · {label}</CardTitle>
          <CardDescription>
            Toplayıcıların rüzgâr, güneş ve hidro santrallerinin dengesizlik maliyeti, EPİAŞ kamu verisiyle ve herkese aynı yöntemle. Tutarlar üretilen
            MWh başına; <b>düşük olan daha iyi</b>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Görünüm">
            {(
              [
                ["forecast", "Tahmin kalitesi", "Gün öncesi plana göre: şirket üretimini ne kadar iyi tahmin ediyor?"],
                ["invoice", "Faturaya yakın", "Gün içi alım satımdan sonra: şirket sonunda ne kadar ödüyor? (tahmini)"],
              ] as const
            ).map(([id, title, text]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={`rounded-lg border p-3 text-left transition-colors ${view === id ? "border-slate-900 bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}
              >
                <div className="text-sm font-semibold">{title}</div>
                <div className={`mt-0.5 text-xs ${view === id ? "text-slate-300" : "text-slate-500"}`}>{text}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Büyüklük:</span>
            {pill<Scale>("large", scale, setScale, `Büyük (${gwh(LARGE)} üstü)`)}
            {pill<Scale>("mid", scale, setScale, "Orta")}
            {pill<Scale>("small", scale, setScale, "Küçük")}
            {pill<Scale>("all", scale, setScale, "Tümü")}
            <span className="ml-3 text-xs font-semibold text-slate-500">Teknoloji:</span>
            {pill<Mix>("all", mix, setMix, "Tümü", "mix")}
            {pill<Mix>("HES", mix, setMix, "Hidro", "mix")}
            {pill<Mix>("RES", mix, setMix, "Rüzgâr", "mix")}
            {pill<Mix>("GES", mix, setMix, "Güneş", "mix")}
            <Button size="sm" variant="outline" className="ml-auto h-8 gap-1.5 text-xs" onClick={downloadCsv}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>

          {best && cost(best) !== null && median !== null && (
            <p className="text-sm text-slate-700">
              {rows.length} toplayıcı. {view === "forecast" ? "Sektöre göre en iyi" : "Faturaya yakın en düşük"}: <b>{shortName(best.name)}</b>, MWh başına{" "}
              <b>{nf(cost(best)!)} TL</b>. Ortanca toplayıcı {nf(median)} TL.
            </p>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Toplayıcı</TableHead>
                  <TableHead className="text-right">Üretim</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <span className="sr-only">Teknoloji karışımı</span>
                    <span className="inline-flex items-center gap-2 text-2xs font-normal text-slate-500">
                      {(["HES", "RES", "GES"] as const).map((t) => (
                        <span key={t} className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: TECH_COLOR[t] }} /> {TECH_NAME[t]}
                        </span>
                      ))}
                    </span>
                  </TableHead>
                  <TableHead className="text-right">TL/MWh</TableHead>
                  <TableHead className="text-right" title={view === "forecast" ? "Aynı teknoloji karışımındaki sektör ortalamasına göre; %100'ün altı daha iyi" : "Gün içi alım satımın maliyeti düşürme oranı"}>
                    {view === "forecast" ? "Sektör ortalamasına göre" : "Gün içi kazanç"}
                  </TableHead>
                  <TableHead className="w-8">
                    <span className="sr-only">Özet indir</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a, i) => {
                  const low = coverage(a) < LOW_COVERAGE;
                  const c = cost(a);
                  const move = (forecastRank.get(a.id) ?? i + 1) - (i + 1);
                  return (
                    <TableRow key={a.id} className="group">
                      <TableCell className="text-xs tabular-nums text-slate-400">
                        {i + 1}
                        {view === "invoice" && move !== 0 && c !== null && (
                          <span className={`ml-1 ${move > 0 ? "text-teal-700" : "text-rose-700"}`} title={`Tahmin kalitesinde ${forecastRank.get(a.id)}. sırada`}>
                            {move > 0 ? `▲${move}` : `▼${-move}`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 font-medium" title={a.name}>
                        <Link href={`/sector/aggregators/${a.id}?year=${data.year}`} className="text-slate-900 hover:text-teal-700 hover:underline">
                          {shortName(a.name)}
                        </Link>
                        <div className="text-2xs font-normal text-slate-500">
                          {a.coveredPlants} santral
                          {low && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600" title={`Listedeki ${eligible(a)} santralin yalnız ${a.coveredPlants} tanesinin verisi var`}>
                              <AlertTriangle className="h-3 w-3" aria-hidden /> eksik veri
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{gwh(a.productionMwh)}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <MixBar a={a} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{c === null ? <span className="font-normal text-slate-400">veri yok</span> : nf(c)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {view === "forecast" ? (
                          a.mixAdjustedIndex === null ? (
                            <span className="text-slate-400">–</span>
                          ) : (
                            <span className={a.mixAdjustedIndex < 1 ? "text-teal-700" : "text-amber-700"}>%{nf(a.mixAdjustedIndex * 100)}</span>
                          )
                        ) : a.intraday ? (
                          <span className={a.intraday.netPct > 0 ? "text-teal-700" : "text-rose-700"}>%{nf(a.intraday.netPct)}</span>
                        ) : (
                          <span className="text-slate-400">–</span>
                        )}
                      </TableCell>
                      <TableCell className="w-8 text-right">
                        <a
                          href={`/api/sector/aggregators/${a.id}/summary?year=${data.year}`}
                          className="inline-block text-slate-300 transition-colors hover:text-teal-700 group-hover:text-slate-500"
                          title="1 sayfa özet (PPTX) indir"
                          aria-label={`${shortName(a.name)} için 1 sayfa özet indir`}
                        >
                          <FileDown className="h-4 w-4" />
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-slate-500">
                      Bu süzgeçte toplayıcı yok. Büyüklük süzgecini &quot;Tümü&quot; yapmayı deneyin.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <details className="rounded-lg border bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-800">Nasıl hesaplandı?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Kaynak EPİAŞ şeffaflık platformu: santrallerin saatlik üretimi, planları ve resmî dengesizlik fiyatları. Toplayıcıların gün içi işlemleri ve ikili
                anlaşmaları kamuya açık değil; KÜPST dahil değil.
              </li>
              <li>
                {data.membershipMonthlyTo
                  ? `Üyelik EPİAŞ'ın ay ay toplayıcı listelerinden: her santral yalnız üye olduğu aylarla sayılır (güncel liste ${data.membershipAsOf}).`
                  : `Üyelik EPİAŞ'ın ${data.membershipAsOf} tarihli listesinden (bütün dönem bu listeyle).`}{" "}
                Santrallerin sapmaları toplayıcının portföyünde saat saat netleşir.
              </li>
              <li>
                <b>Tahmin kalitesi:</b> sapma şirketin gün öncesi bildirdiği ilk plana göre. <b>Sektör ortalamasına göre</b>: aynı rüzgâr / güneş / hidro karışımındaki
                ortalama santrallerin ödeyeceğinin yüzde kaçını ödediği (hidro ağırlıklı portföy doğal olarak ucuz olduğu için ham TL/MWh yerine sıra buna göre).
              </li>
              <li>
                <b>Faturaya yakın:</b> fatura son plana (gün içi işlemlerden sonraki plana) göre kesilir. Son plana göre dengesizlik + gün içi alım satımın tahmini
                maliyeti (plan değişikliği × gün içi ortalama fiyat ile PTF farkı). Gerçek işlem fiyatları ve ikili anlaşmalar görülmediği için tahmindir.
              </li>
              <li>
                Portföy kazancı (CSV ve toplayıcı sayfasında): santraller tek başına uzlaştırılsaydı ödenecek tutara göre portföyde netleşmenin kazandırdığı.
                Bu dönemde tablodaki toplayıcılarda toplam {mTl(rows.reduce((s, a) => s + a.nettingValueTl, 0))}.
              </li>
              <li>&quot;Eksik veri&quot;: toplayıcının rüzgâr, güneş ve hidro santrallerinin %60&apos;ından azının verisi var; sonuç portföyün tamamını temsil etmeyebilir.</li>
            </ul>
            <MethodLink section="toplayici-kiyas" label="Ayrıntılı yöntem" />
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Büyüklük ve tahmin kalitesi</CardTitle>
          <CardDescription>Sağa doğru büyük, aşağı doğru iyi (sektör ortalamasına göre). Turuncu: eksik veri.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScatterPanel scatter={scatter} />
        </CardContent>
      </Card>
    </div>
  );
}
