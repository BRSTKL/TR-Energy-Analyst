"use client";

import * as React from "react";
import { Area, Bar, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

/**
 * Grafik tasarım parçaları (shadcn "line chart" stili): kesikli yatay ızgara, eksen çizgisi ve tik yok, yumuşak çizgiler, halkalı
 * renk noktalı gösterge ve özel ipucu kartı. Renkler Tailwind paletinden (CSS değişkeni `--color-<anahtar>` ChartContainer'da
 * verilir); ızgara ve yazı renkleri uygulamanın tema değişkenlerinden (`hsl(var(--input))`, `hsl(var(--muted-foreground))`).
 */

export type ChartConfig = Record<string, { label: string; color: string }>;

/** Tailwind paletinden (v3 değişken üretmediği için sabit değerler) */
export const CHART_COLOR = {
  blue: "#2563eb",
  orange: "#f97316",
  slate: "#475569",
  slateLight: "#94a3b8",
  red: "#ef4444",
  teal: "#0d9488",
  amber: "#f59e0b",
  amberLight: "#fcd34d",
  sky: "#0ea5e9",
  indigo: "#3730a3",
  violet: "#8b5cf6",
  gray: "#6b7280",
} as const;

/**
 * Veri durumu ve sistem yönü renkleri (kullanıcı onayı 04.11.2026). Gerçekleşen / tahmin / aralık / benzer gün ayrımı
 * yalnız renkle değil çizgi biçimiyle de verilir (SERIES); sistem açığı mavi, fazlası turuncu (kırmızı–yeşil yerine,
 * renk körü için güvenli çift).
 */
export const STATUS_COLOR = {
  actual: "#1E293B",
  forecast: "#4F46E5",
  band: "#E0E7FF",
  reference: "#94A3B8",
  scenario: "#B45309",
  deficit: "#1D4ED8",
  surplus: "#C2410C",
  balanced: "#CBD5E1",
} as const;

/**
 * Seri biçimleri: her grafikte aynı anlam. `<Line {...SERIES.forecast} name="Tahmin" dataKey="p50" />` gibi kullanılır.
 * - actual: açıklanmış / ölçülmüş değer, düz koyu çizgi
 * - forecast: tahmin, kesikli çizgi
 * - band: tahmin aralığı, açık bant (Area)
 * - reference: benzer günler, önceki gün gibi kıyas çizgisi, noktalı gri
 * - scenario: senaryo / varsayım, noktalı turuncu-kahve
 */
export const SERIES = {
  actual: { stroke: STATUS_COLOR.actual, strokeWidth: 2 },
  forecast: { stroke: STATUS_COLOR.forecast, strokeWidth: 2, strokeDasharray: "6 4" },
  band: { stroke: "none", fill: STATUS_COLOR.band, fillOpacity: 0.9 },
  reference: { stroke: STATUS_COLOR.reference, strokeWidth: 1.5, strokeDasharray: "1 4", strokeLinecap: "round" as const },
  scenario: { stroke: STATUS_COLOR.scenario, strokeWidth: 1.5, strokeDasharray: "1 4", strokeLinecap: "round" as const },
} as const;

export function ChartContainer({ config, className, children }: { config: ChartConfig; className?: string; children: React.ReactElement }) {
  const vars = Object.fromEntries(Object.entries(config).map(([key, v]) => [`--color-${key}`, v.color])) as React.CSSProperties;
  return (
    <div style={vars} className={cn("w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border", className)}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export const ChartTooltip = Tooltip;

/** Izgara, eksen ve imleç ayarları: bütün grafiklerde aynı */
export const chartGrid = { strokeDasharray: "4 8", stroke: "hsl(var(--input))", strokeOpacity: 1, horizontal: true, vertical: false } as const;
const tick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
export const chartXAxis = { axisLine: false, tickLine: false, tick, tickMargin: 10 } as const;
export const chartYAxis = { axisLine: false, tickLine: false, tick, tickMargin: 10, width: 68 } as const;
export const chartCursor = { strokeDasharray: "3 3", stroke: "hsl(var(--input))" } as const;

/** Halkalı renk noktası (çizgi grafiklerde gösterge ve ipucu) */
export function RingDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-3.5 shrink-0 rounded-full border-4 bg-background", className)} style={{ borderColor: color }} />;
}

/**
 * Gösterge örneği: kesikli ya da noktalı çizgi o biçimde, bant ve çubuk kare olarak çizilir. Böylece gerçekleşen / tahmin
 * ayrımı göstergede de renkten bağımsız okunur.
 */
export function LegendSwatch({ color, dash, kind = "line" }: { color: string; dash?: string; kind?: "line" | "rect" | "dot" }) {
  if (kind === "dot") return <RingDot color={color} />;
  if (kind === "rect") return <span className="inline-block size-3 shrink-0 rounded-sm" style={{ background: color }} aria-hidden="true" />;
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" className="shrink-0" aria-hidden="true">
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth={2.5} strokeDasharray={dash} strokeLinecap={dash?.startsWith("1 ") ? "round" : "butt"} />
    </svg>
  );
}

/** Grafiğin altında ortalanmış gösterge */
export function ChartLegendDots({ items }: { items: Array<{ label: string; color: string; dash?: string; kind?: "line" | "rect" | "dot" }> }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <LegendSwatch color={it.color} dash={it.dash} kind={it.kind ?? "dot"} />
          <span className="text-sm text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Eksen birimi: grafiğin sol üstünde küçük yazı ("TL/MWh", "MW") */
export function ChartUnit({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 ps-4 text-xs text-muted-foreground">{children}</div>;
}

interface TooltipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
  payload?: unknown;
}

/**
 * Özel ipucu kartı: başlık, her seri için halkalı nokta + ad + değer. Değeri olmayan seri gösterilmez.
 * Biçimlendirme iki biçimde: `valueFormatter(değer, öğe)` → metin, ya da recharts'ın eski `formatter(değer, ad, öğe, sıra, hepsi)`
 * → metin ya da [değer, ad] (ad boş metinse ad gösterilmez).
 */
export function ChartTooltipCard({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  formatter,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
  labelFormatter?: (label: any, payload: any) => React.ReactNode;
  valueFormatter?: (value: unknown, entry: TooltipEntry) => string;
  formatter?: (value: any, name: any, entry: any, index: number, payload: any) => React.ReactNode | [React.ReactNode, React.ReactNode];
}) {
  const rows = (payload ?? []).filter((e) => e.value !== null && e.value !== undefined);
  if (!active || !rows.length) return null;
  return (
    <div className="min-w-[160px] rounded-lg border bg-popover p-3 shadow-sm shadow-black/5">
      <div className="mb-2.5 text-xs font-medium tracking-wide text-muted-foreground">{label === undefined ? "" : labelFormatter ? labelFormatter(label, payload) : label}</div>
      <div className="space-y-2">
        {rows.map((e, i) => {
          let value: React.ReactNode = String(e.value);
          let name: React.ReactNode = e.name;
          if (formatter) {
            const out = formatter(e.value, e.name, e, i, payload);
            if (Array.isArray(out)) {
              value = out[0];
              if (out[1] !== undefined && out[1] !== null) name = out[1];
            } else value = out;
          } else if (valueFormatter) value = valueFormatter(e.value, e);
          return (
            <div key={`${e.dataKey ?? e.name}-${i}`} className="flex items-center gap-2 text-xs">
              <RingDot color={e.color ?? "currentColor"} />
              {name !== "" && name !== undefined && <span className="text-muted-foreground">{name}:</span>}
              <span className="ml-auto font-semibold tabular-nums text-popover-foreground">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Uyumlu sarmalayıcılar: recharts bileşenlerinin yerine aynı adla içe aktarılır (`ChartGrid as CartesianGrid` gibi); eski
// stil ayarlarını (eksen rengi, tik, kenarlık, ipucu kutusu, gösterge yazı tipi) yok sayıp tasarımı uygular, veri ve biçim
// ayarlarını (dataKey, tickFormatter, formatter, labelFormatter, domain, interval ...) olduğu gibi geçirir.

type AnyProps = Record<string, any>;

export function ChartGrid(props: React.ComponentProps<typeof CartesianGrid>) {
  const { stroke, strokeDasharray, vertical, horizontal, ...rest } = props as AnyProps;
  void stroke;
  void strokeDasharray;
  void vertical;
  void horizontal;
  return <CartesianGrid {...rest} {...chartGrid} />;
}

/** Eski nesne biçimli `tick` ayarı atılır; özel tik bileşeni (öğe ya da işlev) korunur */
function axisProps(props: AnyProps, base: AnyProps): AnyProps {
  const { stroke, tickLine, axisLine, fontSize, tick, ...rest } = props;
  void stroke;
  void tickLine;
  void axisLine;
  void fontSize;
  const keepTick = typeof tick === "boolean" || typeof tick === "function" || React.isValidElement(tick);
  return { ...base, ...rest, ...(keepTick ? { tick } : {}) };
}

export function ChartXAxis(props: React.ComponentProps<typeof XAxis>) {
  return <XAxis {...axisProps(props as AnyProps, chartXAxis)} />;
}

export function ChartYAxis(props: React.ComponentProps<typeof YAxis>) {
  return <YAxis {...axisProps(props as AnyProps, chartYAxis)} />;
}

export function ChartLine(props: React.ComponentProps<typeof Line>) {
  return <Line type="monotone" strokeWidth={2} dot={false} {...props} />;
}

export function ChartArea(props: React.ComponentProps<typeof Area>) {
  const AreaAny = Area as React.ComponentType<AnyProps>;
  return <AreaAny type="monotone" {...(props as AnyProps)} />;
}

export function ChartBar(props: React.ComponentProps<typeof Bar>) {
  return <Bar radius={props.stackId ? undefined : [3, 3, 0, 0]} {...props} />;
}

const barCursor = { fill: "hsl(var(--muted))", opacity: 0.5 } as const;

/**
 * Tooltip yerine: özel içerik verilmediyse yeni kart; `formatter` (değer, ad, öğe) → metin ya da [değer, ad] ve `labelFormatter`
 * eski biçimde çalışır. Çubuk grafikte (eski `cursor={{ fill }}`) açık gri zemin, çizgi grafikte kesikli dikey imleç.
 */
export function ChartTip(props: React.ComponentProps<typeof Tooltip>) {
  const { formatter, labelFormatter, cursor, content, contentStyle, labelStyle, itemStyle, separator, wrapperStyle, ...rest } = props as AnyProps;
  void contentStyle;
  void labelStyle;
  void itemStyle;
  void separator;
  void wrapperStyle;
  const theCursor = cursor === false ? false : cursor && typeof cursor === "object" && "fill" in cursor ? barCursor : chartCursor;
  return <Tooltip {...rest} cursor={theCursor} content={content ?? <ChartTooltipCard formatter={formatter} labelFormatter={labelFormatter} />} />;
}

type LegendItem = { value?: unknown; color?: string; type?: string; payload?: { strokeDasharray?: string | number; stroke?: string; fill?: string } };

/** Seri biçiminden gösterge örneği: çizgi (kesikliyse kesikli), bant / çubuk kare */
function swatchFor(p: LegendItem) {
  const dash = p.payload?.strokeDasharray;
  const isLine = p.type === "line" && p.payload?.stroke !== "none";
  if (!isLine) return <LegendSwatch color={p.payload?.fill && p.payload.fill !== "none" ? p.payload.fill : p.color ?? "currentColor"} kind="rect" />;
  return <LegendSwatch color={p.color ?? "currentColor"} dash={dash === undefined ? undefined : String(dash)} />;
}

function RingLegend({ payload }: { payload?: ReadonlyArray<LegendItem> }) {
  const items = (payload ?? []).filter((p) => p.type !== "none" && p.value !== undefined && p.value !== "");
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 pt-2">
      {items.map((p, i) => (
        <div key={`${String(p.value)}-${i}`} className="flex items-center gap-2">
          {swatchFor(p)}
          <span className="text-sm text-muted-foreground">{String(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Legend yerine: halkalı noktalı, altta ortalanmış gösterge. Yalnız `itemSorter` geçirilir */
export function ChartLegend(props: React.ComponentProps<typeof Legend>) {
  // recharts göstergeyi varsayılan olarak ada göre sıralar; burada serilerin tanım sırası korunur (itemSorter verilmedikçe)
  const { itemSorter = null } = props as AnyProps;
  return <Legend verticalAlign="bottom" align="center" itemSorter={itemSorter} content={<RingLegend />} />;
}
