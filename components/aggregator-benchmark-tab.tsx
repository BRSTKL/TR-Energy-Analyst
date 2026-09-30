"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MethodLink } from "@/components/method-link";
import type { AggregatorBenchmarkRow } from "@/lib/analysis/aggregator-benchmark";

/**
 * Sektör karnesi · Toplayıcılar sekmesi (PLAN 9.1): EPİAŞ'taki toplayıcıların aynı yöntemle kıyası. Sıralama varsayılanı
 * teknoloji karışımına göre düzeltilmiş endekstir (ham TL/MWh hidro ağırlıklı portföyleri kayırır).
 */

interface BenchmarkResponse {
  success: boolean;
  error?: string;
  years: number[];
  year: number;
  period: { start: string; end: string };
  membershipAsOf: string;
  sectorMedians?: Record<string, number>;
  aggregators: AggregatorBenchmarkRow[];
}

type Scale = "large" | "mid" | "small" | "all";
type Mix = "all" | "HES" | "RES" | "GES";
type SortKey = "mixAdjustedIndex" | "nettingPct" | "nettingValueTl" | "nettedTlPerMwh" | "productionMwh" | "coveredPlants";

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

function MixBar({ a }: { a: AggregatorBenchmarkRow }) {
  const m = mixShare(a);
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2.5 w-28 overflow-hidden rounded-full bg-slate-100">
        {(["HES", "RES", "GES"] as const).map((t) => (m[t] > 0 ? <div key={t} style={{ width: `${m[t]}%`, background: TECH_COLOR[t] }} /> : null))}
      </div>
      <span className="text-2xs text-slate-500">
        {(["HES", "RES", "GES"] as const)
          .filter((t) => m[t] >= 1)
          .map((t) => `${t} %${nf(m[t])}`)
          .join(" · ")}
      </span>
    </div>
  );
}

export function AggregatorBenchmarkTab({ year }: { year: number | null }) {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<Scale>("large");
  const [mix, setMix] = useState<Mix>("all");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "mixAdjustedIndex", asc: true });

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

  const rows = useMemo(() => {
    if (!data) return [];
    const inScale = (a: AggregatorBenchmarkRow) =>
      scale === "all" || (scale === "large" ? a.productionMwh >= LARGE : scale === "mid" ? a.productionMwh >= MID && a.productionMwh < LARGE : a.productionMwh < MID);
    // Teknoloji süzgeci: o teknoloji üretimin en az MIN_TECH_SHARE payıysa (yalnız en büyük pay değil; ör. %35 rüzgârlı
    // hidro ağırlıklı portföy de rüzgârda görünür)
    const hasTech = (a: AggregatorBenchmarkRow, t: string) => mixShare(a)[t] >= MIN_TECH_SHARE;
    const v = (a: AggregatorBenchmarkRow) => (a[sort.key] as number | null) ?? Infinity;
    return data.aggregators
      .filter((a) => a.productionMwh > 0 && inScale(a) && (mix === "all" || hasTech(a, mix)))
      .sort((a, b) => (sort.asc ? v(a) - v(b) : v(b) - v(a)));
  }, [data, scale, mix, sort, LARGE, MID]);

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
  const coverage = (a: AggregatorBenchmarkRow) => (a.listedPlants ? a.coveredPlants / a.listedPlants : 0);
  const best = [...rows].filter((a) => a.mixAdjustedIndex !== null).sort((a, b) => a.mixAdjustedIndex! - b.mixAdjustedIndex!)[0];
  const totalValue = rows.reduce((s, a) => s + a.nettingValueTl, 0);

  const headers: Array<{ key: SortKey | null; label: string; right?: boolean; title?: string }> = [
    { key: null, label: "#" },
    { key: null, label: "Toplayıcı" },
    { key: "coveredPlants", label: "Santral", right: true, title: "Analize giren / EPİAŞ listesindeki" },
    { key: "productionMwh", label: "Üretim", right: true },
    { key: null, label: "Karışım (üretim)" },
    { key: "nettingValueTl", label: "Netleşme değeri", right: true },
    { key: "nettingPct", label: "Netleşme", right: true, title: "Netleşme değeri / sahipler tek başına" },
    { key: "nettedTlPerMwh", label: "TL/MWh", right: true, title: "Portföyde netleşmiş dengesizlik / üretim" },
    { key: "mixAdjustedIndex", label: "Endeks", right: true, title: "Portföy maliyeti / aynı karışımdaki sektör medyanı maliyeti; 1'in altı daha iyi" },
  ];
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: key === "mixAdjustedIndex" || key === "nettedTlPerMwh" }));

  const downloadCsv = () => {
    const head = ["Toplayıcı", "Santral (analizde)", "Santral (liste)", "Üretim MWh", "HES %", "RES %", "GES %", "Sahipler tek başına TL", "Portföy TL", "Netleşme değeri TL", "Netleşme %", "TL/MWh", "Beklenen maliyet TL", "Endeks"];
    const lines = rows.map((a) => {
      const m = mixShare(a);
      return [a.name, a.coveredPlants, a.listedPlants, a.productionMwh.toFixed(0), m.HES.toFixed(1), m.RES.toFixed(1), m.GES.toFixed(1), a.ownerLevelCostTl.toFixed(0), a.portfolioCostTl.toFixed(0), a.nettingValueTl.toFixed(0), a.nettingPct.toFixed(1), a.nettedTlPerMwh.toFixed(1), a.expectedCostTl.toFixed(0), a.mixAdjustedIndex?.toFixed(3) ?? ""]
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

  const pill = <T extends string>(value: T, current: T, set: (v: T) => void, text: string) => (
    <Button key={value} size="sm" variant={current === value ? "default" : "outline"} className="h-8 text-xs" onClick={() => set(value)}>
      {text}
    </Button>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Toplayıcılar arası kıyas · {label}</CardTitle>
          <CardDescription>
            EPİAŞ&apos;ın {data.membershipAsOf} tarihli toplayıcı listelerindeki lisanslı santraller, aynı yöntemle: saatlik sapma, resmi dengesizlik
            fiyatı, gün içi işlemler öncesi, KÜPST hariç. <b>Endeks</b> teknoloji karışımından arındırılmış ölçüdür: portföyün netleşmiş maliyeti /
            aynı karışımdaki sektör ortalaması santrallerin tek başına maliyeti (1&apos;in altı daha iyi).{" "}
            <MethodLink section="toplayici-kiyas" label="Yöntem" />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ölçek:</span>
            {pill<Scale>("large", scale, setScale, `Büyük (${gwh(LARGE)} üstü)`)}
            {pill<Scale>("mid", scale, setScale, `Orta (${gwh(MID)}–${gwh(LARGE)})`)}
            {pill<Scale>("small", scale, setScale, "Küçük")}
            {pill<Scale>("all", scale, setScale, "Tümü")}
            <span className="ml-3 text-xs font-semibold uppercase tracking-wider text-slate-500" title={`Üretiminin en az %${MIN_TECH_SHARE} kadarı bu teknoloji olan toplayıcılar`}>
              Teknoloji (üretimin %{MIN_TECH_SHARE}+):
            </span>
            {pill<Mix>("all", mix, setMix, "Tümü")}
            {pill<Mix>("HES", mix, setMix, "Hidro")}
            {pill<Mix>("RES", mix, setMix, "Rüzgâr")}
            {pill<Mix>("GES", mix, setMix, "Güneş")}
            <Button size="sm" variant="outline" className="ml-auto h-8 gap-1.5 text-xs" onClick={downloadCsv}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
          {rows.length > 0 && (
            <p className="text-sm text-slate-700">
              {rows.length} toplayıcı; toplam netleşme değeri <b>{mTl(totalValue)}</b>.
              {best && (
                <>
                  {" "}
                  Karışıma göre en iyi endeks <b>{shortName(best.name)}</b> ({nf(best.mixAdjustedIndex!, 2)}): aynı karışımdaki ortalama santrallerin ödeyeceğinin %
                  {nf(best.mixAdjustedIndex! * 100)} kadarını ödüyor.
                </>
              )}
            </p>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h) => (
                    <TableHead
                      key={h.label}
                      title={h.title}
                      className={`${h.right ? "text-right" : ""} ${h.key ? "cursor-pointer select-none hover:text-slate-900" : ""}`}
                      onClick={h.key ? () => toggleSort(h.key!) : undefined}
                    >
                      {h.label}
                      {h.key && sort.key === h.key ? (sort.asc ? " ▲" : " ▼") : ""}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a, i) => {
                  const low = coverage(a) < LOW_COVERAGE;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                      <TableCell className="font-medium" title={a.name}>
                        {shortName(a.name)}
                        {low && (
                          <span
                            className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-2xs font-semibold text-amber-700"
                            title="Listedeki santrallerin %60'ından azı analizde (çoğu lisanssız); sonuç portföyün tamamını temsil etmeyebilir"
                          >
                            <AlertTriangle className="h-3 w-3" /> düşük kapsam
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {a.coveredPlants}
                        <span className="text-slate-400"> / {a.listedPlants}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{gwh(a.productionMwh)}</TableCell>
                      <TableCell>
                        <MixBar a={a} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{mTl(a.nettingValueTl)}</TableCell>
                      <TableCell className="text-right tabular-nums">%{nf(a.nettingPct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{nf(a.nettedTlPerMwh)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{a.mixAdjustedIndex !== null ? nf(a.mixAdjustedIndex, 2) : "–"}</TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-sm text-slate-500">
                      Bu süzgeçte toplayıcı yok. Ölçek süzgecini &quot;Tümü&quot; yapmayı deneyin.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-2xs text-slate-500">
            Santral: analize giren / EPİAŞ listesindeki (santral bazında üretimi yayımlanmayan lisanssız santraller analizde yok). Düşük kapsam: listenin
            %60&apos;ından azı. Netleşme: sahipler tek başına ödeyeceğine göre portföyün kazandırdığı pay. Üyelik listenin tarihine göredir (santraller dönem
            boyunca portföydeymiş gibi).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Büyüklük ve performans</CardTitle>
          <CardDescription>Yatay: üretim (GWh). Dikey: karışıma göre düzeltilmiş endeks (aşağısı daha iyi). Nokta büyüklüğü santral sayısı; turuncu: düşük kapsam.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" dataKey="x" name="Üretim" unit=" GWh" tick={{ fontSize: 11 }} stroke="#64748b" tickFormatter={(v) => nf(Number(v))} />
                <YAxis type="number" dataKey="y" name="Endeks" tick={{ fontSize: 11 }} stroke="#64748b" width={48} tickFormatter={(v) => nf(Number(v), 2)} />
                <ZAxis type="number" dataKey="z" range={[40, 400]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as (typeof scatter)[number] | undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded-md border bg-white px-2.5 py-1.5 text-xs shadow">
                        <b>{p.name}</b>
                        <div>
                          {nf(p.x)} GWh · endeks {nf(p.y, 2)} · {p.z} santral
                        </div>
                        {p.low && <div className="text-amber-700">düşük kapsam</div>}
                      </div>
                    );
                  }}
                />
                <Scatter data={scatter} label={{ dataKey: "name", position: "top", fontSize: 10, fill: "#475569" }}>
                  {scatter.map((p) => (
                    <Cell key={p.name} fill={p.low ? "#f59e0b" : "#0e8c7e"} fillOpacity={0.75} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
