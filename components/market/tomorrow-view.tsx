"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { BarChart, ComposedChart, ReferenceLine } from "recharts";
import {
  ChartArea as Area,
  ChartBar as ChartBarMark,
  ChartGrid as CartesianGrid,
  ChartLegend as Legend,
  ChartLine as Line,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
  CHART_COLOR,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartCard } from "@/components/market/chart-card";
import { Kpi, hh } from "@/components/market/daily-dashboard";
import { PriceLimitNote } from "@/components/market/price-limit-note";
import { DAY_CLASS_LABEL } from "@/lib/analysis/daily-market";
import { LEVEL_LABEL, type PriceLimit } from "@/lib/analysis/price-limit";
import type { TomorrowView } from "@/lib/analysis/tomorrow-view";
import { nf } from "@/lib/format";

const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}%${nf(Math.abs(v))}`;
const POSITION_LABEL = {
  above: "bandın üstünde",
  below: "bandın altında",
  within: "bant içinde",
} as const;
const axis = {
  x: { dataKey: "hour", interval: 2 as const, tickFormatter: (h: number) => hh(h) },
};

export function TomorrowViewPanel({
  view,
  limit,
  notes,
  updatedAt,
}: {
  view: TomorrowView;
  limit: PriceLimit | null;
  notes: string[];
  updatedAt: string;
}) {
  const p = view.ptf;
  const warnings = [...view.warnings, ...notes];
  return (
    <>
      <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        Yarının açıklanmış verisi (PTF, yük tahmini, GÖP hacmi). Fiyat tahmini değildir:
        PTF zaten açıklandı; görünüm fiyatın benzer günlere ve yük seviyesine göre nerede
        durduğunu gösterir. Güncelleme{" "}
        {new Date(updatedAt).toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Istanbul",
        })}
        ; veri 5 dakikada bir yenilenir.
      </div>
      <PriceLimitNote limit={limit} />
      {warnings.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="PTF ortalaması"
          value={p.mean === null ? "–" : `${nf(p.mean)} TL/MWh`}
          sub={
            p.vsReferencePct !== null
              ? `Kıyas ortancasına göre ${signedPct(p.vsReferencePct)} (${DAY_CLASS_LABEL[view.dayClass]} günleri)`
              : "Kıyas bandı yok"
          }
        />
        <Kpi
          label="En pahalı / en ucuz saat"
          value={p.max && p.min ? `${hh(p.max.hour)} / ${hh(p.min.hour)}` : "–"}
          sub={
            p.max && p.min ? `${nf(p.max.value)} / ${nf(p.min.value)} TL/MWh` : undefined
          }
        />
        <Kpi
          label="Kıyas bandı dışı saat"
          value={view.rows.some((r) => r.position !== null) ? `${p.hoursAbove} üstte / ${p.hoursBelow} altta` : "–"}
          sub={view.rows.some((r) => r.position !== null) ? "%25–%75 aralığına göre" : "Kıyas bandı yok"}
        />
        <Kpi
          label="Akşam – öğle farkı"
          value={p.eveningMinusNoon === null ? "–" : `${nf(p.eveningMinusNoon)} TL/MWh`}
          sub={
            p.refEveningMinusNoon !== null
              ? `PTF(18–21) − PTF(11–14); kıyas ${nf(p.refEveningMinusNoon)}`
              : "PTF(18–21) − PTF(11–14)"
          }
        />
        <Kpi
          label="Fiyat limiti"
          value={limit ? `${p.capHours} limitte / ${p.nearHours} yakın` : "–"}
          sub={
            limit
              ? `Limit ${nf(limit.cap)} TL/MWh${p.zeroHours ? ` · ${p.zeroHours} sıfır fiyatlı saat` : ""}`
              : "Limit çıkarılamadı"
          }
          tone={p.capHours > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Yük tahmini zirvesi"
          value={
            view.load.peak
              ? `${hh(view.load.peak.hour)} · ${nf(view.load.peak.value / 1000, 1)} GW`
              : "–"
          }
          sub={
            view.load.meanVsRefPct !== null
              ? `Ortalama kıyas ortancasına göre ${signedPct(view.load.meanVsRefPct)}`
              : undefined
          }
        />
      </div>

      {view.sentences.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Yarının özeti</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {view.sentences.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Yarının PTF'si ve kıyas bandı"
          description="TL/MWh. Gri bant: aynı sınıftaki son günlerin çeyrekler arası aralığı, kesikli çizgi ortanca; kırmızı kesikli: fiyat limiti."
        >
          <ComposedChart
            data={view.rows}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid />
            <XAxis {...axis.x} />
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
            {limit && (
              <ReferenceLine
                y={limit.cap}
                stroke={CHART_COLOR.red}
                strokeDasharray="6 3"
                label={{
                  value: `Limit ${nf(limit.cap)}`,
                  position: "insideTopLeft",
                  fontSize: 11,
                  fill: CHART_COLOR.red,
                }}
              />
            )}
            <Area
              name="Kıyas bandı (%25–%75)"
              dataKey={(r: any) =>
                r.refLow === null || r.refHigh === null ? null : [r.refLow, r.refHigh]
              }
              stroke="none"
              fill={CHART_COLOR.slateLight}
              fillOpacity={0.2}
              isAnimationActive={false}
            />
            <Line
              name="Kıyas ortancası"
              dataKey="refMedian"
              stroke={CHART_COLOR.slateLight}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Line
              name="Yarının PTF'si"
              dataKey="ptf"
              stroke={CHART_COLOR.blue}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartCard>

        <ChartCard
          title="Yük tahmini ve kıyas"
          description="MW. Yarın için yayımlanan yük tahmini; kesikli çizgi aynı sınıftaki son günlerin yük tahmini ortancası."
        >
          <ComposedChart
            data={view.rows}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid />
            <XAxis {...axis.x} />
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
              name="Kıyas ortancası"
              dataKey="lepRef"
              stroke={CHART_COLOR.slateLight}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartCard>

        <ChartCard
          title="GÖP eşleşme hacmi"
          description="MWh. Gün öncesi piyasasında saat saat eşleşen alış miktarı."
        >
          <BarChart data={view.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid />
            <XAxis {...axis.x} />
            <YAxis tickFormatter={(v: number) => nf(v / 1000)} unit=" GWh" width={66} />
            <Tooltip
              formatter={(v: unknown) => `${nf(Number(v ?? 0))} MWh`}
              labelFormatter={(h) => hh(Number(h))}
              cursor={{ fill: "#f1f5f9" }}
            />
            <ChartBarMark
              name="Eşleşen alış"
              dataKey="gopVolume"
              fill={CHART_COLOR.indigo}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartCard>
      </div>

      <details className="rounded-md border bg-white" open>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
          Saatlik tablo
        </summary>
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="px-2 py-2 font-medium">Saat</th>
                <th className="px-2 py-2 text-right font-medium">PTF</th>
                <th className="px-2 py-2 text-right font-medium">Kıyas bandı</th>
                <th className="px-2 py-2 font-medium">Konum</th>
                <th className="px-2 py-2 font-medium">Limit</th>
                <th className="px-2 py-2 text-right font-medium">Yük tahmini</th>
                <th className="px-2 py-2 text-right font-medium">Kıyasa göre</th>
                <th className="px-2 py-2 text-right font-medium">GÖP hacmi</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.hour} className="border-b last:border-0">
                  <td className="px-2 py-1.5 tabular-nums">{hh(r.hour)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.ptf === null ? "–" : nf(r.ptf)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {r.refLow === null || r.refHigh === null
                      ? "–"
                      : `${nf(r.refLow)} – ${nf(r.refHigh)}`}
                  </td>
                  <td
                    className={`px-2 py-1.5 ${r.position === "above" ? "text-red-700" : r.position === "below" ? "text-blue-700" : "text-slate-500"}`}
                  >
                    {r.position ? POSITION_LABEL[r.position] : "–"}
                  </td>
                  <td
                    className={`px-2 py-1.5 ${r.level === "cap" ? "font-medium text-red-700" : r.level === "near" ? "text-amber-700" : "text-slate-500"}`}
                  >
                    {r.level ? LEVEL_LABEL[r.level] : ""}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.lep === null ? "–" : nf(r.lep)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {r.lepVsRefPct === null ? "–" : signedPct(r.lepVsRefPct)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.gopVolume === null ? "–" : nf(r.gopVolume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
