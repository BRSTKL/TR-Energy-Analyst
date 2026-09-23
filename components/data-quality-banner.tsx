"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface DataQuality {
  totalHours: number;
  verifiedHours: number;
  unverifiedHours: number;
  missingPriceHours: number;
  syntheticHours: number;
  legacyHours: number;
  isFullyVerified: boolean;
}

interface DataQualityBannerProps {
  projectId: string;
  /** Değiştiğinde (örn. EPİAŞ senkronu veya veri yükleme sonrası) kalite özeti yeniden çekilir */
  refreshKey?: unknown;
}

const pct = (part: number, total: number) =>
  total > 0 ? `%${((part / total) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "%0";

/**
 * Projedeki saatlerin bir kısmı doğrulanmamış (eski senkron / demo) veya eksik piyasa fiyatıyla
 * hesaplandıysa, sayfadaki finansal sonuçların güvenilir olmadığını belirten uyarı bandı.
 * Tüm saatler EPİAŞ veya dosyadan yüklenen fiyatlarla hesaplandıysa hiçbir şey göstermez.
 */
export function DataQualityBanner({ projectId, refreshKey }: DataQualityBannerProps) {
  const [quality, setQuality] = useState<DataQuality | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/data-quality`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.success) setQuality(json);
      })
      .catch(() => {
        // Kalite özeti alınamazsa sayfa normal çalışmaya devam eder
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  if (!quality || quality.totalHours === 0 || quality.isFullyVerified) return null;

  const { totalHours, verifiedHours, missingPriceHours, syntheticHours, legacyHours } = quality;

  const details: string[] = [];
  if (legacyHours > 0) {
    details.push(
      `${legacyHours.toLocaleString("tr-TR")} saat kaynağı doğrulanmamış fiyatla (eski senkron veya demo verisi)`
    );
  }
  if (syntheticHours > 0) {
    details.push(`${syntheticHours.toLocaleString("tr-TR")} saat sentetik demo fiyatıyla`);
  }
  if (missingPriceHours > 0) {
    details.push(`${missingPriceHours.toLocaleString("tr-TR")} saat piyasa fiyatı olmadan`);
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          Finansal sonuçlar henüz güvenilir değil: doğrulanmış piyasa fiyatıyla hesaplanan saat{" "}
          {verifiedHours.toLocaleString("tr-TR")} / {totalHours.toLocaleString("tr-TR")} (
          {pct(verifiedHours, totalHours)}).
        </p>
        <p>{details.join(" · ")}.</p>
        <p className="text-amber-800">
          Gelir, dengesizlik maliyeti ve arbitraj rakamlarını paylaşmadan önce ilgili dönem için
          EPİAŞ Senkronize Et ile fiyatları yeniden çekin. MWh bazlı tahmin sapmaları bu durumdan
          etkilenmez.
        </p>
      </div>
    </div>
  );
}
