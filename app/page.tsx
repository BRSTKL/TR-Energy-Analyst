"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Kpi, nf, SectionHead, Skeleton } from "@/components/summary-parts";
import type { DailyMarket } from "@/lib/analysis/daily-market";
import { evidenceLabel, SCORECARD_MIN_DAYS } from "@/lib/ptf/scorecard";
import type { PortfolioProduction } from "@/lib/services/portfolio-forecast";
import type { PtfScorecard } from "@/lib/services/ptf-scorecard";
import type { OpsStatus } from "@/lib/services/ops-status";
import type { ProjectKpis } from "@/lib/services/project-kpis";
import { buildAlerts, formatHours, type CockpitAlert } from "@/lib/ui/cockpit-alerts";
import {
  dayPhase,
  formatCountdown,
  phaseText,
  type DayPhaseId,
} from "@/lib/ui/day-phase";
import { forecastHref, LAST_PROJECT_EVENT, readLastProject } from "@/lib/ui/last-project";
import { opsChips } from "@/lib/ui/ops-chips";
import { useTrMinutes } from "@/lib/ui/use-tr-clock";
import {
  DEFAULT_ROLE,
  ROLES,
  SECTION_ORDER,
  readRole,
  writeRole,
  type TodayRole,
  type TodaySection,
} from "@/lib/ui/today-view";

/**
 * Bugün kokpiti (ana sayfa): günün saatlerine göre şimdi hangi adımdasınız, yarın için ne hazır, piyasa şimdi nasıl, dünün
 * sonucu ve uyarılar. Her bölüm kendi verisini ayrı yükler; alınamayan veri bölümde açıkça yazılır (sessizce atlanmaz).
 * Yarının kayıtları dosyadan (/api/ops/status), piyasa EPİAŞ'tan (5 dk önbellekli), projeler /api/compare'den gelir.
 */

const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const MONTHS = [
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
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const trDay = (d: string) => {
  const w = new Date(`${d}T00:00:00Z`);
  return `${DAYS[w.getUTCDay()]} ${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
};
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
const tl = (v: number) =>
  Math.abs(v) >= 1e6 ? `${nf(v / 1e6, 1)} M ₺` : `${nf(v / 1e3, 0)} bin ₺`;

type Load<T> =
  { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string };

/** url null ise istek atılmaz (durum "loading" kalır; yalnız "ok" kullanan yerler için) */
function useLoad<T>(url: string | null, pick: (d: any) => T, deps: unknown[] = []): Load<T> {
  const [s, setS] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    setS({ state: "loading" });
    if (!url) return;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) throw new Error(d.error ?? "Veri alınamadı.");
        setS({ state: "ok", data: pick(d) });
      })
      .catch(
        (e) =>
          !cancelled &&
          setS({
            state: "error",
            message: e instanceof Error ? e.message : "Veri alınamadı.",
          })
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  return s;
}

function mapLoad<T, U>(l: Load<T>, f: (v: T) => U): Load<U> {
  return l.state === "ok" ? { state: "ok", data: f(l.data) } : l;
}

function Failed({ what, message }: { what: string; message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {what} alınamadı: {message}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------- faz kartı

const STEPS: Array<{
  id: "prep" | "bid" | "results" | "intraday";
  title: string;
  sub: string;
  href: string;
}> = [
  {
    id: "prep",
    title: "Hazırlık",
    sub: "Dünün sonucu, açık veriler",
    href: "/market/gunluk",
  },
  {
    id: "bid",
    title: "Teklif",
    sub: "PTF ve üretim tahmini, 12:30'a kadar",
    href: "/market/teklif",
  },
  { id: "results", title: "Sonuç 14:00", sub: "Açıklanan PTF", href: "/market/gunluk" },
  {
    id: "intraday",
    title: "Gün içi",
    sub: "GİP, dengesizlik yönü",
    href: "/market/gunluk",
  },
];
const CURRENT_STEP: Record<DayPhaseId, number> = {
  prep: 0,
  "pre-bid": 1,
  closing: 1,
  awaiting: 2,
  intraday: 3,
  evening: 3,
};

function PhaseCard({ minutes, bidReady }: { minutes: number | null; bidReady: string }) {
  if (minutes === null) return <Skeleton h="h-36" />;
  const phase = dayPhase(minutes);
  const current = CURRENT_STEP[phase.id];
  const big =
    phase.minutesToClose !== null
      ? { text: formatCountdown(phase.minutesToClose), sub: "teklif kapanışına (12:30)" }
      : phase.minutesToResults !== null
        ? {
            text: formatCountdown(phase.minutesToResults),
            sub: "PTF'nin açıklanmasına (14:00)",
          }
        : null;
  return (
    <Card className={`shadow-sm ${phase.urgent ? "border-red-300" : ""}`}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Şimdi
            </p>
            <h2 className="text-xl font-bold text-slate-900">{phaseText(phase)}</h2>
          </div>
          {big && (
            <div className="text-right">
              <p
                className={`text-3xl font-bold tabular-nums ${phase.urgent ? "text-red-700" : "text-slate-900"}`}
              >
                {big.text}
              </p>
              <p className="text-xs text-slate-500">{big.sub}</p>
            </div>
          )}
        </div>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((st, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <li key={st.id}>
                <Link
                  href={st.href}
                  aria-current={now ? "step" : undefined}
                  className={`block h-full rounded-md border p-3 text-sm transition-colors ${
                    now
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {done ? (
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <CircleDot
                        className={`h-4 w-4 ${now ? "text-indigo-600" : "text-slate-300"}`}
                        aria-hidden="true"
                      />
                    )}
                    <span className={now ? "text-indigo-800" : "text-slate-800"}>
                      {st.title}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">
                    {st.id === "bid" ? bidReady : st.sub}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- yarının kayıtları

/** Yarının açıklanmış PTF'si (14:00 sonrası, /api/market/live?day=tomorrow); yoksa null */
type AnnouncedPtf = { date: string; mean: number } | null;

function PtfCard({ load, announced }: { load: Load<OpsStatus>; announced: AnnouncedPtf }) {
  if (load.state === "loading") return <Skeleton h="h-40" />;
  if (load.state === "error")
    return <Failed what="Yarının PTF kaydı" message={load.message} />;
  const p = load.data.ptf;
  if (!p)
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Yarının PTF tahmini</p>
        <p className="mt-2 text-sm text-slate-700">
          Kayıt henüz yazılmadı. Sunucu her gün 12:03&apos;te hesaplar; şimdi görmek için
          Teklif öncesi sayfasında hesaplatın.
        </p>
        <Link
          href="/market/teklif"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
        >
          Teklif öncesi <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  // 14:00'ten sonra yarının PTF'si açıklandıysa büyük sayı odur; sabah kaydı onunla kıyaslanan sayıya döner
  const actual = announced && announced.date === p.targetDate ? announced.mean : null;
  if (actual !== null) {
    const diff = p.mean - actual;
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-slate-500">Yarının PTF&apos;si açıklandı</p>
          <StatusChip kind="exact" label="Açıklanan" />
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
          {nf(actual)} <span className="text-sm font-medium text-slate-500">TL/MWh ortalama</span>
        </p>
        <p className="mt-2 text-xs text-slate-700">
          Sabah tahmini ({clock(p.issuedAt)} kaydı{p.onTime ? "" : ", kesimden sonra"}){" "}
          <b className="tabular-nums">{nf(p.mean)}</b> TL/MWh: açıklanandan{" "}
          <b className="tabular-nums">{nf(Math.abs(diff))}</b> TL/MWh{" "}
          {Math.abs(diff) < 0.5 ? "farklı değil" : diff > 0 ? "yüksek" : "düşük"}
          {actual > 0 && ` (%${nf((Math.abs(diff) / actual) * 100)})`}.
        </p>
        <p className="mt-1 text-xs text-slate-500">Saat saat kıyas akşam karnesinde; günlük kayıt değişmez.</p>
        <Link
          href="/market/teklif"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
        >
          Ayrıntı <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">Yarının PTF tahmini</p>
        <StatusChip kind="record" label={`Kayıt ${clock(p.issuedAt)}${p.onTime ? "" : " · kesimden sonra"}`} />
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {nf(p.mean)} <span className="text-sm font-medium text-slate-500">TL/MWh</span>
      </p>
      {p.bandLo !== null && p.bandHi !== null && (
        <p className="text-xs text-slate-500">
          olası aralık (ortalama) {nf(p.bandLo)} – {nf(p.bandHi)}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-700">
        En pahalı {hh(p.max.hour)} ({nf(p.max.value)}), en ucuz {hh(p.min.hour)} (
        {nf(p.min.value)})
      </p>
      {p.nearCapHours.length > 0 && (
        <p className="mt-1 text-xs font-medium text-amber-800">
          Limite yakın: {p.nearCapHours.length} saat ({formatHours(p.nearCapHours)})
        </p>
      )}
      {p.levelAdj !== null && p.levelBasis && Math.abs(p.levelAdj) >= 1 && (
        <p className="mt-1 text-xs text-slate-500">
          Dünkü sapma düzeltmesi {p.levelAdj > 0 ? "+" : "−"}
          {nf(Math.abs(p.levelAdj))} TL/MWh
        </p>
      )}
      <Link
        href="/market/teklif"
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
      >
        Ayrıntı <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function ProductionCard({
  load,
  portfolio,
  minutes,
  forecastLink,
}: {
  load: Load<OpsStatus>;
  portfolio: Load<PortfolioProduction>;
  minutes: number | null;
  forecastLink: string;
}) {
  if (load.state === "loading" || minutes === null) return <Skeleton h="h-40" />;
  if (load.state === "error")
    return <Failed what="Üretim tahmini kayıtları" message={load.message} />;
  const chips = opsChips(load.data, minutes).filter((c) => c.key !== "ptf");
  const tone = {
    ok: "text-emerald-700",
    warn: "text-amber-800",
    bad: "text-red-700",
    wait: "text-slate-500",
  } as const;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">Yarının üretim tahmini</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {chips.map((c) => (
          <li key={c.key} className="flex items-baseline justify-between gap-2">
            <span className={`font-medium ${tone[c.tone]}`}>{c.text}</span>
            <span className="text-xs text-slate-500">
              {c.tone === "ok"
                ? "kesimden önce yazıldı"
                : c.tone === "wait"
                  ? "henüz saati gelmedi"
                  : c.tone === "warn"
                    ? "eksik ya da geç"
                    : "yazılmadı"}
            </span>
          </li>
        ))}
      </ul>
      <PortfolioLines load={portfolio} />
      <p className="mt-2 text-xs text-slate-500">
        Santral bazında tahmin proje sayfasında.
      </p>
      <Link
        href={forecastLink}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
      >
        Üretim tahmini <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/** Portföyün yarınki güneş + rüzgâr tahmini (sunucunun sabah kayıtları): toplam, tepe saat, proje başına */
function PortfolioLines({ load }: { load: Load<PortfolioProduction> }) {
  if (load.state === "loading") return null;
  if (load.state === "error")
    return <p className="mt-2 text-xs text-amber-800">Portföy toplamı alınamadı: {load.message}</p>;
  const { total, projects } = load.data;
  if (!total.hours)
    return (
      <p className="mt-2 text-xs text-slate-500">
        Portföy toplamı için güneş / rüzgâr kaydı henüz yok.
      </p>
    );
  const peak = total.hours.reduce((b, v, h) => (v > total.hours![b] ? h : b), 0);
  const withProd = projects.filter((p) => p.hours).sort((a, b) => b.mwh - a.mwh);
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <p className="text-xl font-bold tabular-nums text-slate-900">
        {nf(total.mwh)} <span className="text-sm font-medium text-slate-500">MWh portföy toplamı</span>
      </p>
      <p className="text-xs text-slate-500">
        En yüksek saat {hh(peak)} ({nf(total.hours[peak], 1)} MWh). Güneş ve rüzgâr; HES yok.
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
        {withProd.slice(0, 4).map((p) => (
          <li key={p.projectId} className="flex justify-between gap-2">
            <span className="truncate">{p.name}</span>
            <span className="tabular-nums">{nf(p.mwh)} MWh</span>
          </li>
        ))}
        {withProd.length > 4 && <li className="text-slate-400">+{withProd.length - 4} proje daha</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- PTF karnesi

/** Gerçek ve tahmin 24 saat, tek bakışta (yalnız çizgi; ayrıntı Teklif öncesi / Günlük pano'da) */
function MiniLines({ actual, forecast }: { actual: number[]; forecast: number[] }) {
  const all = [...actual, ...forecast];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const y = (v: number) => 4 + (1 - (v - lo) / Math.max(1, hi - lo)) * 52;
  const pts = (a: number[]) => a.map((v, h) => `${(h / 23) * 236 + 2},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 240 60" className="h-16 w-full" role="img" aria-label="Gerçek ve tahmin edilen saatlik PTF">
      <polyline points={pts(actual)} fill="none" stroke="#0f172a" strokeWidth="1.8" />
      <polyline points={pts(forecast)} fill="none" stroke="#4f46e5" strokeWidth="1.8" strokeDasharray="4 3" />
    </svg>
  );
}

function ScoreCard({ load }: { load: Load<PtfScorecard> }) {
  if (load.state === "loading") return <Skeleton h="h-40" />;
  if (load.state === "error") return <Failed what="PTF karnesi" message={load.message} />;
  const { last, last7, all, late, pending, records } = load.data;
  if (!last)
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Dünkü PTF tahmini ne kadar tuttu</p>
        <p className="mt-2">
          Skorlanacak gün yok ({records} kayıt; {pending} günün gerçekleşen fiyatı henüz yok,{" "}
          {late} kayıt kesimden sonra yazıldığı için sayılmaz).
        </p>
      </div>
    );
  const meanPrice = last.actual.reduce((s, v) => s + v, 0) / 24;
  const rel = meanPrice > 0 ? (last.mae / meanPrice) * 100 : null;
  const vsRef = last.refMae && last.refMae > 0 ? ((last.refMae - last.mae) / last.refMae) * 100 : null;
  const weak = (all?.days ?? 0) < SCORECARD_MIN_DAYS;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">Dünkü PTF tahmini ne kadar tuttu</p>
        <span className="text-[11px] text-slate-400">{trDay(last.date)}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {nf(last.mae)} <span className="text-sm font-medium text-slate-500">TL/MWh ortalama sapma</span>
      </p>
      <p className="text-xs text-slate-600">
        {rel !== null && <>Fiyatın %{nf(rel, 1)}&apos;i. </>}
        {vsRef !== null && (
          <>
            Basit yönteme göre %{nf(Math.abs(vsRef), 0)} {vsRef >= 0 ? "daha yakın" : "daha uzak"}.{" "}
          </>
        )}
        Gerçek fiyat {last.inside}/{last.banded} saatte tahmin aralığında kaldı.
      </p>
      <div className="mt-2">
        <MiniLines actual={last.actual} forecast={last.p50} />
        <p className="flex gap-3 text-[11px] text-slate-500">
          <span>
            <span className="font-bold text-slate-900">━</span> gerçekleşen
          </span>
          <span>
            <span className="font-bold text-indigo-600">╌</span> tahmin
          </span>
        </p>
      </div>
      {last7 && (
        <p className="mt-2 text-xs text-slate-600">
          Son {last7.days} gün: {nf(last7.mae)} TL/MWh
          {last7.vsRefPct !== null && <> (basit yönteme göre %{nf(last7.vsRefPct, 0)})</>}
          {last7.coveragePct !== null && <>, aralık kapsaması %{nf(last7.coveragePct, 0)} (hedef %80)</>}.
        </p>
      )}
      <p className={`mt-1 text-xs ${weak ? "font-medium text-amber-800" : "text-slate-500"}`}>
        {evidenceLabel(all?.days ?? 0)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- piyasa şimdi, dünün sonucu

/** "Dünün sonucu" yalnız gün gerçekten dünse; doğrulanmış veri geride kaldıysa son doğrulanmış gün diye yazılır */
const trYesterday = () =>
  new Date(Date.now() + 3 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);

function MarketCard({
  title,
  load,
  href,
  cta,
  what,
}: {
  title: string;
  load: Load<DailyMarket>;
  href: string;
  cta: string;
  what: string;
}) {
  if (load.state === "loading") return <Skeleton h="h-40" />;
  if (load.state === "error") return <Failed what={what} message={load.message} />;
  const d = load.data;
  const pr = d.prices;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">
        {title === "Dünün sonucu" && d.date !== trYesterday()
          ? "Son doğrulanmış gün"
          : title}{" "}
        <span className="text-slate-400">· {trDay(d.date)}</span>
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {pr.ptfMean === null ? "—" : nf(pr.ptfMean)}{" "}
        <span className="text-sm font-medium text-slate-500">TL/MWh PTF</span>
      </p>
      <p className="text-xs text-slate-500">
        SMF {pr.smfMean === null ? "—" : nf(pr.smfMean)} · makas{" "}
        {pr.spreadMean === null ? "—" : nf(pr.spreadMean)} ({pr.hours} saat)
      </p>
      <p className="mt-2 text-xs text-slate-700">
        Sistem açığı {d.direction.deficit} saat, fazla {d.direction.surplus}, dengede{" "}
        {d.direction.balanced}
        {pr.zeroHours > 0 ? ` · ${pr.zeroHours} sıfır fiyatlı saat` : ""}
      </p>
      <Link
        href={href}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
      >
        {cta} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------- uyarılar

const ALERT_STYLE = {
  bad: { cls: "border-red-200 bg-red-50 text-red-900", icon: AlertTriangle },
  warn: { cls: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  info: { cls: "border-slate-200 bg-white text-slate-700", icon: Info },
} as const;

function Alerts({ alerts, pending }: { alerts: CockpitAlert[]; pending: boolean }) {
  return (
    <section className="space-y-3">
      <SectionHead
        title="Uyarılar"
        sub="Eksik kayıtlar, limite yakın saatler, veri boşlukları"
      />
      {pending && alerts.length === 0 ? (
        <Skeleton h="h-16" />
      ) : alerts.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Şu an uyarı yok.
        </p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const st = ALERT_STYLE[a.tone];
            const Icon = st.icon;
            const body = (
              <span className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{a.text}</span>
              </span>
            );
            return (
              <li key={a.id}>
                {a.href ? (
                  <Link
                    href={a.href}
                    className={`block rounded-md border p-3 text-sm hover:brightness-95 ${st.cls}`}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={`rounded-md border p-3 text-sm ${st.cls}`}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- portföy

function Portfolio({ rows }: { rows: Load<ProjectKpis[]> }) {
  if (rows.state === "loading") return <Skeleton h="h-32" />;
  if (rows.state === "error") return <Failed what="Projeler" message={rows.message} />;
  if (rows.data.length === 0)
    return (
      <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Henüz verisi olan proje yok. EPİAŞ&apos;tan bir şirketin santrallerini ekleyerek
        başlayın.{" "}
        <Link
          href="/projects/epias"
          className="font-medium text-indigo-700 hover:underline"
        >
          EPİAŞ&apos;tan santral ekle
        </Link>
      </p>
    );
  return (
    <Card className="shadow-sm">
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proje</TableHead>
              <TableHead className="text-right">Sapma yükü</TableHead>
              <TableHead>Veri</TableHead>
              <TableHead className="text-right">Sayfalar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.data.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link
                    href={`/projects/${r.id}/results`}
                    className="font-medium text-slate-900 hover:text-indigo-700 hover:underline"
                  >
                    {r.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {r.plantCount} santral · {nf(r.capacityMw)} MW
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {tl(r.load.current)}
                </TableCell>
                <TableCell className="text-sm">
                  {r.dataGaps.length === 0 ? (
                    <span className="text-emerald-700">Tam</span>
                  ) : (
                    <span className="text-amber-700" title={r.dataGaps.join("\n")}>
                      {r.dataGaps.length} eksik
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm">
                  <Link
                    href={`/projects/${r.id}/forecast`}
                    className="text-indigo-700 hover:underline"
                  >
                    Üretim tahmini
                  </Link>
                  <span className="px-1.5 text-slate-300">·</span>
                  <Link
                    href={`/projects/${r.id}/results`}
                    className="text-indigo-700 hover:underline"
                  >
                    Sonuç
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- sayfa

export default function TodayPage() {
  const minutes = useTrMinutes();
  const status = useLoad<OpsStatus>("/api/ops/status", (d) => d as OpsStatus);
  const today = useLoad<{ day: DailyMarket; notes: string[] }>(
    "/api/market/live?day=today",
    (d) => ({
      day: d.day as DailyMarket,
      notes: (d.live?.notes ?? []) as string[],
    })
  );
  const yesterday = useLoad<DailyMarket>(
    "/api/market/daily",
    (d) => d.day as DailyMarket
  );
  const portfolio = useLoad<PortfolioProduction>("/api/ops/portfolio-forecast", (d) => d as PortfolioProduction);
  // Yarının PTF'si 13:00–14:00'te açıklanır; 14:00'ten sonra açıklanan değer sorulur (sunucuda 5 dk bellekte)
  const afterResults = minutes !== null && minutes >= 14 * 60;
  const tomorrowLive = useLoad<{ date: string; published: boolean; mean: number | null }>(
    afterResults ? "/api/market/live?day=tomorrow" : null,
    (d) => ({ date: d.view?.date, published: !!d.view?.published?.ptf, mean: d.view?.ptf?.mean ?? null })
  );
  const announced: AnnouncedPtf =
    tomorrowLive.state === "ok" && tomorrowLive.data.published && tomorrowLive.data.mean !== null
      ? { date: tomorrowLive.data.date, mean: tomorrowLive.data.mean }
      : null;
  const scorecard = useLoad<PtfScorecard>("/api/ops/ptf-scorecard", (d) => d as PtfScorecard);
  const [role, setRole] = useState<TodayRole>(DEFAULT_ROLE);
  useEffect(() => setRole(readRole()), []);
  const [rows, setRows] = useState<Load<ProjectKpis[]>>({ state: "loading" });
  const [lastProject, setLastProject] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setLastProject(readLastProject());
    read();
    window.addEventListener(LAST_PROJECT_EVENT, read);
    return () => window.removeEventListener(LAST_PROJECT_EVENT, read);
  }, []);

  // Projeler: önce liste, sonra aynı karşılaştırma motorundan özet (eski ana sayfayla aynı kaynak)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((r) => r.json())
      .then(async (d) => {
        const ids: string[] = (d?.projects ?? []).map((p: { id: string }) => p.id);
        if (!ids.length) return !cancelled && setRows({ state: "ok", data: [] });
        const c = await fetch(`/api/compare?ids=${ids.slice(0, 6).join(",")}`).then((r) =>
          r.json()
        );
        if (cancelled) return;
        if (!c?.success) throw new Error(c?.error ?? "Karşılaştırma alınamadı.");
        const sorted = [...(c.rows as ProjectKpis[])].sort((a, b) =>
          (b.period?.end ?? "").localeCompare(a.period?.end ?? "")
        );
        setRows({ state: "ok", data: sorted });
      })
      .catch(
        (e) =>
          !cancelled &&
          setRows({
            state: "error",
            message: e instanceof Error ? e.message : "Projeler alınamadı.",
          })
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const todayMarket = mapLoad(today, (v) => v.day);
  const fLink = forecastHref(lastProject);
  const liveNotes = today.state === "ok" ? today.data.notes : [];
  const alerts = useMemo(
    () =>
      buildAlerts({
        status: status.state === "ok" ? status.data : null,
        statusError: status.state === "error" ? status.message : null,
        nowMinutes: minutes ?? 0,
        liveNotes,
        projectGaps:
          rows.state === "ok"
            ? rows.data
                .filter((r) => r.dataGaps.length > 0)
                .map((r) => ({ id: r.id, name: r.name, gaps: r.dataGaps.length }))
            : [],
        forecastHref: fLink,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, rows, minutes, fLink, today]
  );
  const bidReady =
    status.state === "ok" && minutes !== null
      ? (() => {
          const c = opsChips(status.data, minutes);
          const ok = c.filter((x) => x.tone === "ok").length;
          return `${ok}/3 kayıt hazır (PTF, güneş, rüzgâr)`;
        })()
      : "PTF ve üretim tahmini, 12:30'a kadar";

  const sections: Record<TodaySection, React.ReactNode> = {
    tomorrow: (
      <section className="space-y-3">
        <SectionHead
          title="Yarın için"
          sub="Sunucunun sabah yazdığı değişmeyen günlük kayıtlar (PTF 12:03, güneş ve rüzgâr sabah)"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <PtfCard load={status} announced={announced} />
          <ProductionCard load={status} portfolio={portfolio} minutes={minutes} forecastLink={fLink} />
        </div>
        <Link
          href="/market/teklif"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
        >
          Saat saat teklif masası <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    ),
    score: (
      <section className="space-y-3">
        <SectionHead
          title="Akşam: dünün karnesi"
          sub="Motorun dünkü kaydı gerçekleşen fiyatla karşılaştırılır"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ScoreCard load={scorecard} />
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Üretim tahmini karnesi</p>
            <p className="mt-2">
              Güneş ve rüzgâr tahmininin ileriye dönük karnesi için kayıt toplanıyor; santral
              bazında gerçekleşen üretim iki gün gecikmeyle yayımlandığı için en erken Kasım
              ortasında anlamlı olur. O zamana kadar yalnız geçmişe dönük sınama var.
            </p>
          </div>
        </div>
      </section>
    ),
    market: (
      <section className="space-y-3">
        <SectionHead
          title="Piyasa"
          sub="Bugün şu ana kadar ve dün"
          href="/market/gunluk"
          cta="Günlük pano"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <MarketCard
            title="Bugün"
            load={todayMarket}
            href="/market/gunluk"
            cta="Bugün sekmesi"
            what="Bugünün piyasası"
          />
          <MarketCard
            title="Dünün sonucu"
            load={yesterday}
            href="/market/gunluk"
            cta="Geçmiş gün"
            what="Dünün sonucu"
          />
        </div>
      </section>
    ),
    alerts: <Alerts alerts={alerts} pending={status.state === "loading"} />,
    portfolio: (
      <section className="space-y-3">
        <SectionHead
          title="Portföyüm"
          sub="Proje başına hızlı geçiş"
          href="/projects"
          cta="Tüm projeler"
        />
        <Portfolio rows={rows} />
      </section>
    ),
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Bugün
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {/* Tarih tarayıcıda hesaplanır: sunucuda çizilen sayfa derleme gününü gösterip donuyordu */}
            {minutes !== null &&
              `${trDay(new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10))}. `}
            Yarın için ne hazır, piyasa şimdi nasıl.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <PhaseCard minutes={minutes} bidReady={bidReady} />

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Görünüm">
          <span className="text-xs font-medium text-slate-500">Görünüm</span>
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              title={r.hint}
              aria-pressed={role === r.id}
              onClick={() => {
                setRole(r.id);
                writeRole(r.id);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${role === r.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {r.label}
            </button>
          ))}
          <span className="text-xs text-slate-400">yalnız bölüm sırasını değiştirir</span>
        </div>

        {SECTION_ORDER[role].map((id) => (
          <React.Fragment key={id}>{sections[id]}</React.Fragment>
        ))}

        <p className="text-xs text-slate-500">
          Dönem özeti, sektördeki yeriniz ve karşılaştırmalar için{" "}
          <Link href="/ozet" className="text-indigo-700 hover:underline">
            Portföy özeti
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
