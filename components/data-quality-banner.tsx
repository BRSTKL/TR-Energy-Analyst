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
  /** Ayı eksik santraller ("Boreas 1 Enez RES: Temmuz 2025 yok") */
  generationGaps?: string[];
  /** Planı 0 iken tam çalışan santraller (plan girilmemiş olabilir) */
  zeroPlanHours?: string[];
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

  if (!quality || quality.totalHours === 0) return null;
  const gapNotice = (
    <>
      <GenerationGapNotice gaps={quality.generationGaps ?? []} />
      <ZeroPlanNotice items={quality.zeroPlanHours ?? []} />
    </>
  );
  if (quality.isFullyVerified) return gapNotice;

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
    <>
      {gapNotice}
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
    </>
  );
}

/** Santral × ay üretim verisi eksikse (ör. EPİAŞ'ta bir ay yayımlanmamış) uyarı; eksik yoksa hiçbir şey göstermez */
function GenerationGapNotice({ gaps }: { gaps: string[] }) {
  if (gaps.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">Üretim verisi eksik: bu aylar santral ve portföy rakamlarına girmedi.</p>
        <ul className="list-disc pl-4">
          {gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <p className="text-amber-800">
          Eksik ay santralin birim maliyetini, portföy netleşmesini ve sektör kıyasını etkiler. Veriyi EPİAŞ&apos;tan yeniden
          çekin ya da raporda bu santrali ayrıca belirtin.
        </p>
      </div>
    </div>
  );
}

function ZeroPlanNotice({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">Bazı saatlerde ilk plan (KGÜP) sıfır, santral ise tam çalışmış.</p>
        <ul className="list-disc pl-4">
          {items.slice(0, 8).map((g) => (
            <li key={g}>{g}</li>
          ))}
          {items.length > 8 && <li>… ve {items.length - 8} santral daha</li>}
        </ul>
        <p className="text-amber-800">
          Plan o saatler için girilmemiş ya da ilk sürümde boş kalmış olabilir; bu saatler dengesizlik maliyetini ve sektör
          sıralamasını şişirir. Gerçek bir tahmin hatası olup olmadığını santral işletmecisiyle teyit edin.
        </p>
      </div>
    </div>
  );
}
