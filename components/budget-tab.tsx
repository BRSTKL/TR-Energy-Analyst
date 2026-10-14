"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BudgetHydro, BudgetRule, BudgetSpread, ProjectBudget } from "@/lib/services/imbalance-budget";

const COLOR = { p50: "#2a78d6", p90: "#eb6834", p95: "#e34948", grid: "#e2e8f0", axis: "#64748b" };
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const m = (v: number) => `${nf(v / 1e6, 1)} M`;

const HYDRO: Array<{ id: BudgetHydro; label: string }> = [
  { id: "dry", label: "Kurak (2025 gibi)" },
  { id: "normal", label: "Normal" },
  { id: "wet", label: "Yağışlı (2026 gibi)" },
  { id: "custom", label: "Kendi tahminim" },
];
const SPREAD: Array<{ id: BudgetSpread; label: string }> = [
  { id: "y2026", label: "2026 düzeyi" },
  { id: "y2025", label: "2025'e iner" },
  { id: "wide", label: "%20 açılır" },
];
const RULE: Array<{ id: BudgetRule; label: string }> = [
  { id: "r2026", label: "2026 kuralı" },
  { id: "r2025", label: "2025 kuralı" },
  { id: "strict", label: "Sertleşme (%9)" },
];
type Unit = "REAL" | "NOMINAL" | "USD";

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 text-xs text-slate-500">{label}</span>
      {options.map((o) => (
        <Button key={o.id} size="sm" variant={value === o.id ? "default" : "outline"} onClick={() => onChange(o.id)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Planlama sayfasının "2027 bütçesi" sekmesi (PLAN 17.3): gelecek yılın aylık dengesizlik + KÜPST bütçesi, senaryolar ve
 * kötü durum aralığı. Hesap /api/projects/[id]/budget; birim reel TL (son ayın fiyat düzeyi), isteğe bağlı nominal ve USD.
 */
export function BudgetTab({ projectId }: { projectId: string }) {
  const [hydro, setHydro] = useState<BudgetHydro>("normal");
  const [spread, setSpread] = useState<BudgetSpread>("y2026");
  const [rule, setRule] = useState<BudgetRule>("r2026");
  const [gwhInput, setGwhInput] = useState("");
  const [gwh, setGwh] = useState<number | null>(null);
  const [inflation, setInflation] = useState("");
  const [unit, setUnit] = useState<Unit>("REAL");
  const [data, setData] = useState<ProjectBudget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ spread, rule, hydro });
    if (hydro === "custom" && gwh) q.set("gwh", String(gwh));
    fetch(`/api/projects/${projectId}/budget?${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
        if (!gwhInput) setGwhInput(String(Math.round(d.production.normal / 1000)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Bütçe yüklenemedi."))
      .finally(() => setLoading(false));
    // gwhInput yalnız ilk yüklemede doldurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, spread, rule, hydro, gwh]);

  const infl = Number(inflation.replace(",", "."));
  const hasInflation = inflation.trim() !== "" && Number.isFinite(infl);
  const factor = unit === "USD" ? data?.unit.usdPerTl ?? 1 : unit === "NOMINAL" && hasInflation ? 1 + infl / 100 : 1;
  const unitLabel = unit === "USD" ? "USD" : unit === "NOMINAL" && hasInflation ? `${data?.year ?? ""} TL, enflasyon varsayımı +%${nf(infl, 1)}` : data?.unit.label ?? "reel TL";
  const money = (v: number) => (unit === "USD" ? `${nf((v * factor) / 1e6, 2)} M USD` : `${m(v * factor)} TL`);
  const perMwh = (v: number) => (unit === "USD" ? `${nf(v * factor, 2)} USD` : `${nf(v * factor, 1)} TL`);

  const rows = data?.months ?? [];
  const chart = rows.map((r) => ({
    ay: MONTHS[Number(r.month) - 1],
    Bütçe: (r.p50 * factor) / 1e6,
    "Kötü ay (P90)": (r.p90 * factor) / 1e6,
    "Çok kötü ay (P95)": (r.p95 * factor) / 1e6,
  }));
  const bt = data?.backtest;

  function downloadCsv() {
    if (!data) return;
    const num = (v: number, d = 0) => v.toFixed(d).replace(".", ",");
    const head = ["Ay", "Üretim MWh", `MWh başına ${unitLabel}`, `Bütçe (medyan) ${unitLabel}`, `P90 ${unitLabel}`, `P95 ${unitLabel}`];
    const lines = rows.map((r) => [`${data.year}-${r.month}`, num(r.mwh), num(r.unit.p50 * factor, 2), num(r.p50 * factor), num(r.p90 * factor), num(r.p95 * factor)].join(";"));
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `butce_${data.year}_${data.project.name.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{data?.year ?? ""} dengesizlik bütçesi: senaryo</CardTitle>
          <CardDescription>
            Bütçe = MWh başına maliyet × üretim. MWh başına maliyet portföyün geçmiş günlerinden (sapma ve fiyat aynı günden), üretim seçilen
            senaryodan. Fiyat tahmini yapılmaz: geçmiş günler yeniden oynatılır.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Choice label="Üretim" value={hydro} options={HYDRO} onChange={setHydro} />
          {hydro === "custom" && (
            <div className="flex flex-wrap items-center gap-2 pl-20 text-sm">
              <input
                className="w-28 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
                inputMode="decimal"
                value={gwhInput}
                onChange={(e) => setGwhInput(e.target.value)}
                aria-label="Yıllık üretim tahmini (GWh)"
              />
              <span className="text-slate-600">GWh / yıl</span>
              <Button size="sm" variant="outline" onClick={() => setGwh(Number(gwhInput.replace(",", ".")) || null)}>
                Uygula
              </Button>
              <span className="text-xs text-slate-500">Normal yılın aylık dağılımıyla paylaştırılır.</span>
            </div>
          )}
          <Choice label="Makas" value={spread} options={SPREAD} onChange={setSpread} />
          <Choice label="Kural" value={rule} options={RULE} onChange={setRule} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-xs text-slate-500">Birim</span>
            <Button size="sm" variant={unit === "REAL" ? "default" : "outline"} onClick={() => setUnit("REAL")}>
              {data?.unit.label ?? "Reel TL"}
            </Button>
            <Button size="sm" variant={unit === "NOMINAL" ? "default" : "outline"} onClick={() => setUnit("NOMINAL")} disabled={!hasInflation}>
              Nominal {data?.year ?? ""} TL
            </Button>
            <Button size="sm" variant={unit === "USD" ? "default" : "outline"} onClick={() => setUnit("USD")} disabled={!data?.unit.usdPerTl}>
              USD
            </Button>
            <span className="ml-2 text-xs text-slate-500">Enflasyon varsayımı (%):</span>
            <input
              className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
              inputMode="decimal"
              placeholder="boş"
              value={inflation}
              onChange={(e) => setInflation(e.target.value)}
              aria-label="Enflasyon varsayımı"
            />
            <span className="text-xs text-slate-500">{data ? `${data.year} ortalama fiyat düzeyinin ${data.unit.label.replace(/ TL'si$/, "")} düzeyine göre artışı` : ""}</span>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {data && (
        <>
          <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
            <CardContent className="space-y-1 p-4 text-sm text-slate-800">
              <p className="text-base">
                {data.year} için dengesizlik + KÜPST bütçesi <b>{money(data.total.p50)}</b>{unit === "USD" ? "" : ` (${unitLabel})`}: aylık ortalama{" "}
                <b>{money(data.total.p50 / 12)}</b>, MWh başına <b>{perMwh(data.total.expected / data.total.mwh)}</b>,{" "}
                {nf(data.total.mwh / 1000)} GWh üretimle. Kötü durumda yıl {money(data.total.p90)} (P90); en pahalı ayın kötü durumu{" "}
                {money(Math.max(...rows.map((r) => r.p90)))}.
              </p>
              <p className="text-xs text-slate-600">
                Senaryo: {data.labels.hydro}; {data.labels.spread.toLocaleLowerCase("tr-TR")}; {data.labels.rule}. Üretim senaryoları: kurak{" "}
                {nf(data.production.dry / 1000)} GWh, normal {nf(data.production.normal / 1000)} GWh, yağışlı {nf(data.production.wet / 1000)} GWh.
              </p>
            </CardContent>
          </Card>

          {bt && (
            <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50/60 p-3 text-sm text-slate-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <span>
                <b>Ne kadar güvenilir?</b> Aynı yöntemle 2026 bütçesi yalnız 2025 verisiyle kurulup gerçekleşenle karşılaştırıldı ({bt.projects} portföy):
                ortalama tutuyor (gerçek / bütçe medyanı {nf(bt.asIs.ratioMedian, 2)}), ama kötü durum aralığı dar: ayların yalnız %
                {nf(bt.asIs.monthsWithinP90Pct)}&apos;i P90&apos;ın altında kaldı (beklenen %90; üretim doğru bilinseydi %{nf(bt.oracle.monthsWithinP90Pct)}).
                Büyük ıskalamalar hidro üretiminden (yağış) ve portföyün tahmin kalitesinin yıldan yıla değişmesinden geldi. P90 ve P95&apos;i alt sınır
                olarak okuyun; üretim senaryolarını birlikte değerlendirin.
              </span>
            </div>
          )}

          <Card className="shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Aylık bütçe ve kötü durum ({unitLabel})</CardTitle>
                <CardDescription>Çubuk: medyan bütçe; çizgiler: kötü ay (P90) ve çok kötü ay (P95). Milyon.</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadCsv}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLOR.grid} vertical={false} />
                    <XAxis dataKey="ay" tick={{ fontSize: 12, fill: COLOR.axis }} />
                    <YAxis tick={{ fontSize: 12, fill: COLOR.axis }} tickFormatter={(v: number) => nf(v, unit === "USD" ? 2 : 0)} width={48} />
                    <Tooltip formatter={(v) => `${nf(Number(v), unit === "USD" ? 2 : 1)} M`} />
                    <Legend />
                    <Bar isAnimationActive={false} dataKey="Bütçe" fill={COLOR.p50} radius={[4, 4, 0, 0]} />
                    <Line isAnimationActive={false} dataKey="Kötü ay (P90)" stroke={COLOR.p90} strokeWidth={2} dot={false} />
                    <Line isAnimationActive={false} dataKey="Çok kötü ay (P95)" stroke={COLOR.p95} strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ay</TableHead>
                    <TableHead className="text-right">Üretim</TableHead>
                    <TableHead className="text-right">MWh başına</TableHead>
                    <TableHead className="text-right">Bütçe (medyan)</TableHead>
                    <TableHead className="text-right">Kötü ay (P90)</TableHead>
                    <TableHead className="text-right">Çok kötü ay (P95)</TableHead>
                    <TableHead className="text-right">Örneklenen günler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.month}>
                      <TableCell>{MONTHS[Number(r.month) - 1]}</TableCell>
                      <TableCell className="text-right tabular-nums">{nf(r.mwh / 1000, 1)} GWh</TableCell>
                      <TableCell className="text-right tabular-nums">{perMwh(r.unit.p50)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(r.p50)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.p90)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.p95)}</TableCell>
                      <TableCell className="text-right text-xs text-slate-500">
                        {Object.entries(r.sourceDays)
                          .map(([y, n]) => `${y}: ${n}`)
                          .join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50 font-semibold">
                    <TableCell>Yıl</TableCell>
                    <TableCell className="text-right tabular-nums">{nf(data.total.mwh / 1000)} GWh</TableCell>
                    <TableCell className="text-right tabular-nums">{perMwh(data.total.expected / data.total.mwh)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.total.p50)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.total.p90)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.total.p95)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-slate-500">
            Varsayımlar: portföy bugünkü {nf(data.plantsUsed)} santraldir
            {data.plantsSkipped.length ? ` (${data.plantsSkipped.length} santralin bir yılda havuz verisi yok)` : ""}; günler {data.sourceLabel}{" "}
            döneminden. Sapma ilk KGÜP&apos;e göredir (havuzda 2025&apos;in son planı yok): bütçe gün içi düzeltmeden önceki maruziyettir, KÜPST de
            ilk plana göre (üst sınır). 2025 günleri portföyün son yıldaki tahmin kalitesine taşındı (MWh başına maliyet ×
            {nf(data.qualityScale, 2)}; varsayım: en güncel tahmin kalitesi sürer). Fiyat: her yılın makası seçilen düzeye ölçeklenir (reel ortalama
            makas 2025 {data.spread.y2025 !== null ? nf(data.spread.y2025) : "–"}, 2026 {data.spread.y2026 !== null ? nf(data.spread.y2026) : "–"}, senaryo{" "}
            {data.spread.target !== null ? nf(data.spread.target) : "–"} TL/MWh); dengesizlik fiyatı formülle (resmi fiyat senaryoda geçerli değil).
            Üretim: yıl içinde devreye giren santraller tam yıl; hidro kurak = 2025, yağışlı = 2026, normal = ortalama; diğer türler son yılın düzeyinde.
            Fiyat tahmini değildir: {data.year} fiyatları geçmiş günlerin içinde kalır.
          </p>
        </>
      )}
    </div>
  );
}
