"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { BarChart, Cell, ComposedChart, ReferenceArea, ReferenceLine } from "recharts";
import {
  ChartArea as Area,
  ChartBar as Bar,
  ChartGrid as CartesianGrid,
  ChartLegend as Legend,
  ChartLine as Line,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartCard } from "@/components/market/chart-card";
import { CHART_COLOR } from "@/components/ui/chart";
import { DIRECTION_LABEL, DailyTable } from "@/components/market/daily-table";
import { PriceLimitNote } from "@/components/market/price-limit-note";
import {
  DAY_CLASS_LABEL,
  MIX_GROUPS,
  REFERENCE_DAYS,
  type DailyMarket,
  type MixKey,
} from "@/lib/analysis/daily-market";
import type { PriceLimit } from "@/lib/analysis/price-limit";
import { nf } from "@/lib/format";

export interface Availability {
  start: string;
  end: string;
  systemEnd: string | null;
}

export interface LiveInfo {
  updatedAt: string;
  lastSystemHour: number | null;
  notes: string[];
}

export const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
export const WEEKDAYS = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
];
export const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
export const trDay = (d: string) =>
  `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
export const weekday = (d: string) => WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
export const shift = (d: string, days: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
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
const DIRECTION_COLOR: Record<string, string> = {
  DEFICIT: CHART_COLOR.red,
  SURPLUS: CHART_COLOR.blue,
  BALANCED: CHART_COLOR.slateLight,
};

const axis = {
  x: { dataKey: "hour", interval: 2 as const, tickFormatter: (h: number) => hh(h) },
  y: {},
};

export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-slate-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-xl font-bold tracking-tight sm:text-2xl ${tone === "warn" ? "text-amber-700" : "text-slate-900"}`}
        >
          {value}
        </div>
        {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function DailyDashboard({
  day,
  available,
  limit,
  live,
}: {
  day: DailyMarket;
  available?: Availability | null;
  limit: PriceLimit | null;
  live?: LiveInfo | null;
}) {
  return (
    <>
      {live && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          Canlı: bugünün EPİAŞ verisi{" "}
          {live.lastSystemHour !== null
            ? `${hh(live.lastSystemHour)} saatine kadar`
            : "henüz yok"}
          ; PTF (gün öncesi piyasası) bütün gün için açıklandı, SMF, sistem yönü ve GİP
          geçmiş saatler için var. Rampa ve günün özeti gün tamamlanana kadar eksik
          hesaplanır. Güncelleme{" "}
          {new Date(live.updatedAt).toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Istanbul",
          })}
          ; veri 5 dakikada bir yenilenir.
        </div>
      )}
      <PriceLimitNote limit={limit} />
      {(day.warnings.length > 0 ||
        (!live && available?.systemEnd && available.systemEnd < day.date) ||
        (live && live.notes.length > 0)) && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="space-y-0.5">
            {day.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
            {!live && available?.systemEnd && available.systemEnd < day.date && (
              <li>
                Sistem verisi (tüketim, üretim) en son {trDay(available.systemEnd)} gününe
                kadar havuzda.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="PTF ortalaması"
          value={day.prices.ptfMean === null ? "–" : `${nf(day.prices.ptfMean)} TL/MWh`}
          sub={
            day.prices.vsReferencePct !== null && day.reference
              ? `Son ${day.reference.days} ${DAY_CLASS_LABEL[day.dayClass]} gününün ortancasına göre ${signedPct(day.prices.vsReferencePct)}`
              : "Kıyas bandı yok"
          }
        />
        <Kpi
          label="SMF ortalaması"
          value={day.prices.smfMean === null ? "–" : `${nf(day.prices.smfMean)} TL/MWh`}
        />
        <Kpi
          label="Makas (ort. |SMF − PTF|)"
          value={
            day.prices.spreadMean === null ? "–" : `${nf(day.prices.spreadMean)} TL/MWh`
          }
        />
        <Kpi
          label="En pahalı / en ucuz saat"
          value={
            day.prices.ptfMax && day.prices.ptfMin
              ? `${hh(day.prices.ptfMax.hour)} / ${hh(day.prices.ptfMin.hour)}`
              : "–"
          }
          sub={
            day.prices.ptfMax && day.prices.ptfMin
              ? `${nf(day.prices.ptfMax.value)} / ${nf(day.prices.ptfMin.value)} TL/MWh${day.prices.zeroHours ? ` · ${day.prices.zeroHours} sıfır fiyatlı saat` : ""}`
              : undefined
          }
        />
        <Kpi
          label="Sistem yönü"
          value={`${day.direction.deficit} açık / ${day.direction.surplus} fazla`}
          sub={
            day.direction.balanced
              ? `${day.direction.balanced} saat dengede`
              : "saat sayısı"
          }
        />
        <Kpi
          label="Akşam rampası (net yük)"
          value={day.net.ramp ? `+${gw(day.net.ramp.rise)}` : "–"}
          sub={
            day.net.ramp
              ? `${hh(day.net.ramp.fromHour)}–${hh(day.net.ramp.toHour)}, ${day.net.ramp.definitions === 2 ? `iki tanım arasında ${gw(day.net.ramp.low)}–${gw(day.net.ramp.high)}` : "tek tanımla"}`
              : live
                ? "Akşam saatleri henüz gelmedi"
                : day.net.hours
                  ? "Artış yok"
                  : "Net yük hesaplanamadı"
          }
        />
      </div>

      {day.sentences.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {live ? "Şu ana kadarki özet" : "Günün özeti"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {day.sentences.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              Cümleler veriyi betimler; bir ilişkinin nedenini ya da yarının fiyatını
              söylemez.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="PTF, SMF ve kıyas bandı"
          description={`TL/MWh. Gri bant: son ${REFERENCE_DAYS} günün aynı sınıftaki (${DAY_CLASS_LABEL[day.dayClass]}) günlerinin çeyrekler arası aralığı, kesikli çizgi ortanca.`}
        >
          <ComposedChart
            data={day.rows}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid />
            <XAxis {...axis.x} />
            <YAxis {...axis.y} tickFormatter={(v: number) => nf(v)} />
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
              name="PTF"
              dataKey="ptf"
              stroke={CHART_COLOR.blue}
              isAnimationActive={false}
            />
            <Line
              name="SMF"
              dataKey="smf"
              stroke={CHART_COLOR.orange}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartCard>

        <ChartCard
          title="Net yük ve akşam rampası"
          description="MW (saatlik ortalama). Net yük (tüketim taraflı) = tüketim − rüzgâr − güneş planı; kesikli: arz taraflı = termik, hidro, diğer + net ithalat. Mavi şerit: en büyük 3 saatlik artış."
        >
          <ComposedChart
            data={day.rows}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid />
            <XAxis {...axis.x} />
            <YAxis
              {...axis.y}
              tickFormatter={(v: number) => nf(v / 1000)}
              unit=" GW"
              width={62}
            />
            <Tooltip
              formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`}
              labelFormatter={(h) => hh(Number(h))}
            />
            <Legend />
            {day.net.ramp && (
              <ReferenceArea
                x1={day.net.ramp.fromHour}
                x2={day.net.ramp.toHour}
                fill={CHART_COLOR.blue}
                fillOpacity={0.08}
                stroke="none"
              />
            )}
            <Line
              name="Tüketim"
              dataKey="consumption"
              stroke={CHART_COLOR.slate}
              isAnimationActive={false}
            />
            <Line
              name="Rüzgâr (gerçek zamanlı)"
              dataKey="wind"
              stroke={MIX_COLOR.wind}
              isAnimationActive={false}
            />
            <Line
              name="Güneş (KGÜP planı)"
              dataKey="sunPlan"
              stroke={MIX_COLOR.sun}
              isAnimationActive={false}
            />
            <Line
              name="Net yük (tüketim taraflı)"
              dataKey="net"
              stroke={CHART_COLOR.red}
              isAnimationActive={false}
            />
            <Line
              name="Net yük (arz taraflı)"
              dataKey="netSupply"
              stroke={CHART_COLOR.red}
              strokeDasharray="4 4"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartCard>

        <ChartCard
          title="Üretim karması"
          description="MW. Gerçek zamanlı üretim (lisanssız güneş hariç); açık sarı bant lisanssız güneşin KGÜP planına göre tahmini payı."
        >
          <ComposedChart
            data={day.mix}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid />
            <XAxis {...axis.x} />
            <YAxis
              {...axis.y}
              tickFormatter={(v: number) => nf(v / 1000)}
              unit=" GW"
              width={62}
            />
            <Tooltip
              formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`}
              labelFormatter={(h) => hh(Number(h))}
            />
            <Legend />
            {MIX_GROUPS.map((g) => (
              <Area
                key={g.key}
                name={g.label}
                dataKey={g.key}
                stackId="mix"
                stroke={MIX_COLOR[g.key]}
                fill={MIX_COLOR[g.key]}
                fillOpacity={0.85}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ChartCard>

        <ChartCard
          title="Net talimat ve sistem yönü"
          description="MWh. Çubuk: o saatte verilen net yük alma (+) ya da yük atma (−) talimatı; renk sistem yönü."
        >
          <BarChart data={day.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid />
            <XAxis {...axis.x} />
            <YAxis {...axis.y} tickFormatter={(v: number) => nf(v)} />
            <Tooltip
              formatter={(v: unknown) => `${nf(Number(v ?? 0))} MWh`}
              labelFormatter={(h) => hh(Number(h))}
              cursor={{ fill: "#f1f5f9" }}
            />
            <Bar name="Net talimat" dataKey="netInstruction" isAnimationActive={false}>
              {day.rows.map((r) => (
                <Cell
                  key={r.hour}
                  fill={DIRECTION_COLOR[r.direction ?? ""] ?? CHART_COLOR.slateLight}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        {Object.entries(DIRECTION_LABEL).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: DIRECTION_COLOR[k] }}
            />{" "}
            {label}
          </span>
        ))}
        {day.importExportMean !== null && (
          <span>
            Ortalama {day.importExportMean < 0 ? "net ihracat" : "net ithalat"}:{" "}
            {nf(Math.abs(day.importExportMean))} MW (gerçek zamanlı)
          </span>
        )}
      </div>

      <details className="rounded-md border bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
          Saatlik tablo
        </summary>
        <div className="overflow-x-auto px-2 pb-3">
          <DailyTable rows={day.rows} />
        </div>
      </details>
    </>
  );
}
