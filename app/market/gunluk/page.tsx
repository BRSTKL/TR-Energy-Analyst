"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { MethodLink } from "@/components/method-link";
import {
  DailyDashboard,
  hh,
  MONTHS,
  trDay,
  weekday,
  shift,
  type Availability,
  type LiveInfo,
} from "@/components/market/daily-dashboard";
import { TomorrowViewPanel } from "@/components/market/tomorrow-view";
import { DAY_CLASS_LABEL, type DailyMarket } from "@/lib/analysis/daily-market";
import type { PriceLimit } from "@/lib/analysis/price-limit";
import type { TomorrowView } from "@/lib/analysis/tomorrow-view";

/**
 * Günlük pano: piyasada bir günde ne oldu / ne oluyor (gözlem). Gün şeridi dün, bugün ve yarını yan yana koyar; başka bir gün
 * tarih kutusundan seçilir. Yarın için fiyat tahmini ve teklif masası ayrı sayfadadır (Teklif öncesi: karar).
 */
type Mode = "day" | "today" | "tomorrow";

/** Gün şeridi: dün (doğrulanmış), bugün (canlı), yarın (açıklanan). `offset` gün farkı, yalnız tarih etiketi için */
const DAYS: Array<{ id: Mode; label: string; offset: number }> = [
  { id: "day", label: "Dün", offset: -1 },
  { id: "today", label: "Bugün", offset: 0 },
  { id: "tomorrow", label: "Yarın", offset: 1 },
];

/** Sekme adreste tutulur (?sekme=gecmis|bugun|yarin): bağlantılar doğru günü açar, sayfa yenilenince seçim korunur */
const MODE_PARAM: Record<Mode, string> = { day: "gecmis", today: "bugun", tomorrow: "yarin" };
const modeFromUrl = (): Mode | null => {
  const v = new URLSearchParams(window.location.search).get("sekme");
  const hit = (Object.keys(MODE_PARAM) as Mode[]).find((m) => MODE_PARAM[m] === v);
  return hit ?? null;
};

const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}`;
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export default function DailyMarketPage() {
  const [mode, setModeState] = useState<Mode>("day");
  // Türkiye günü tarayıcıda hesaplanır (sunucuda çizilen sayfa derleme gününü gösterip donardı)
  const [trToday, setTrToday] = useState<string | null>(null);
  useEffect(() => {
    const m = modeFromUrl();
    if (m) setModeState(m);
    setTrToday(new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10));
  }, []);
  const [requested, setRequested] = useState<string | null>(null);
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    const url = new URL(window.location.href);
    url.searchParams.set("sekme", MODE_PARAM[m]);
    window.history.replaceState(null, "", url.toString());
  }, []);
  const [day, setDay] = useState<DailyMarket | null>(null);
  const [available, setAvailable] = useState<Availability | null>(null);
  const [tomorrow, setTomorrow] = useState<TomorrowView | null>(null);
  const [limit, setLimit] = useState<PriceLimit | null>(null);
  const [live, setLive] = useState<LiveInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Otomatik yenileme sessizdir: eldeki grafikler yerinde kalır, yeni saatler sağa eklenir (yükleniyor ekranı ve hata kutusu yok)
  const quietRefresh = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const quiet = quietRefresh.current;
    quietRefresh.current = false;
    if (!quiet) {
      setLoading(true);
      setDay(null);
      setTomorrow(null);
    }
    setError(null);
    const url =
      mode === "day"
        ? `/api/market/daily${requested ? `?date=${requested}` : ""}`
        : `/api/market/live?day=${mode}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) throw new Error(d.error);
        setLimit(d.limit ?? null);
        setLive(d.live ?? null);
        if (mode === "tomorrow") setTomorrow(d.view);
        else setDay(d.day);
        if (mode === "day") setAvailable(d.available);
      })
      .catch(
        (e) =>
          !cancelled &&
          !quiet &&
          setError(e instanceof Error ? e.message : "Günlük pano yüklenemedi.")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, requested, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  // Bugün ve yarın canlıdır: 5 dakikada bir (sunucu önbelleğiyle aynı süre) sekme açıksa kendini yeniler
  useEffect(() => {
    if (mode === "day") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      quietRefresh.current = true;
      setReload((n) => n + 1);
    }, 5 * 60_000);
    return () => clearInterval(timer);
  }, [mode]);
  const date = mode === "tomorrow" ? tomorrow?.date : (day?.date ?? requested);
  const go = (d: string) =>
    available && d >= available.start && d <= available.end && setRequested(d);
  const shown = mode === "tomorrow" ? tomorrow?.date : day?.date;
  const shownClass = mode === "tomorrow" ? tomorrow?.dayClass : day?.dayClass;
  const yesterday = trToday ? shift(trToday, -1) : null;
  const customDay = mode === "day" && requested !== null;
  const isActive = (id: Mode) => (id === "day" ? mode === "day" && !customDay : mode === id);
  // Dünün verisi EPİAŞ'ta doğrulanana kadar gecikir; o zaman son doğrulanmış gün gösterilir ve bu açıkça söylenir
  const staleYesterday = mode === "day" && !customDay && !!day && !!yesterday && day.date < yesterday;

  const status: { chip: React.ReactNode; text: string } | null =
    mode === "day"
      ? {
          chip: <StatusChip kind="exact" label="Doğrulanmış veri" />,
          text: staleYesterday
            ? "Dünün verisi henüz doğrulanmadı; son doğrulanmış gün gösteriliyor."
            : "Fiyatlar ve sistem yönü EPİAŞ'ın doğrulanmış verisi.",
        }
      : mode === "today"
        ? {
            chip: <StatusChip kind="estimate" label="Canlı, doğrulanmadı" />,
            text:
              `PTF bütün gün açıklandı. ` +
              `${live?.lastPriceHour != null ? `SMF ${hh(live.lastPriceHour)} saatine kadar yayımlandı` : "SMF henüz yayımlanmadı"}; ` +
              `${live?.lastSystemHour != null ? `tüketim ve üretim ${hh(live.lastSystemHour)} saatine kadar yayımlandı` : "tüketim ve üretim henüz yayımlanmadı"}. ` +
              `Grafikler yayımlanan saatleri gösterir; yayımlandıkça dolar.${live ? ` ${clock(live.updatedAt)} itibarıyla, 5 dakikada bir yenilenir.` : ""}`,
          }
        : tomorrow
          ? tomorrow.published.ptf
            ? {
                chip: <StatusChip kind="exact" label="PTF açıklandı" />,
                text: `Yarının fiyatı açıklandı; bu bir tahmin değil.${live ? ` ${clock(live.updatedAt)} itibarıyla.` : ""}`,
              }
            : {
                chip: <StatusChip kind="estimate" label="PTF henüz açıklanmadı" />,
                text: `Yarının PTF'si 14:00'te açıklanır; şimdilik yük tahmini görünüyor.${live ? ` ${clock(live.updatedAt)} itibarıyla.` : ""}`,
              }
          : null;

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs">
              <Link
                href="/"
                className="flex items-center gap-1 text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="h-3 w-3" /> Bugün
              </Link>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-700">Günlük pano</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Günlük pano{shown ? ` · ${trDay(shown)}` : ""}
            </h1>
            {shown && shownClass && (
              <p className="mt-1 text-sm text-slate-600">
                {weekday(shown)}, {DAY_CLASS_LABEL[shownClass]} günü.
              </p>
            )}
            {status && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
                {status.chip}
                <span>{status.text}</span>
              </p>
            )}
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer">Veri nereden geliyor?</summary>
              <p className="mt-1 max-w-3xl">
                {mode === "tomorrow"
                  ? "PTF, yük tahmini ve GÖP hacmi EPİAŞ'tan canlı alınır."
                  : mode === "today"
                    ? "Veriler EPİAŞ'tan canlı alınır, 5 dakikada bir yenilenir ve henüz doğrulanmamıştır; geçmiş saatler EPİAŞ tarafından düzeltilebilir. EPİAŞ tüketim ve üretimi yaklaşık bir saat gecikmeyle biriktirir (en yeni saat eksik geldiği için tamamlanana kadar gösterilmez); SMF, sistem yönü ve talimatları ise saatler sonra, bu örnekte yaklaşık 5 saat sonra yayımlar. Grafikler yalnız yayımlanmış saatleri gösterir ve yayımlandıkça sağa uzar. Rampa ve günün özeti gün tamamlanana kadar eksik hesaplanır."
                    : "Fiyatlar ve sistem yönü EPİAŞ'ın doğrulanmış verisi; tüketim ve rüzgâr gerçek zamanlı ölçüm (EPİAŞ düzeltebilir), güneş KGÜP planı (lisanssız dahil)."}{" "}
                <MethodLink section="gunluk-pano" label="Yöntem ve varsayımlar" />
              </p>
            </details>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            {mode !== "day" && (
              <Button variant="outline" size="sm" disabled={loading} onClick={refresh}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Yenile
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div
            role="group"
            aria-label="Gün"
            className="inline-flex max-w-full flex-wrap rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
          >
            {DAYS.map(({ id, label, offset }) => {
              // Etikette tarih: gösterilen gün biliniyorsa o, değilse Türkiye gününden hesaplanan
              const d = isActive(id) && shown ? shown : trToday ? shift(trToday, offset) : null;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={isActive(id)}
                  onClick={() => {
                    setMode(id);
                    if (id === "day") setRequested(null);
                  }}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium ${isActive(id) ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {id === "day" && staleYesterday ? "Son gün" : label}
                  {d && <span className="ml-1.5 text-xs font-normal tabular-nums opacity-70">{shortDate(d)}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-slate-500">Başka gün</span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Önceki gün"
              disabled={mode !== "day" || !date || !available || date <= available.start}
              onClick={() => date && go(shift(date, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="date"
              aria-label="Gün seç"
              className={`h-9 rounded-md border bg-white px-2 text-sm ${customDay ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}
              value={mode === "day" ? (date ?? "") : ""}
              min={available?.start}
              max={available?.end}
              onChange={(e) => {
                if (!e.target.value) return;
                if (mode !== "day") setMode("day");
                go(e.target.value);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              aria-label="Sonraki gün"
              disabled={mode !== "day" || !date || !available || date >= available.end}
              onClick={() => date && go(shift(date, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {mode === "tomorrow" && (
          <Link
            href="/market/teklif"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 hover:bg-indigo-100"
          >
            <span>
              <b>Yarın için teklif mi hazırlıyorsunuz?</b> Fiyat tahmini, riskli saatler ve saat saat
              teklif masası ayrı sayfada.
            </span>
            <span className="inline-flex items-center gap-1 font-medium">
              Teklif öncesi <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {!day && !tomorrow && !error && (
          <div className="text-sm text-slate-500">Yükleniyor…</div>
        )}

        {mode !== "tomorrow" && day && (
          <DailyDashboard
            day={day}
            available={available}
            limit={limit}
            live={mode === "today" ? live : null}
          />
        )}
        {mode === "tomorrow" && tomorrow && (
          <TomorrowViewPanel view={tomorrow} limit={limit} notes={live?.notes ?? []} />
        )}
      </main>
    </div>
  );
}
