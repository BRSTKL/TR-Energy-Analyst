"use client";

import React, { useState } from "react";
import { AlertTriangle, Info, Loader2, RefreshCw, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlantReportData } from "@/lib/report/plant-report";

/** Sonuç API'sinin `sapma` alanı: Dengesizlik Karnesi ile aynı motordan */
export interface SapmaSummary {
  settlement: PlantReportData["settlement"];
  kupst: PlantReportData["kupst"];
  kupstByPlant: Record<string, number>;
  exposure: PlantReportData["exposure"];
  coefficients2026: PlantReportData["coefficients2026"];
  yekdem: PlantReportData["yekdem"];
  coverage: PlantReportData["coverage"];
  dsg: PlantReportData["dsg"];
  check: { unknownOwner: string[]; yekdemNextUnknown: string[]; missing: Array<{ company: string; plants: string[] }> };
}

const tl = (v: number) =>
  Math.abs(v) >= 1e6
    ? `${(v / 1e6).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} milyon ₺`
    : `${Math.round(v).toLocaleString("tr-TR")} ₺`;

const Chip = ({ kind }: { kind: "exact" | "assumption" | "estimate" }) => {
  const style = {
    exact: "bg-teal-50 text-teal-800",
    assumption: "bg-indigo-50 text-indigo-800",
    estimate: "bg-amber-50 text-amber-800",
  }[kind];
  const label = { exact: "Kesin hesap", assumption: "Varsayıma bağlı", estimate: "Tahmini" }[kind];
  return <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${style}`}>{label}</span>;
};

function Tile({ label, value, sub, tone, chip }: { label: string; value: string; sub?: string; tone: string; chip?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {chip}
      </div>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/**
 * Sonuç sayfasının "Sapma yükü" kartı: şirket bazında uzlaştırılmış dengesizlik riski + tahmini KÜPST, 2026 etkisi ve
 * YEKDEM varsayımları (A: YEKDEM portföyüne yansır, B: şirkete yansır). PowerPoint raporuyla aynı rakamlar.
 */
export function SapmaYukuCard({ sapma, projectId, onRefresh }: { sapma: SapmaSummary; projectId: string; onRefresh: () => void }) {
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const st = sapma.settlement;
  const ex = sapma.exposure;
  const c26 = sapma.coefficients2026;
  const k26 = sapma.kupst.next2026Tl ?? sapma.kupst.totalTl;
  const companyCost = st.companyLevelCostTl;
  const netted = st.sameCompanyNettingTl > 0.005 * st.plantLevelCostTl;

  const warnings: string[] = [];
  for (const m of sapma.check.missing) warnings.push(`${m.company} şirketinin ${m.plants.length} santrali projede yok: ${m.plants.join(", ")}.`);
  if (sapma.check.unknownOwner.length)
    warnings.push(`Sahibi bilinmeyen santral: ${sapma.check.unknownOwner.join(", ")}. Ayrı şirket sayıldı; aynı şirketin santralleriyse risk olduğundan yüksek görünür.`);
  if (sapma.check.yekdemNextUnknown.length) warnings.push(`YEKDEM'den çıkış yılı bilinmeyen santral: ${sapma.check.yekdemNextUnknown.join(", ")}.`);

  const updateEpias = async () => {
    setUpdating(true);
    setUpdateError(null);
    try {
      const d = await fetch(`/api/projects/${projectId}/epias-meta`, { method: "POST" }).then((r) => r.json());
      if (!d.success) throw new Error(d.error);
      if (d.errors?.length) setUpdateError(d.errors.join(" "));
      onRefresh();
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : "EPİAŞ bilgileri güncellenemedi.");
    } finally {
      setUpdating(false);
    }
  };

  const plantsByKupst = Object.entries(sapma.kupstByPlant).sort((a, b) => b[1] - a[1]);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Scale className="h-4 w-4 text-slate-700" /> Sapma yükü (şirket bazında uzlaştırma)
            </CardTitle>
            <CardDescription>
              Dengesizlik riski (gün içi işlemler öncesi) ve tahmini KÜPST. Dengesizlik şirket bazında uzlaştırılır: aynı
              şirketin santralleri her saat birbirini dengeler. KÜPST santral bazındadır, netleşmez.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={updateEpias} disabled={updating} className="h-8 gap-1 text-xs">
            {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            EPİAŞ bilgilerini güncelle
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(warnings.length > 0 || updateError) && (
          <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2.5">
            {warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
              </p>
            ))}
            {updateError && <p className="text-xs text-rose-700">{updateError}</p>}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Dengesizlik riski"
            value={tl(companyCost)}
            sub={netted ? `Santral bazında ${tl(st.plantLevelCostTl)}; ${tl(st.sameCompanyNettingTl)} şirket içinde netleşiyor` : "Şirket bazında"}
            tone="text-rose-600"
            chip={<Chip kind="exact" />}
          />
          <Tile label="KÜPST (sapma bedeli)" value={tl(sapma.kupst.totalTl)} sub="Tolerans dışı sapma × max(PTF, SMF) × 0,03" tone="text-rose-700" chip={<Chip kind="estimate" />} />
          <Tile label="Sapma yükü" value={tl(companyCost + sapma.kupst.totalTl)} sub="Dengesizlik riski + KÜPST (tüm santraller)" tone="text-slate-900" />
          {c26 && (
            <Tile
              label="2026 katsayılarıyla"
              value={tl(c26.cost2026Tl + k26)}
              sub={`Dengesizlik +${tl(c26.deltaTl)} (%${c26.deltaPct.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}); 2025 fiyatları tekrar ederse`}
              tone="text-amber-600"
              chip={<Chip kind="exact" />}
            />
          )}
        </div>

        {ex && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">YEKDEM: ana senaryo ve duyarlılık</p>
              <Chip kind="assumption" />
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Mevzuatın yapısına göre (YEK Yön. md. 15–17) YEKDEM santrallerinin dengesizliği YEKDEM portföyünde uzlaştırılır;
              KÜPST tüm santraller için şirkete aittir. Resmi teyit için doğrulanmalı.
              {ex.exitingPlants.length > 0 && ` 2026'da YEKDEM'den çıkan: ${ex.exitingPlants.join(", ")}.`}
              {ex.stayingPlants.length > 0 && ` Devam eden: ${ex.stayingPlants.join(", ")}.`}
              {ex.unknownExitPlants.length > 0 && ` Çıkış yılı bilinmeyen: ${ex.unknownExitPlants.join(", ")}.`}
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 font-medium">Senaryo</th>
                    <th className="py-1 text-right font-medium">2025 sapma yükü</th>
                    <th className="py-1 text-right font-medium">2026 sapma yükü</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  <tr className="border-t border-indigo-100">
                    <td className="py-1.5">
                      Ana senaryo · dengesizlik: YEKDEM dışı{ex.exitingPlants.length ? " (2026'da + YEKDEM'den çıkanlar)" : ""}; KÜPST: tüm santraller
                    </td>
                    <td className="py-1.5 text-right font-semibold">{tl(ex.directCostTl + sapma.kupst.totalTl)}</td>
                    <td className="py-1.5 text-right font-semibold">{ex.exposure2026Tl !== null ? tl(ex.exposure2026Tl + k26) : "—"}</td>
                  </tr>
                  <tr className="border-t border-indigo-100">
                    <td className="py-1.5">Duyarlılık · YEKDEM santrallerinin dengesizliği de şirkete yansısaydı</td>
                    <td className="py-1.5 text-right font-semibold">{tl(companyCost + sapma.kupst.totalTl)}</td>
                    <td className="py-1.5 text-right font-semibold">{c26 ? tl(c26.cost2026Tl + k26) : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {plantsByKupst.length > 1 && (
          <details className="rounded-md border border-slate-200 p-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">Santral bazında KÜPST (tahmini)</summary>
            <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {plantsByKupst.map(([name, v]) => (
                <div key={name} className="flex justify-between border-b border-slate-100 py-0.5 text-xs">
                  <span className="text-slate-700">{name}</span>
                  <span className="font-medium text-slate-900">{tl(v)}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <p className="flex items-start gap-1.5 text-2xs text-slate-500">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          KÜPST tahminidir: tolerans plana oranlandı (2025: rüzgâr %17, güneş %10, diğer %5, EPDK 13025; 2026&apos;dan itibaren
          rüzgâr %15, güneş %8). Kısıntı talimatları santral bazında yayımlanmadığından ayrılamadı. Aşağıdaki santral grafikleri ve tablo santral bazındadır; portföy
          toplamları şirket bazındadır.
        </p>
      </CardContent>
    </Card>
  );
}
