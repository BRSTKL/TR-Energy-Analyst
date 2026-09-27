"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COST_FACTORS, type CostChangePeriod, type CostChangeResult } from "@/lib/analysis/cost-change";

export interface CostChangeData {
  a: { id: string; name: string };
  b: { id: string; name: string };
  result: CostChangeResult;
}

const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v: number, d = 1) => (Math.abs(v) < 0.05 ? "≈0" : `${v > 0 ? "+" : "−"}${nf(Math.abs(v), d)}`);
/** Toplam sütunlar nötr; artış kırmızı, azalış mavi, etkileşim gri */
const COLOR = { total: "#64748b", up: "#e34948", down: "#2a78d6", interaction: "#b4b2a9", grid: "#e2e8f0", axis: "#64748b" };

interface Step {
  name: string;
  base: number;
  bar: number;
  fill: string;
  display: string;
  hint: string;
}

/** Eksen yazısı iki satıra bölünür ("Tahmin / hatası") */
function WrappedTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const words = (payload?.value ?? "").split(" ");
  const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : words;
  return (
    <text x={x} y={(y ?? 0) + 12} textAnchor="middle" fontSize={11} fill={COLOR.axis}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 13}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function waterfall(r: CostChangeResult): Step[] {
  const steps: Step[] = [{ name: r.a.label, base: 0, bar: r.a.unitCostTl, fill: COLOR.total, display: nf(r.a.unitCostTl, 1), hint: "Başlangıç: MWh başına maliyet" }];
  let level = r.a.unitCostTl;
  const deltas = [
    ...COST_FACTORS.map((f) => ({ name: f.label, hint: f.hint, value: r.effects.find((e) => e.factor === f.id)!.tlPerMwh, interaction: false })),
    { name: "Etkileşim", hint: "Kalemlerin birlikte değişmesinden doğan kalan", value: r.interactionTlPerMwh, interaction: true },
  ];
  for (const d of deltas) {
    const next = level + d.value;
    steps.push({
      name: d.name,
      base: Math.min(level, next),
      bar: Math.abs(d.value),
      fill: d.interaction ? COLOR.interaction : d.value >= 0 ? COLOR.up : COLOR.down,
      display: signed(d.value),
      hint: d.hint,
    });
    level = next;
  }
  steps.push({ name: r.b.label, base: 0, bar: r.b.unitCostTl, fill: COLOR.total, display: nf(r.b.unitCostTl, 1), hint: "Bitiş: MWh başına maliyet" });
  return steps;
}

const ROWS: Array<{ label: string; value: (p: CostChangePeriod) => string; hint?: string }> = [
  { label: "MWh başına maliyet", value: (p) => `${nf(p.unitCostTl, 1)} TL`, hint: "Uzlaştırma biriminde netleşmiş" },
  { label: "Tahmin hatası (netleşmiş)", value: (p) => `%${nf(p.errorPct, 1)}`, hint: "Σ|net sapma| / Σ üretim" },
  { label: "Santral bazında sapma", value: (p) => `%${nf(p.plantErrorPct, 1)}`, hint: "Netleşmeden önce" },
  { label: "Sapma MWh'ı başına bedel", value: (p) => `${nf(p.penaltyTlPerMwh)} TL` },
  { label: "Sistemle aynı yönde sapma", value: (p) => `%${nf(p.sameDirectionPct)}`, hint: "Makas yalnızca bu sapmayı fiyatlar" },
  { label: "Ortalama SMF–PTF makası", value: (p) => `${nf(p.meanSpreadTl)} TL/MWh` },
  { label: "Maliyetin makastan gelen kısmı", value: (p) => (p.costTl > 0 ? `%${nf((p.composition.spreadTl / p.costTl) * 100)}` : "–"), hint: "Kalanı katsayı × fiyat" },
];

export function CostChangeCard({ data }: { data: CostChangeData }) {
  const r = data.result;
  const steps = waterfall(r);
  const cov = r.coverage;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Maliyet neden değişti? {r.a.label} → {r.b.label}
        </CardTitle>
        <CardDescription>
          {data.a.name} ile {data.b.name}: MWh başına dengesizlik maliyeti farkı dört kaleme ayrıldı. Her kalem tek başına diğer dönemin
          değeriyle değiştirilip aynı takvim saatlerinde yeniden fiyatlandı; kalemlerin birlikte değişmesinden kalan kısım etkileşimdir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <p className="font-semibold text-slate-900">{r.sentences[0]}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {r.sentences.slice(1).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">
            {/* Dar ekranda grafik kendi içinde kayar; sayfa kaymaz */}
            <div className="overflow-x-auto">
            <div className="h-[310px] w-full min-w-[520px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={steps} margin={{ top: 24, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke={COLOR.grid} />
                  <XAxis dataKey="name" tick={<WrappedTick />} height={36} stroke={COLOR.axis} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} stroke={COLOR.axis} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => nf(v)} />
                  <Tooltip
                    cursor={{ fill: "#f1f5f9" }}
                    content={({ active, payload }) => {
                      const s = active && payload?.[0] ? (payload[0].payload as Step) : null;
                      return s ? (
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                          <p className="font-semibold text-slate-900">
                            {s.name}: {s.display} TL/MWh
                          </p>
                          <p className="text-slate-500">{s.hint}</p>
                        </div>
                      ) : null;
                    }}
                  />
                  <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="bar" stackId="w" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {steps.map((s) => (
                      <Cell key={s.name} fill={s.fill} />
                    ))}
                    <LabelList dataKey="display" position="top" style={{ fontSize: 12, fontWeight: 600, fill: "#334155" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              TL/MWh · kırmızı: maliyeti artıran, mavi: azaltan kalem, gri: etkileşim. Dört kalemin açıkladığı pay: %{nf(r.explainedPct, 1)}.
            </p>
          </div>

          <div className="lg:col-span-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gösterge</TableHead>
                  <TableHead className="text-right">{r.a.label}</TableHead>
                  <TableHead className="text-right">{r.b.label}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROWS.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="py-2">
                      <p className="text-sm text-slate-800">{row.label}</p>
                      {row.hint && <p className="text-xs text-slate-500">{row.hint}</p>}
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums">{row.value(r.a)}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums font-medium">{row.value(r.b)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <ul className="grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
          {COST_FACTORS.map((f) => (
            <li key={f.id}>
              <span className="font-medium text-slate-800">{f.label}:</span> {f.hint}.
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          Kapsam: iki dönemde de verisi olan {nf(cov.commonHours)} takvim saati ({r.a.label}: {nf(cov.hoursA)}, {r.b.label}: {nf(cov.hoursB)}) ve{" "}
          {cov.commonPlants.length} ortak santral.
          {cov.onlyA.length > 0 && ` Yalnızca ${r.a.label} projesinde: ${cov.onlyA.join(", ")}.`}
          {cov.onlyB.length > 0 && ` Yalnızca ${r.b.label} projesinde: ${cov.onlyB.join(", ")}.`} Üretim hacmi tek başına MWh başına maliyeti
          değiştirmez (sapma ve üretim birlikte büyür); etkisi profil üzerinden gelir.
        </p>
      </CardContent>
    </Card>
  );
}
