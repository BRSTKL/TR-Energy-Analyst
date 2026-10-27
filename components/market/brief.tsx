"use client";

import React from "react";
import { ArrowDown, ArrowUp, Info, Minus } from "lucide-react";
import { ComposedChart, ReferenceLine } from "recharts";
import {
  ChartArea as Area,
  ChartGrid as CartesianGrid,
  ChartLegend as Legend,
  ChartLine as Line,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
  CHART_COLOR,
} from "@/components/ui/chart";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard } from "@/components/market/chart-card";
import { hh } from "@/components/market/daily-dashboard";
import {
  EVIDENCE_LABEL,
  GROUP_LABEL,
  type Brief,
  type Direction,
  type Evidence,
  type Headline,
  type Signal,
  type SignalGroup,
} from "@/lib/analysis/pre-bid-brief";
import type { PreBidView } from "@/lib/analysis/pre-bid";
import { nf } from "@/lib/format";

type View = Extract<PreBidView, { ok: true }>;

// ---------------------------------------------------------------- başlık şeridi

/** Teklif kapanışına (Türkiye 12:30, hedef günden bir önceki gün) kalan süre; geçmişse null */
export function remainingToCutoff(targetDay: string, nowMs: number): number | null {
  const cutoff =
    Date.parse(`${targetDay}T00:00:00Z`) -
    86_400_000 +
    (12 * 60 + 30) * 60_000 -
    3 * 3_600_000;
  const left = cutoff - nowMs;
  return left > 0 ? left : null;
}

const fmtLeft = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} sa ${m % 60} dk` : `${m} dk`;
};

const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

function Chip({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "amber" | "red" | "emerald";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    emerald: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function BriefHeadline({
  h,
  weekday,
  nowMs,
  isTomorrow,
}: {
  h: Headline;
  weekday: string;
  nowMs: number;
  isTomorrow: boolean;
}) {
  const left = isTomorrow ? remainingToCutoff(h.date, nowMs) : null;
  const vs = h.vsBaselinePct;
  return (
    <Card className="border-slate-300 shadow-sm">
      <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {dmy(h.date)} {weekday} · {h.dayClassLabel} günü
          </p>
          <p className="mt-2 text-xs text-slate-500">Ortalama fiyat beklentisi</p>
          <p className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {nf(h.meanExpected)}{" "}
            <span className="text-lg font-medium text-slate-500">TL/MWh</span>
          </p>
          {h.meanLo !== null && h.meanHi !== null && (
            <p className="mt-1 text-sm text-slate-600">
              %80 aralığın ortalaması {nf(h.meanLo)}–{nf(h.meanHi)} TL/MWh
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {vs !== null && (
              <Chip tone={vs > 3 ? "amber" : vs < -3 ? "emerald" : "slate"}>
                Referansa göre {vs >= 0 ? "+" : "−"}%{nf(Math.abs(vs))}
              </Chip>
            )}
            {h.peak && <Chip>En pahalı saat {hh(h.peak.hour)}</Chip>}
            {h.cap !== null && (
              <Chip tone={h.hiAtCapHours > 0 ? "red" : "slate"}>
                Limite dayanan: {h.hiAtCapHours} saat
              </Chip>
            )}
          </div>
        </div>
        <div className="space-y-3 text-sm text-slate-700">
          <p className="text-base text-slate-900">{h.line}</p>
          {isTomorrow && (
            <p className="rounded-md bg-slate-50 p-2 text-slate-700">
              {left !== null ? (
                <>
                  <b>12:30 teklif kapanışına {fmtLeft(left)}.</b> Yarının komşu fiyatı ve
                  KGÜP&apos;ü bu saatten sonra yayımlanır.
                </>
              ) : (
                <>Bugünkü 12:30 teklif kapanışı geçti.</>
              )}
            </p>
          )}
          {h.accuracy && (
            <p className="text-slate-600">
              Geçmiş başarı: son {h.accuracy.days} günde model referanstan %
              {nf(h.accuracy.improvementPct)} daha az hata yaptı (günlerin %
              {nf(h.accuracy.betterDaysPct)}&apos;inde daha iyi). Pik saatini tahmin etme
              becerisi ölçülmedi; saati değil seviyeyi okuyun.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- saatlik grafik ve şerit

const LEVEL_CELL: Record<string, string> = {
  cap: "bg-red-500 text-white",
  near: "bg-amber-300 text-amber-950",
  zero: "bg-sky-300 text-sky-950",
  normal: "bg-slate-100 text-slate-700",
};

export function HourChart({ view, cap }: { view: View; cap: number | null }) {
  const data = view.rows.map((r) => ({
    ...r,
    band: r.lo !== null && r.hi !== null ? [r.lo, r.hi] : null,
  }));
  const withBand = view.rows.some((r) => r.lo !== null);
  return (
    <div className="space-y-2">
      <ChartCard
        title="Saat saat fiyat beklentisi"
        description="TL/MWh. Mavi çizgi beklenti, açık mavi bant %80 aralık, gri kesikli çizgi son 28 günün benzer gün ortancası, kırmızı kesikli çizgi fiyat limiti."
      >
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid />
          <XAxis dataKey="hour" interval={2} tickFormatter={(h: number) => hh(h)} />
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
          {cap !== null && (
            <ReferenceLine
              y={cap}
              stroke={CHART_COLOR.red}
              strokeDasharray="6 3"
              label={{
                value: `Limit ${nf(cap)}`,
                position: "insideTopLeft",
                fontSize: 11,
                fill: CHART_COLOR.red,
              }}
            />
          )}
          {withBand && (
            <Area
              name="%80 aralık"
              dataKey="band"
              stroke="none"
              fill={CHART_COLOR.blue}
              fillOpacity={0.15}
              isAnimationActive={false}
            />
          )}
          <Line
            name="Referans ortancası"
            dataKey="baseline"
            stroke={CHART_COLOR.slateLight}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <Line
            name="Beklenti"
            dataKey="expected"
            stroke={CHART_COLOR.blue}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartCard>
      <div>
        <div
          className="grid grid-cols-12 gap-1 sm:grid-cols-[repeat(24,minmax(0,1fr))]"
          role="list"
          aria-label="Saat saat risk şeridi"
        >
          {view.rows.map((r) => {
            const tone =
              r.hiAtCap || r.level === "cap"
                ? "cap"
                : r.level === "near"
                  ? "near"
                  : r.level === "zero"
                    ? "zero"
                    : "normal";
            return (
              <div
                key={r.hour}
                role="listitem"
                title={`${hh(r.hour)}: beklenti ${r.expected !== null ? nf(r.expected) : "—"} TL/MWh${r.hiAtCap ? "; üst uç limitte" : ""}`}
                className={`rounded px-0.5 py-1 text-center text-[10px] font-medium leading-tight ${LEVEL_CELL[tone]}`}
              >
                {String(r.hour).padStart(2, "0")}
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Şerit: <span className="rounded bg-red-500 px-1 text-white">kırmızı</span>{" "}
          aralığın üst ucu limitte,{" "}
          <span className="rounded bg-amber-300 px-1 text-amber-950">sarı</span> beklenti
          limite yakın, gri normal.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sinyal kartları

const DIR: Record<
  Direction,
  { icon: React.ReactNode; label: string; bar: string; text: string }
> = {
  up: {
    icon: <ArrowUp className="h-4 w-4" />,
    label: "Fiyatı yukarı iten",
    bar: "bg-orange-500",
    text: "text-orange-700",
  },
  down: {
    icon: <ArrowDown className="h-4 w-4" />,
    label: "Fiyatı aşağı iten",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
  },
  flat: {
    icon: <Minus className="h-4 w-4" />,
    label: "Nötr",
    bar: "bg-slate-300",
    text: "text-slate-600",
  },
  info: {
    icon: <Info className="h-4 w-4" />,
    label: "Yalnız bilgi",
    bar: "bg-sky-300",
    text: "text-sky-700",
  },
};

const EVIDENCE_TONE: Record<Evidence, string> = {
  model: "border-blue-200 bg-blue-50 text-blue-800",
  "tested-noise": "border-slate-200 bg-slate-50 text-slate-600",
  "tested-better": "border-emerald-200 bg-emerald-50 text-emerald-800",
  "tested-worse": "border-red-200 bg-red-50 text-red-800",
  untested: "border-amber-200 bg-amber-50 text-amber-800",
  pending: "border-slate-200 bg-white text-slate-400",
};

export function SignalCard({
  s,
  onDetail,
}: {
  s: Signal;
  onDetail: (id: string) => void;
}) {
  const d = DIR[s.direction];
  return (
    <div
      className={`flex overflow-hidden rounded-lg border bg-white shadow-sm ${s.missing ? "opacity-70" : ""}`}
    >
      <div className={`w-1.5 shrink-0 ${d.bar}`} aria-hidden />
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{s.title}</p>
          <span
            className={`flex shrink-0 items-center gap-1 text-xs font-medium ${d.text}`}
            title={d.label}
          >
            {d.icon}
            <span className="sr-only sm:not-sr-only">{d.label}</span>
          </span>
        </div>
        <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{s.value}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{s.sentence}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${EVIDENCE_TONE[s.evidence]}`}
          >
            {EVIDENCE_LABEL[s.evidence]}
          </span>
          {s.detailId && (
            <button
              type="button"
              onClick={() => onDetail(s.detailId!)}
              className="text-[11px] font-medium text-slate-500 underline hover:text-slate-900"
            >
              Ayrıntı ↓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SignalSection({
  brief,
  ctxLoading,
  onDetail,
}: {
  brief: Brief;
  ctxLoading: boolean;
  onDetail: (id: string) => void;
}) {
  const groups: SignalGroup[] = ["talep", "arz", "piyasa", "dis"];
  return (
    <section className="space-y-4" aria-labelledby="sinyaller">
      <div>
        <h2 id="sinyaller" className="text-lg font-semibold text-slate-900">
          Bugün ne değişti?
        </h2>
        <p className="mt-1 text-sm text-slate-600">{brief.tallyLine}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span className="flex items-center gap-1 text-orange-700">
            <ArrowUp className="h-3 w-3" /> fiyatı yukarı iten
          </span>
          <span className="flex items-center gap-1 text-emerald-700">
            <ArrowDown className="h-3 w-3" /> aşağı iten
          </span>
          <span className="flex items-center gap-1">
            <Minus className="h-3 w-3" /> normalden belirgin sapma yok
          </span>
          <span className="flex items-center gap-1 text-sky-700">
            <Info className="h-3 w-3" /> yalnız bilgi
          </span>
        </div>
      </div>
      {groups.map((g) => {
        const list = brief.signals.filter((s) => s.group === g);
        if (!list.length && !(ctxLoading && g !== "talep")) return null;
        return (
          <div key={g}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {GROUP_LABEL[g]}
            </h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((s) => (
                <SignalCard key={s.id} s={s} onDetail={onDetail} />
              ))}
              {ctxLoading && g !== "talep" && (
                <div className="flex items-center justify-center rounded-lg border border-dashed bg-white p-3 text-xs text-slate-400">
                  Bu gruptaki veriler yükleniyor…
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- güven kutusu

export function ConfidenceBox({ h }: { h: Headline | null }) {
  return (
    <section aria-labelledby="guven" className="grid gap-3 md:grid-cols-2">
      <Card className="shadow-sm">
        <CardContent className="space-y-2 p-4 text-sm text-slate-700">
          <h2 id="guven" className="text-base font-semibold text-slate-900">
            Bu tahmine ne kadar güvenilir?
          </h2>
          <p>
            Hata payı yaklaşık ±500–550 TL/MWh (saatlik ortalama mutlak sapma).
            %80&apos;lik aralık gerçek fiyatın yaklaşık %75&apos;ini tutuyor: aralığı
            biraz geniş okuyun.
          </p>
          {h?.accuracy && (
            <p>
              Son {h.accuracy.days} günde model referanstan %
              {nf(h.accuracy.improvementPct)} daha az hata yaptı; günlerin %
              {nf(h.accuracy.betterDaysPct)}&apos;inde daha iyi.
            </p>
          )}
          <p className="text-slate-500">
            Nokta tahmin değildir ve henüz onaylanmadı: kararlarda tek başına kullanmayın.
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardContent className="space-y-2 p-4 text-sm text-slate-700">
          <h2 className="text-base font-semibold text-slate-900">Bilmediğimiz şeyler</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Yarının güneşi: EPİAŞ sistem güneş tahmini yayımlamıyor; önceki 7 günün
              ortancası kullanılıyor.
            </li>
            <li>
              Yarının KGÜP&apos;ü ve komşu ülke fiyatı 12:30&apos;dan sonra çıkıyor.
            </li>
            <li>İleri tarihli planlı bakım: EPİAŞ yalnız başlamış arızaları veriyor.</li>
            <li>Pik saati: saati değil, günün seviyesini okuyun.</li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
