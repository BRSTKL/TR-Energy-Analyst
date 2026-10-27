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

/** Grafiğin altında ortalanmış gösterge */
export function ChartLegendDots({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <RingDot color={it.color} />
          <span className="text-sm text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
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
              <span className="ml-auto font-semibold text-popover-foreground">{value}</span>
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

function RingLegend({ payload }: { payload?: ReadonlyArray<{ value?: unknown; color?: string; type?: string }> }) {
  const items = (payload ?? []).filter((p) => p.type !== "none" && p.value !== undefined && p.value !== "");
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 pt-2">
      {items.map((p, i) => (
        <div key={`${String(p.value)}-${i}`} className="flex items-center gap-2">
          <RingDot color={p.color ?? "currentColor"} />
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
