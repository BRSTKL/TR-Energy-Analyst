"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MethodLink } from "@/components/method-link";
import { shift } from "@/components/market/daily-dashboard";
import { SignalSection } from "@/components/market/brief";
import { Fold } from "@/components/market/fold";
import { nf } from "@/lib/format";
import { PreBidContextPanel } from "@/components/market/pre-bid-context";
import { PreBidEffectsPanel } from "@/components/market/pre-bid-effects";
import { PreBidBody, PreBidStatusCard } from "@/components/market/pre-bid-view";
import { PriceLimitNote } from "@/components/market/price-limit-note";
import { BidTable } from "@/components/market/bid-table";
import { PtfEnginePanel } from "@/components/market/ptf-engine-panel";
import { buildBrief } from "@/lib/analysis/pre-bid-brief";
import type { PreBidView } from "@/lib/analysis/pre-bid";
import type { PriceLimit } from "@/lib/analysis/price-limit";
import type { PtfLogHour } from "@/lib/ptf/forecast-log";
import type { PreBidContext } from "@/lib/services/pre-bid-context";
import type { PreBidEffects } from "@/lib/services/pre-bid-effects";

const trToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

interface Core {
  view: PreBidView;
  limit: PriceLimit | null;
  updatedAt: string;
  notes: string[];
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const d = await r.json();
  if (!d.success) throw new Error(d.error ?? "Veri alınamadı.");
  return d as T;
}

export default function BriefPage() {
  const tomorrow = shift(trToday(), 1);
  const [date, setDate] = useState<string>(tomorrow);
  const [reload, setReload] = useState(0);
  const [core, setCore] = useState<Core | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<PreBidContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [effects, setEffects] = useState<PreBidEffects | null>(null);
  const [effectsError, setEffectsError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [engineMean, setEngineMean] = useState<number | null>(null);
  const [engineHours, setEngineHours] = useState<PtfLogHour[] | null>(null);

  // Üç kaynak aynı anda; hızlı olan (model) ilk dolar, bağlam ve ölçüm geldikçe kartlar tamamlanır
  useEffect(() => {
    let cancelled = false;
    setCore(null);
    setCoreError(null);
    setCtx(null);
    setCtxError(null);
    setEffects(null);
    setEffectsError(null);
    getJson<{
      view: PreBidView;
      limit: PriceLimit | null;
      meta: { updatedAt: string; notes: string[] };
    }>(`/api/market/pre-bid?date=${date}`)
      .then(
        (d) =>
          !cancelled &&
          setCore({
            view: d.view,
            limit: d.limit,
            updatedAt: d.meta.updatedAt,
            notes: d.meta.notes,
          })
      )
      .catch(
        (e) =>
          !cancelled &&
          setCoreError(e instanceof Error ? e.message : "Model yüklenemedi.")
      );
    getJson<PreBidContext>(`/api/market/pre-bid-context?date=${date}`)
      .then((d) => !cancelled && setCtx(d))
      .catch(
        (e) =>
          !cancelled &&
          setCtxError(e instanceof Error ? e.message : "Bağlam verisi alınamadı.")
      );
    getJson<PreBidEffects>("/api/market/pre-bid-effects")
      .then((d) => !cancelled && setEffects(d))
      .catch(
        (e) =>
          !cancelled &&
          setEffectsError(e instanceof Error ? e.message : "Etki ölçümü alınamadı.")
      );
    return () => {
      cancelled = true;
    };
  }, [date, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const okView = core && core.view.ok ? core.view : null;
  // Fiyat tahmini PTF motorundan; eski önizleme modeli yalnız "Tüm ayrıntılar"da karşılaştırma için
  const brief = useMemo(
    () =>
      buildBrief({ view: null, limit: core?.limit ?? null, ctx, effects, engine: true }),
    [core, ctx, effects]
  );

  const openDetail = (id: string) => {
    setOpen(true);
    setTimeout(
      () =>
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80
    );
  };
  const ctxLoading = ctx === null && ctxError === null;
  const loading = core === null && coreError === null;

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
                <ArrowLeft className="h-3 w-3" /> Bugün
              </Link>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-700">Teklif öncesi</span>
            </div>
            <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              <span>
                Teklif öncesi · {date === tomorrow ? "yarın " : ""}
                {`${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`}
              </span>
              <span
                className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-800"
                title="Önizleme: yarının saatlik PTF tahmini ve teklif öncesi bilinen veriler tek sayfada. Al/sat önerisi vermez; alınamayan veriyi açıkça yazar."
              >
                Önizleme
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {date === tomorrow
                ? "Yarının fiyatı ve riskli saatler."
                : "Geçmiş gün: hesap o günün kesiminde bilinen veriyle yapıldı ve gerçekleşenle karşılaştırılır."}{" "}
              <MethodLink section="gunluk-pano" label="Yöntem ve varsayımlar" />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(loading || ctxLoading) && (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={date === tomorrow}
              onClick={() => setDate(tomorrow)}
            >
              Yarın
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={date === trToday()}
              onClick={() => setDate(trToday())}
            >
              Bugün (geçmişle sınama)
            </Button>
            <input
              type="date"
              aria-label="Hedef gün"
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={date}
              min="2026-06-15"
              max={tomorrow}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <Button variant="outline" size="sm" disabled={loading} onClick={refresh}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Yenile
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <PtfEnginePanel
          date={date}
          reload={reload}
          onMean={setEngineMean}
          onHours={setEngineHours}
          limit={core?.limit ?? null}
          folds={
            <>
              {core?.limit && (
                <Fold title="Fiyat limiti" hint={`${nf(core.limit.cap)} TL/MWh`}>
                  <PriceLimitNote limit={core.limit} bare />
                </Fold>
              )}
              <Fold
                title="Yarının fiyatı için bağlam"
                hint={
                  ctxLoading
                    ? "yükleniyor"
                    : ctxError
                      ? "alınamadı"
                      : `${brief.tally.up} yukarı, ${brief.tally.down} aşağı iten`
                }
              >
                {ctxError && <p className="text-sm text-amber-900">Bağlam verileri alınamadı: {ctxError}</p>}
                <SignalSection brief={brief} ctxLoading={ctxLoading} onDetail={openDetail} bare />
              </Fold>
              <Fold
                title="Daha fazla ayrıntı"
                hint="bağlam kartları, ölçüm, eski model"
                id="tum-ayrintilar"
                open={open}
                onToggle={setOpen}
              >
                {ctx ? (
                  <PreBidContextPanel date={date} expectedMean={engineMean} data={ctx} />
                ) : (
                  <p className="text-sm text-slate-500">
                    {ctxError ? `Bağlam kartları alınamadı: ${ctxError}` : "Bağlam kartları yükleniyor…"}
                  </p>
                )}
                {effects ? (
                  <PreBidEffectsPanel data={effects} />
                ) : (
                  <p className="text-sm text-slate-500">
                    {effectsError ? `Etki ölçümü alınamadı: ${effectsError}` : "Etki ölçümü yükleniyor…"}
                  </p>
                )}
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-slate-900">
                    Eski önizleme modeli (karşılaştırma için)
                  </h3>
                  <p className="text-sm text-slate-500">
                    Önceki basit model (yük tahmini, rüzgâr tahmini ve dünkü fiyat sapması; hata payı
                    yaklaşık ±550 TL/MWh). Sayfadaki tahmin artık motordan gelir.
                  </p>
                  {loading && (
                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Hesaplanıyor…
                    </p>
                  )}
                  {coreError && <p className="text-sm text-red-700">{coreError}</p>}
                  {core && !core.view.ok && (
                    <p className="flex gap-2 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {core.view.reason}
                    </p>
                  )}
                  {core?.notes.map((n) => (
                    <p key={n} className="text-sm text-amber-900">
                      {n}
                    </p>
                  ))}
                  {okView && core && <PreBidBody view={okView} limit={core.limit} />}
                </div>
                <PreBidStatusCard />
              </Fold>
            </>
          }
        >
          <BidTable date={date} ptf={engineHours} limit={core?.limit ?? null} />
        </PtfEnginePanel>
      </main>
    </div>
  );
}
