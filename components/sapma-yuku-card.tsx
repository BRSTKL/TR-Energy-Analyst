"use client";

import React, { useState } from "react";
import { AlertTriangle, Info, Loader2, RefreshCw, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlantReportData } from "@/lib/report/plant-report";
import { deviationLoad, monthlyRange } from "@/lib/report/deviation-load";
import { HYDRO_KIND_LABEL } from "@/lib/sector/benchmark";

/** Sonuç API'sinin `sapma` alanı: Dengesizlik Karnesi ile aynı motordan */
export interface SapmaSummary {
  settlement: PlantReportData["settlement"];
  kupst: PlantReportData["kupst"];
  kupstByPlant: Record<string, number>;
  coefficients2026: PlantReportData["coefficients2026"];
  yekdem: PlantReportData["yekdem"];
  coverage: PlantReportData["coverage"];
  dsg: PlantReportData["dsg"];
  riskPremium: {
    rules: string;
    portfolio: NonNullable<PlantReportData["riskPremium"]>["portfolio"];
    plants: Array<Omit<NonNullable<PlantReportData["riskPremium"]>["plants"][number], "months">>;
  } | null;
  sector: PlantReportData["sector"];
  aggregator?: PlantReportData["aggregator"];
  outages?: PlantReportData["outages"];
  fairShare?: PlantReportData["fairShare"];
  marketProfile?: PlantReportData["marketProfile"];
  check: { unknownOwner: string[]; yekdemNextUnknown: string[]; missing: Array<{ company: string; plants: string[] }> };
}

const tl = (v: number) =>
  Math.abs(v) >= 1e6
    ? `${(v / 1e6).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} milyon ₺`
    : `${Math.round(v).toLocaleString("tr-TR")} ₺`;

const Chip = ({ kind }: { kind: "exact" | "assumption" | "estimate" | "scenario" }) => {
  const style = {
    exact: "bg-teal-50 text-teal-800",
    assumption: "bg-indigo-50 text-indigo-800",
    estimate: "bg-amber-50 text-amber-800",
    scenario: "bg-orange-50 text-orange-800",
  }[kind];
  const label = { exact: "Kesin hesap", assumption: "Varsayıma bağlı", estimate: "Tahmini", scenario: "Senaryo" }[kind];
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
 * Sonuç sayfasının "Sapma yükü" kartı: uzlaştırma biriminde netleşmiş dengesizlik riski + tahmini KÜPST ve 2026 etkisi.
 * YEKDEM santralleri de dahildir (dengesizlikleri kendilerine aittir; YEK Yönetmeliği md. 15/1, 23/1). PowerPoint
 * raporuyla aynı rakamlar.
 */
export function SapmaYukuCard({ sapma, projectId, onRefresh, plantScoped = false }: { sapma: SapmaSummary; projectId: string; onRefresh: () => void; plantScoped?: boolean }) {
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const st = sapma.settlement;
  const c26 = sapma.coefficients2026;
  const companyCost = st.companyLevelCostTl;
  const netted = st.sameCompanyNettingTl > 0.005 * st.plantLevelCostTl;
  // Rapor özetiyle aynı tanım: tüm santraller
  const load = deviationLoad({ coefficients2026: c26, kupst: sapma.kupst, totals: { imbalanceCostTl: companyCost } });
  const agg = sapma.aggregator ?? null;
  const unitLabel = agg ? `${agg.name} portföyünde` : "şirket bazında";
  const nettingPlace = agg ? "portföy içinde" : "şirket içinde";

  // Çok santralli projede uzun ad listeleri uyarıyı okunmaz yapıyor: ilk birkaç ad ve toplam sayı
  const names = (list: string[], max = 5) =>
    list.length <= max ? list.join(", ") : `${list.slice(0, max).join(", ")} ve ${list.length - max} santral daha`;
  const warnings: string[] = [];
  for (const m of sapma.check.missing) warnings.push(`${m.company} şirketinin ${m.plants.length} santrali projede yok: ${names(m.plants)}.`);
  if (sapma.check.unknownOwner.length)
    warnings.push(
      agg
        ? `Sahibi bilinmeyen ${sapma.check.unknownOwner.length} santral: ${names(sapma.check.unknownOwner)}. Uzlaştırma toplayıcı portföyünde olduğu için dengesizlik etkilenmez; yalnız sahiplere göre paylaştırmada ayrı sahip sayılır.`
        : `Sahibi bilinmeyen santral: ${names(sapma.check.unknownOwner)}. Ayrı şirket sayıldı; aynı şirketin santralleriyse risk olduğundan yüksek görünür.`
    );
  if (sapma.check.yekdemNextUnknown.length)
    warnings.push(
      `YEKDEM'den çıkış yılı bilinmeyen ${sapma.check.yekdemNextUnknown.length} santral (sonraki yılın YEKDEM listesi henüz yayımlanmamış olabilir): ${names(sapma.check.yekdemNextUnknown)}.`
    );

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
              <Scale className="h-4 w-4 text-slate-700" /> Sapma yükü ({unitLabel} uzlaştırma)
            </CardTitle>
            <CardDescription>
              {plantScoped && (
                <span className="mb-1 block font-medium text-amber-800">
                  Bu blok seçili santrali değil, tüm portföyü gösterir (uzlaştırma portföy bazında yapılır).
                </span>
              )}
              Dengesizlik riski (gün içi işlemler öncesi) ve tahmini KÜPST.{" "}
              {agg
                ? `Santraller ${agg.name} portföyünde tek dengede uzlaştırılır: farklı sahiplerin santralleri her saat birbirini dengeler.`
                : "Dengesizlik şirket bazında uzlaştırılır: aynı şirketin santralleri her saat birbirini dengeler."}{" "}
              {agg ? "KÜPST, toplayıcı portföyünde topluluk (portföy) birimi bazında hesaplanır (EPDK 14029 md. 4): santraller arası sapmalar netleşir." : "KÜPST santral bazındadır, netleşmez."} Rakamlar PowerPoint raporuyla aynıdır.
              {agg?.scope && <span className="mt-1 block font-medium text-slate-700">{agg.scope}.</span>}
              {sapma.yekdem && (
                <span className="mt-1 block text-slate-700">
                  YEKDEM&apos;deki {sapma.yekdem.plantNames.length} santral de dahildir: YEKDEM katılımcısı üretimini serbest piyasada kendisi
                  satar, dengesizliği kendisine aittir (YEK Yönetmeliği md. 15/1, 23/1); yalnızca geliri PTF yerine YEK fiyatından oluşur.
                </span>
              )}
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

        {sapma.outages && sapma.outages.plants.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-slate-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            Olası arıza/kısıntı: {sapma.outages.plants.reduce((a, o) => a + o.events.length, 0)} blok (tahmin kurulu gücün ≥%30&apos;u,
            üretim ≤%2, ≥3 saat), santral bazında (netleşmemiş) dengesizlik riskinin %{sapma.outages.sharePct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kadarı
            {sapma.outages.plants.some((o) => o.events.some((e) => e.concurrent)) && "; bir kısmı birden çok santralde aynı anda (olası kısıntı)"}.
            Tahmin hatası değil; arıza mı YAT talimatı mı teyit edilmeli.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Dengesizlik riski"
            value={tl(companyCost)}
            sub={
              netted
                ? `Santral bazında ${tl(st.plantLevelCostTl)}; ${tl(st.sameCompanyNettingTl)} ${nettingPlace} netleşiyor` +
                  (() => {
                    const mr = monthlyRange(agg?.monthlyBenefit);
                    return mr
                      ? ` (her ay %${mr.min.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}–${mr.max.toLocaleString("tr-TR", { maximumFractionDigits: 0 })})`
                      : "";
                  })()
                : "Şirket bazında"
            }
            tone="text-rose-600"
            chip={<Chip kind="exact" />}
          />
          <Tile label="KÜPST (sapma bedeli)" value={tl(sapma.kupst.totalTl)} sub="Tolerans dışı sapma × max(PTF, SMF) × katsayı (2025: 0,03; 2026: 0,05)" tone="text-rose-700" chip={<Chip kind="estimate" />} />
          <Tile label="Sapma yükü" value={tl(load.current)} sub="Dengesizlik riski + KÜPST (tüm santraller)" tone="text-slate-900" />
          {load.next2026 !== null && (
            <Tile
              label="2026 kurallarıyla"
              value={tl(load.next2026)}
              sub={`${c26 ? `Dengesizlik +${tl(c26.deltaTl)}; ` : ""}veri yılının fiyatları ve sistem yönleri tekrar ederse`}
              tone="text-amber-600"
              chip={<Chip kind="scenario" />}
            />
          )}
        </div>

        {(sapma.riskPremium || sapma.sector) && (
          <div className="grid gap-3 lg:grid-cols-2">
            {sapma.riskPremium && (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Dengesizlik risk primi</p>
                  <Chip kind="assumption" />
                </div>
                <p className="mt-0.5 text-2xs text-slate-500">
                  Sözleşme fiyatına eklenecek MWh başına sapma yükü · {sapma.riskPremium.rules}
                </p>
                {(() => {
                  const rp = sapma.riskPremium.portfolio;
                  const worstLabel = `${rp.worstMonth.month.slice(5, 7)}.${rp.worstMonth.month.slice(2, 4)}`;
                  // Kısa veride P90 en kötü aya eşittir; aynı değeri iki kez göstermeyin
                  const sameAsWorst = Math.round(rp.p90MonthTlPerMwh) === Math.round(rp.worstMonth.tlPerMwh);
                  const tiles: Array<[string, number, string]> = [
                    ["Beklenen", rp.expectedTlPerMwh, "text-slate-900"],
                    sameAsWorst
                      ? [`İhtiyatlı (P90 = en kötü ay ${worstLabel})`, rp.p90MonthTlPerMwh, "text-amber-600"]
                      : ["İhtiyatlı (P90)", rp.p90MonthTlPerMwh, "text-amber-600"],
                  ];
                  if (!sameAsWorst) tiles.push([`En kötü ay (${worstLabel})`, rp.worstMonth.tlPerMwh, "text-rose-600"]);
                  return (
                <div className={`mt-2 grid gap-2 text-center ${tiles.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {tiles.map(([label, v, tone]) => (
                    <div key={label as string} className="rounded-md bg-slate-50 p-2">
                      <p className={`text-lg font-bold ${tone}`}>{Math.round(v as number).toLocaleString("tr-TR")}</p>
                      <p className="text-2xs text-slate-500">{label} · ₺/MWh</p>
                    </div>
                  ))}
                </div>
                  );
                })()}
                {sapma.marketProfile && sapma.marketProfile.baseloadPtfTl > 0 && (() => {
                  // PPA göstergesi: profil indirimi (yakalanan fiyat / baz PTF) + beklenen dengesizlik primi
                  const mp = sapma.marketProfile!;
                  const premiumPct = (sapma.riskPremium!.portfolio.expectedTlPerMwh / mp.baseloadPtfTl) * 100;
                  const ppa = mp.captureRatePct - premiumPct;
                  const f = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
                  return (
                    <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                      <strong>PPA göstergesi: baz PTF&apos;nin ~%{f(ppa)} kadarı</strong> · yakalanan fiyat %{f(mp.captureRatePct)} (profil indirimi %
                      {f(100 - mp.captureRatePct)}) · dengesizlik primi %{f(premiumPct)}. Fiyat riski ve marj hariç.
                    </p>
                  );
                })()}
              </div>
            )}
            {sapma.sector && (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Sektörle kıyaslama ({sapma.sector.label ?? sapma.sector.year})</p>
                  <Chip kind="exact" />
                </div>
                <p className="mt-0.5 text-2xs text-slate-500">MWh başına dengesizlik riski, santral tek başına; EPİAŞ&apos;taki lisanslı santraller</p>
                <div className="mt-2 space-y-1.5">
                  {sapma.sector.types.map((t) => {
                    const diff = ((t.portfolioUnitTl - t.unitImbalanceTl.median) / t.unitImbalanceTl.median) * 100;
                    return (
                      <div key={`${t.type}:${t.kind ?? ""}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                        <span className="font-semibold text-slate-800">{t.type === "RES" ? "Rüzgâr" : t.type === "GES" ? "Güneş" : t.type === "HES" ? "Hidro" : t.type}{t.kind ? ` · ${HYDRO_KIND_LABEL[t.kind]}` : ""}</span>
                        <span className="text-slate-600">
                          Portföyünüz <strong>{Math.round(t.portfolioUnitTl).toLocaleString("tr-TR")} ₺</strong> · sektör medyanı{" "}
                          {Math.round(t.unitImbalanceTl.median).toLocaleString("tr-TR")} ₺ ·{" "}
                          <span className={diff > 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>
                            {diff > 0 ? "+" : "−"}%{Math.abs(Math.round(diff))}
                          </span>{" "}
                          · sektörün %{Math.round(100 - t.portfolioRankPct)} kadarından iyi
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {plantsByKupst.length > 1 && (
          <details className="rounded-md border border-slate-200 p-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">{agg ? "Santral bazında KÜPST (santral tek başına olsaydı; toplam portföy KÜPST'ünden büyüktür)" : "Santral bazında KÜPST (tahmini)"}</summary>
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
          KÜPST tahminidir: tolerans plana oranlandı (2025: rüzgâr %17, güneş %10, diğer %5, katsayı 0,03, EPDK 13025; 2026&apos;dan
          itibaren rüzgâr %15, güneş %8, katsayı 0,05, EPDK 14029). Kısıntı talimatları santral bazında yayımlanmadığından ayrılamadı. Aşağıdaki santral grafikleri ve tablo santral bazındadır; portföy
          toplamları {agg ? "portföy" : "şirket"} bazındadır.
        </p>
      </CardContent>
    </Card>
  );
}
