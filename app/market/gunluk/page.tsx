"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MethodLink } from "@/components/method-link";
import {
  DailyDashboard,
  trDay,
  weekday,
  shift,
  type Availability,
  type LiveInfo,
} from "@/components/market/daily-dashboard";
import { PreBidPanel } from "@/components/market/pre-bid-view";
import { TomorrowViewPanel } from "@/components/market/tomorrow-view";
import { DAY_CLASS_LABEL, type DailyMarket } from "@/lib/analysis/daily-market";
import type { PriceLimit } from "@/lib/analysis/price-limit";
import type { PreBidView } from "@/lib/analysis/pre-bid";
import type { TomorrowView } from "@/lib/analysis/tomorrow-view";

type Mode = "day" | "today" | "tomorrow" | "prebid";
const MODES: Array<[Mode, string]> = [
  ["day", "Geçmiş gün"],
  ["today", "Bugün"],
  ["tomorrow", "Yarın"],
  ["prebid", "Teklif öncesi (önizleme)"],
];

export default function DailyMarketPage() {
  const [mode, setMode] = useState<Mode>("day");
  const [requested, setRequested] = useState<string | null>(null);
  const [day, setDay] = useState<DailyMarket | null>(null);
  const [available, setAvailable] = useState<Availability | null>(null);
  const [tomorrow, setTomorrow] = useState<TomorrowView | null>(null);
  const [limit, setLimit] = useState<PriceLimit | null>(null);
  const [live, setLive] = useState<LiveInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [preBid, setPreBid] = useState<PreBidView | null>(null);
  const [preBidDate, setPreBidDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDay(null);
    setTomorrow(null);
    setPreBid(null);
    const url =
      mode === "day"
        ? `/api/market/daily${requested ? `?date=${requested}` : ""}`
        : mode === "prebid"
          ? `/api/market/pre-bid${preBidDate ? `?date=${preBidDate}` : ""}`
          : `/api/market/live?day=${mode}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) throw new Error(d.error);
        setLimit(d.limit ?? null);
        setLive(d.live ?? null);
        if (mode === "tomorrow") setTomorrow(d.view);
        else if (mode === "prebid") {
          setPreBid(d.view);
          setLive({
            updatedAt: d.meta.updatedAt,
            lastSystemHour: null,
            notes: d.meta.notes,
          });
        } else setDay(d.day);
        if (mode === "day") setAvailable(d.available);
      })
      .catch(
        (e) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Günlük pano yüklenemedi.")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, requested, preBidDate, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const date =
    mode === "tomorrow"
      ? tomorrow?.date
      : mode === "prebid"
        ? preBid && preBid.ok
          ? preBid.date
          : preBidDate
        : (day?.date ?? requested);
  const go = (d: string) =>
    available && d >= available.start && d <= available.end && setRequested(d);
  const shown =
    mode === "tomorrow"
      ? tomorrow?.date
      : mode === "prebid"
        ? preBid && preBid.ok
          ? preBid.date
          : undefined
        : day?.date;
  const shownClass =
    mode === "tomorrow"
      ? tomorrow?.dayClass
      : mode === "prebid"
        ? preBid && preBid.ok
          ? preBid.dayClass
          : undefined
        : day?.dayClass;

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs">
              <Link
                href="/"
                className="flex items-center gap-1 text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span className="text-slate-300">/</span>
              <Link href="/market" className="text-slate-500 hover:text-slate-900">
                Piyasa
              </Link>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-700">Günlük pano</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {mode === "tomorrow"
                ? "Yarın görünümü"
                : mode === "prebid"
                  ? "Teklif öncesi görünüm (önizleme)"
                  : mode === "today"
                    ? "Bugün (şu ana kadar)"
                    : "Günlük piyasa panosu"}
              {shown ? ` · ${trDay(shown)}` : ""}
            </h1>
            <MethodLink section="gunluk-pano" label="Yöntem ve varsayımlar" />
            {shown && shownClass && (
              <p className="mt-1 text-xs text-slate-500">
                {weekday(shown)}, {DAY_CLASS_LABEL[shownClass]} günü.{" "}
                {mode === "day"
                  ? "Fiyatlar ve sistem yönü EPİAŞ'ın doğrulanmış verisi; tüketim ve rüzgâr gerçek zamanlı ölçüm (EPİAŞ düzeltebilir), güneş KGÜP planı (lisanssız dahil)."
                  : mode === "today"
                    ? "Veriler EPİAŞ'tan canlı alınır ve henüz doğrulanmamıştır; geçmiş saatler EPİAŞ tarafından düzeltilebilir."
                    : mode === "prebid"
                      ? "Saatlik fiyat beklentisi ve ± aralık; geçmiş günde denerseniz aynı hesap o günün girdileriyle yapılır ve gerçekleşenle karşılaştırılır."
                      : "PTF, yük tahmini ve GÖP hacmi EPİAŞ'tan canlı alınır."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            {mode === "day" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Önceki gün"
                  disabled={!date || !available || date <= available.start}
                  onClick={() => date && go(shift(date, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <input
                  type="date"
                  aria-label="Gün"
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                  value={date ?? ""}
                  min={available?.start}
                  max={available?.end}
                  onChange={(e) => e.target.value && go(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Sonraki gün"
                  disabled={!date || !available || date >= available.end}
                  onClick={() => date && go(shift(date, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!available || date === available.end}
                  onClick={() => available && setRequested(available.end)}
                >
                  Son gün
                </Button>
              </>
            ) : (
              <>
                {mode === "prebid" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading || preBidDate === null}
                      onClick={() => setPreBidDate(null)}
                    >
                      Yarın
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() =>
                        setPreBidDate(
                          shift(
                            new Date(Date.now() + 3 * 3_600_000)
                              .toISOString()
                              .slice(0, 10),
                            -1
                          )
                        )
                      }
                    >
                      Dün (deneme)
                    </Button>
                    <input
                      type="date"
                      aria-label="Hedef gün"
                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                      value={date ?? ""}
                      min="2026-06-15"
                      max={shift(
                        new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10),
                        1
                      )}
                      onChange={(e) => e.target.value && setPreBidDate(e.target.value)}
                    />
                  </>
                )}
                <Button variant="outline" size="sm" disabled={loading} onClick={refresh}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Yenile
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="inline-flex max-w-full flex-wrap rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {MODES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${mode === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {!day && !tomorrow && !preBid && !error && (
          <div className="text-sm text-slate-500">Yükleniyor…</div>
        )}

        {mode !== "tomorrow" && mode !== "prebid" && day && (
          <DailyDashboard
            day={day}
            available={available}
            limit={limit}
            live={mode === "today" ? live : null}
          />
        )}
        {mode === "prebid" && preBid && (
          <PreBidPanel
            view={preBid}
            limit={limit}
            notes={live?.notes ?? []}
            updatedAt={live?.updatedAt ?? new Date().toISOString()}
            date={
              preBidDate ??
              shift(new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10), 1)
            }
          />
        )}
        {mode === "tomorrow" && tomorrow && (
          <TomorrowViewPanel
            view={tomorrow}
            limit={limit}
            notes={live?.notes ?? []}
            updatedAt={live?.updatedAt ?? new Date().toISOString()}
          />
        )}
      </main>
    </div>
  );
}
