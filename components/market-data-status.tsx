"use client";

import React from "react";
import { CheckCircle2, CircleAlert, CircleX, CloudDownload } from "lucide-react";
import { EpiasSyncDialog } from "@/components/epias-sync-dialog";
import { CoverageState, coverageState, useMarketCoverage } from "@/components/use-market-coverage";

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const num = (v: number) => v.toLocaleString("tr-TR");
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const STYLES: Record<Exclude<CoverageState, "empty">, { box: string; Icon: typeof CheckCircle2; icon: string }> = {
  complete: { box: "border-emerald-200 bg-emerald-50/70", Icon: CheckCircle2, icon: "text-emerald-600" },
  partial: { box: "border-amber-200 bg-amber-50/70", Icon: CircleAlert, icon: "text-amber-600" },
  none: { box: "border-rose-200 bg-rose-50/70", Icon: CircleX, icon: "text-rose-600" },
};

/**
 * Sonuç sayfasında her zaman görünen piyasa verisi göstergesi: projenin saatlerinin ne kadarının EPİAŞ'tan
 * çekilmiş (veya dosyadan yüklenmiş) fiyatla hesaplandığı, son çekim zamanı ve ay ay durum.
 */
export function MarketDataStatus({
  projectId,
  refreshKey,
  onSyncSuccess,
}: {
  projectId: string;
  refreshKey?: unknown;
  onSyncSuccess?: () => void;
}) {
  const coverage = useMarketCoverage(projectId, refreshKey);
  const state = coverageState(coverage);
  if (!coverage || state === "empty") return null;

  const { box, Icon, icon } = STYLES[state];
  const missingMonths = coverage.months.filter((m) => m.verifiedHours < m.hours).length;
  const title =
    state === "complete"
      ? "EPİAŞ piyasa verisi tam"
      : state === "partial"
        ? `EPİAŞ piyasa verisi eksik: ${missingMonths} ay tamamlanmamış`
        : "EPİAŞ piyasa verisi çekilmemiş";

  return (
    <div className={`rounded-xl border px-4 py-3 text-xs shadow-sm ${box}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} />
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-slate-600">
              {num(coverage.calendarVerifiedHours)} / {num(coverage.calendarHours)} saat EPİAŞ
              {coverage.fileHours > 0 ? " veya dosya" : ""} fiyatıyla hesaplandı
              {coverage.lastSyncedAt && ` · Son çekim: ${dateTime(coverage.lastSyncedAt)}`}
            </div>
          </div>
        </div>
        <EpiasSyncDialog
          projectId={projectId}
          onSyncSuccess={onSyncSuccess}
          trigger={
            <button
              type="button"
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium ${
                state === "complete"
                  ? "text-emerald-800 hover:bg-emerald-100"
                  : "bg-sky-600 text-white hover:bg-sky-700"
              }`}
            >
              <CloudDownload className="h-3.5 w-3.5" />
              {state === "complete" ? "Yeniden çek" : "EPİAŞ'tan çek"}
            </button>
          }
        />
      </div>

      {/* Ay ay durum: yeşil tam, sarı kısmi, kırmızı yok */}
      <div className="mt-2 flex flex-wrap gap-1">
        {coverage.months.map((m) => {
          const ratio = m.hours > 0 ? m.verifiedHours / m.hours : 0;
          const color = ratio === 1 ? "bg-emerald-500 text-white" : ratio > 0 ? "bg-amber-400 text-amber-950" : "bg-rose-400 text-white";
          const label = `${MONTHS_TR[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(2, 4)}`;
          return (
            <span
              key={m.month}
              className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${color}`}
              title={`${label}: ${num(m.verifiedHours)} / ${num(m.hours)} saat doğrulanmış fiyatlı${
                m.missingHours ? `, ${num(m.missingHours)} saat fiyatsız` : ""
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
