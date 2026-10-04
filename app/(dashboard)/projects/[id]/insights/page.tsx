"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlantScopePicker } from "@/components/plant-scope-picker";
import { ReportDownloadDialog } from "@/components/report-download-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Compass,
  FileSpreadsheet,
  Flame,
  Layers,
  Lightbulb,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  Wind,
  Zap,
} from "lucide-react";
import {
  getTimeOfDayInterval,
  HighestCostHoursAnalysis,
  MitigationSuggestion,
  PlantComparisonResult,
} from "@/lib/strategy/insights";
import { EpiasSyncDialog } from "@/components/epias-sync-dialog";
import { DataQualityBanner } from "@/components/data-quality-banner";
import { MarketDataUploadDialog } from "@/components/market-data-upload-dialog";

import { nf } from "@/lib/format";
interface PlantInsight {
  plantId: string;
  plantName: string;
  plantType: string;
  capacityMw: number;
  highestCostHours: HighestCostHoursAnalysis;
  suggestions: MitigationSuggestion[];
}

interface InsightsApiResponse {
  success: boolean;
  project: {
    id: string;
    name: string;
    description?: string;
  };
  portfolioAnalysis: {
    highestCostHours: HighestCostHoursAnalysis;
    /** Uzlaştırma biriminde netleşmiş portföy saatlerinden çıkan öneriler */
    suggestions: MitigationSuggestion[];
    settlementUnit: string;
  };
  plantInsights: PlantInsight[];
  profitabilityComparison: PlantComparisonResult[];
}

export default function ProjectInsightsPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [data, setData] = useState<InsightsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/insights`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Proje bulunamadı.");
        }
        throw new Error("İçgörüler yüklenirken sunucu hatası oluştu.");
      }
      const json: InsightsApiResponse = await res.json();
      if (!json.success) {
        throw new Error("Veri formatı geçersiz.");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchData();
    }
  }, [projectId, fetchData]);

  // Aktif filtrelenmiş analiz
  const currentCostAnalysis = useMemo(() => {
    if (!data) return null;
    if (selectedPlantId === "all") {
      return data.portfolioAnalysis.highestCostHours;
    }
    const plant = data.plantInsights.find((p) => p.plantId === selectedPlantId);
    return plant ? plant.highestCostHours : null;
  }, [data, selectedPlantId]);

  // Aktif filtrelenmiş aksiyon önerileri
  const currentSuggestions = useMemo(() => {
    if (!data) return [];
    // Tüm Portföy: netleşmiş portföy serisinden hesaplanan öneriler (santral önerilerinin kopyası değil)
    if (selectedPlantId === "all") return data.portfolioAnalysis.suggestions;
    const plant = data.plantInsights.find((p) => p.plantId === selectedPlantId);
    return plant ? plant.suggestions : [];
  }, [data, selectedPlantId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
          <h2 className="text-xl font-semibold text-slate-800">
            Kural Tabanlı Stratejik İçgörüler Üretiliyor...
          </h2>
          <p className="max-w-sm text-sm text-slate-500">
            Saatlik maliyet sapmaları taranıyor, örüntüler eşleştiriliyor ve risk azaltma
            önerileri hesaplanıyor.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-md border-rose-200">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg text-slate-900">
              İçgörüler Yüklenemedi
            </CardTitle>
            <CardDescription className="text-slate-600">
              {error || "Bu projeye ait içgörü kaydı bulunamadı."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={fetchData} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Tekrar Dene
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/results`}>Sonuç Raporuna Dön</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${projectId}/results`}
                className="flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-900"
              >
                <ArrowLeft className="h-3 w-3" /> Sonuç Dashboard
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-medium text-slate-700">
                Strateji ve İçgörüler
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Stratejik İçgörü &amp; Risk Analizi
              </h1>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                Rule-Based Motor
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              {data.project.name} • En yüksek maliyetli saatler, risk azaltma önerileri ve
              portföy karlılık sıralaması.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ReportDownloadDialog projectId={projectId} />
            <a
              href={`/api/projects/${projectId}/export/excel`}
              download
              className="inline-flex items-center"
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                Excel İndir (.xlsx)
              </Button>
            </a>
            <EpiasSyncDialog
              projectId={projectId}
              onSyncSuccess={fetchData}
            />
            <MarketDataUploadDialog
              projectId={projectId}
              onUploadSuccess={fetchData}
            />
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </Button>
            <Button
              size="sm"
              asChild
              variant="outline"
              className="gap-1.5 border-sky-300 text-sky-700 hover:bg-sky-50"
            >
              <Link href={`/projects/${projectId}/planning`}>
                <Target className="h-3.5 w-3.5 text-sky-600" />
                Planlama Verimliliği
              </Link>
            </Button>
            <Button
              size="sm"
              asChild
              variant="default"
              className="gap-1.5 bg-slate-900 hover:bg-slate-800"
            >
              <Link href={`/projects/${projectId}/results`}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Sonuç Tablosu
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-4 pt-8 sm:px-6 lg:px-8">
        <DataQualityBanner projectId={projectId} refreshKey={data} />

        {/* Santral Filtre Seçici */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PlantScopePicker
            allId="all"
            allLabel={`Tüm Portföy (${data.plantInsights.length} Santral)`}
            plants={data.plantInsights.map((p) => ({ id: p.plantId, name: p.plantName, type: p.plantType }))}
            value={selectedPlantId}
            onChange={setSelectedPlantId}
          />

          <div className="text-xs text-slate-500">
            Filtre:{" "}
            <strong className="text-slate-800">
              {selectedPlantId === "all"
                ? `Tüm Portföy (netleşmiş, ${data.portfolioAnalysis.settlementUnit})`
                : data.plantInsights.find((p) => p.plantId === selectedPlantId)
                    ?.plantName}
            </strong>
          </div>
        </div>

        {/* 1. BÖLÜM: EN YÜKSEK MALİYETLİ SAATLERİN ORTAK ÖZELLİKLERİ */}
        {currentCostAnalysis && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                <Flame className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  1. En Yüksek Maliyetli Saatlerin Analizi (Top{" "}
                  {currentCostAnalysis.topNHours})
                </h2>
                <p className="text-xs text-slate-500">
                  Toplam maliyetin %{currentCostAnalysis.percentageOfTotalCost.toFixed(0)}
                  {" "}kadarı bu {currentCostAnalysis.topNHours} saatte gerçekleşti (
                  {currentCostAnalysis.totalTopNCost.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺ kayıp).
                </p>
              </div>
            </div>

            {/* 4 Örüntü Kartı */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Örüntü 1: Sistem Yönü Dağılımı */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Hakim Sistem Yönü
                    </CardTitle>
                    <Compass className="h-4 w-4 text-slate-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xl font-bold text-slate-900">
                    {currentCostAnalysis.directionDistribution.dominantDirection ===
                      "DEFICIT" && <span className="text-rose-600">Enerji Açığı</span>}
                    {currentCostAnalysis.directionDistribution.dominantDirection ===
                      "SURPLUS" && (
                      <span className="text-emerald-600">Enerji Fazlası</span>
                    )}
                    {currentCostAnalysis.directionDistribution.dominantDirection ===
                      "BALANCED" && <span className="text-slate-600">Dengede</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Kritik saatlerin{" "}
                    <strong>
                      %
                      {
                        currentCostAnalysis.directionDistribution[
                          currentCostAnalysis.directionDistribution.dominantDirection
                        ].percentage
                      }
                    </strong>
                    {" "}kadarı bu sistem yönünde.
                  </p>
                  <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="bg-rose-500"
                      style={{
                        width: `${currentCostAnalysis.directionDistribution.DEFICIT.percentage}%`,
                      }}
                      title={`Açık: %${currentCostAnalysis.directionDistribution.DEFICIT.percentage}`}
                    />
                    <div
                      className="bg-emerald-500"
                      style={{
                        width: `${currentCostAnalysis.directionDistribution.SURPLUS.percentage}%`,
                      }}
                      title={`Fazla: %${currentCostAnalysis.directionDistribution.SURPLUS.percentage}`}
                    />
                    <div
                      className="bg-slate-300"
                      style={{
                        width: `${currentCostAnalysis.directionDistribution.BALANCED.percentage}%`,
                      }}
                      title={`Dengede: %${currentCostAnalysis.directionDistribution.BALANCED.percentage}`}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Örüntü 2: Saat Dilimi Yoğunlaşması */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Zaman Yoğunlaşması
                    </CardTitle>
                    <Clock className="h-4 w-4 text-slate-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-indigo-700">
                    {currentCostAnalysis.dominantInterval.label.split(" ")[0]} Dilimi
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Maliyetlerin{" "}
                    <strong>%{currentCostAnalysis.dominantInterval.percentage}</strong>
                    {" "}kadarı bu zaman aralığında kümeleniyor.
                  </p>
                  <div className="text-2xs mt-2 font-mono text-slate-400">
                    {currentCostAnalysis.dominantInterval.label}
                  </div>
                </CardContent>
              </Card>

              {/* Örüntü 3: Tahmin Hatası Artışı */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Tahmin Hatası Artışı
                    </CardTitle>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-amber-600">
                    {currentCostAnalysis.errorRateRatio.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kat
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    En pahalı saatlerdeki hata kurulu gücün %
                    {(currentCostAnalysis.topNMeanErrorRate * 100).toFixed(0)} kadarı; tüm
                    saatlerin ortalaması %
                    {(currentCostAnalysis.overallMeanErrorRate * 100).toFixed(0)}.
                  </p>
                </CardContent>
              </Card>

              {/* Örüntü 4: Sistematik Yanlılık (Bias) */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Sistematik Yanlılık (Bias)
                    </CardTitle>
                    <Target className="h-4 w-4 text-slate-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-slate-900">
                    {currentCostAnalysis.systematicBias === "OVER_FORECASTING" && (
                      <span className="text-rose-600">Aşırı Tahmin</span>
                    )}
                    {currentCostAnalysis.systematicBias === "UNDER_FORECASTING" && (
                      <span className="text-amber-600">Eksik Tahmin</span>
                    )}
                    {currentCostAnalysis.systematicBias === "MIXED" && (
                      <span className="text-slate-700">Dengeli / Karışık</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {currentCostAnalysis.overForecastCount} saat eksik üretim,{" "}
                    {currentCostAnalysis.underForecastCount} saat fazla üretim
                    gerçekleşti.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* En Maliyetli Saatler Listesi Tablosu */}
            <Card className="mt-4 border-slate-200 shadow-sm">
              <CardHeader className="py-3.5">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  En Yüksek Maliyetli İlk {currentCostAnalysis.topHours.length} Saat
                  Detayı
                </CardTitle>
                <CardDescription className="text-xs">
                  Sistem yönü, fiyat makası (SMF - PTF) ve üretici sapmasının incelenmesi.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 text-xs">
                      <TableHead>Tarih / Saat</TableHead>
                      <TableHead>Zaman Dilimi</TableHead>
                      <TableHead>PTF (₺)</TableHead>
                      <TableHead>SMF (₺)</TableHead>
                      <TableHead>Sistem Yönü</TableHead>
                      <TableHead className="text-right">Tahmin (MWh)</TableHead>
                      <TableHead className="text-right">Gerçekleşen (MWh)</TableHead>
                      <TableHead className="text-right">Hata / kurulu güç</TableHead>
                      <TableHead className="text-right font-bold text-rose-600">
                        Kayıp (₺)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentCostAnalysis.topHours.map((hour, idx) => (
                      <TableRow key={idx} className="text-xs">
                        <TableCell className="font-mono">
                          {new Date(hour.timestamp)
                            .toISOString()
                            .replace("T", " ")
                            .substring(0, 16)}
                        </TableCell>
                        <TableCell>
                          <span className="text-2xs rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                            {getTimeOfDayInterval(hour.hour).label.split(" ")[0]}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">
                          {hour.ptf.toLocaleString("tr-TR")}
                        </TableCell>
                        <TableCell className="font-mono">
                          {hour.smf.toLocaleString("tr-TR")}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-2xs rounded px-1.5 py-0.5 font-semibold ${
                              hour.systemDirection === "DEFICIT"
                                ? "bg-rose-100 text-rose-700"
                                : hour.systemDirection === "SURPLUS"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {hour.systemDirection === "DEFICIT"
                              ? "Enerji Açığı"
                              : hour.systemDirection === "SURPLUS"
                                ? "Enerji Fazlası"
                                : "Dengede"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {nf(hour.forecastMwh, 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {nf(hour.actualMwh, 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-amber-700">
                          %{nf(hour.errorRate * 100, 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-rose-600">
                          {hour.imbalanceCost.toLocaleString("tr-TR", {
                            maximumFractionDigits: 0,
                          })}{" "}
                          ₺
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        )}

        {/* 2. BÖLÜM: KURAL TABANLI RİSK AZALTMA ÖNERİLERİ */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                2. Kural Tabanlı Aksiyon ve Risk Azaltma Önerileri
              </h2>
              <p className="text-xs text-slate-500">
                Tüm saatlerdeki maliyet dağılımına göre tetiklenir. Etkiler, önerilen aksiyon geçmiş veriye
                uygulanıp yeniden hesaplanarak bulunur; bunlar aynı maliyetten pay ister ve toplanamaz.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {currentSuggestions.map((sug) => (
              <Card
                key={sug.id}
                className="flex flex-col justify-between border-slate-200 shadow-sm"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-2xs rounded-full px-2 py-0.5 font-semibold ${
                        sug.priority === "HIGH"
                          ? "border border-rose-200 bg-rose-100 text-rose-700"
                          : sug.priority === "MEDIUM"
                            ? "border border-amber-200 bg-amber-100 text-amber-800"
                            : "border border-slate-200 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {{ HIGH: "Yüksek Öncelik", MEDIUM: "Orta Öncelik", LOW: "Düşük Öncelik" }[sug.priority]}
                    </span>
                    <span className="text-2xs font-medium uppercase tracking-wider text-slate-400">
                      {sug.category}
                    </span>
                  </div>
                  <CardTitle className="mt-2 text-base font-semibold text-slate-900">
                    {sug.title}
                  </CardTitle>
                  <div className="mt-1 rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600">
                    <strong className="text-slate-800">Tetikleyen Kural:</strong>{" "}
                    {sug.triggerRule}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <p className="text-xs leading-relaxed text-slate-600">
                    {sug.description}
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <span className="text-xs font-semibold text-slate-800">
                      Aksiyon Adımları:
                    </span>
                    <ul className="space-y-1 text-xs text-slate-600">
                      {sug.actionItems.map((action, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div
                    className={`mt-2 space-y-1 rounded-md border p-2.5 text-xs ${
                      sug.recommended === true
                        ? "border-emerald-100 bg-emerald-50/80 text-emerald-900"
                        : sug.recommended === false
                          ? "border-rose-100 bg-rose-50/80 text-rose-900"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div>
                      <strong>Simülasyon:</strong> {sug.expectedImpact}
                    </div>
                    {sug.impact && (
                      <div className="opacity-80">
                        {sug.impact.method} {sug.impact.caveat}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 3. BÖLÜM: SANTRAL KARLILIK VE PORTFÖY RİSK SIRALAMASI */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                3. Santral Karlılık ve Portföy Yönetim Riski Değerlendirmesi
              </h2>
              <p className="text-xs text-slate-500">
                Aynı teknoloji tipindeki santrallerin birim gelir ve dengesizlik maliyeti
                üzerinden kıyaslanması.
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {data.profitabilityComparison.map((comp) => (
              <Card key={comp.plantId} className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                        #{comp.rankInType}
                      </span>
                      <CardTitle className="text-base font-bold text-slate-900">
                        {comp.plantName}
                      </CardTitle>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        comp.assessment === "EXCELLENT"
                          ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
                          : comp.assessment === "GOOD"
                            ? "border border-cyan-200 bg-cyan-100 text-cyan-800"
                            : "border border-amber-200 bg-amber-100 text-amber-800"
                      }`}
                    >
                      {comp.assessment === "EXCELLENT"
                        ? "En iyi çeyrek"
                        : comp.assessment === "GOOD"
                          ? "Ortalamanın üstü"
                          : comp.assessment === "MODERATE"
                            ? "Ortalamanın altı"
                            : "En kötü çeyrek"}
                    </span>
                  </div>
                  <CardDescription className="text-xs">
                    {comp.plantType} Teknolojisi • {comp.capacityMw} MW Kurulu Güç
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Skor & İlerleme Çubuğu */}
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">
                        {comp.scoreBasis === "sector" ? "Sektör skoru (sektörün % kaçından iyi)" : "Proje içi skor"}
                      </span>
                      <span className="text-base font-bold text-slate-900">
                        {comp.score} / 100
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${
                          comp.score >= 75
                            ? "bg-emerald-500"
                            : comp.score >= 50
                              ? "bg-cyan-500"
                              : comp.score >= 25
                                ? "bg-amber-500"
                                : "bg-rose-500"
                        }`}
                        style={{ width: `${comp.score}%` }}
                      />
                    </div>
                  </div>

                  {/* Metrik Kutuları */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md border bg-white p-2">
                      <span className="text-2xs block text-slate-500">Birim Gelir</span>
                      <strong className="font-mono text-xs text-slate-900">
                        {comp.unitRevenue.toLocaleString("tr-TR")} ₺
                      </strong>
                    </div>
                    <div className="rounded-md border bg-white p-2">
                      <span className="text-2xs block text-slate-500">Birim dengesizlik</span>
                      <strong className="font-mono text-xs text-rose-600">
                        {comp.unitImbalanceCost.toLocaleString("tr-TR")} ₺
                      </strong>
                    </div>
                    <div className="rounded-md border bg-white p-2">
                      <span className="text-2xs block text-slate-500">Kayıp Oranı</span>
                      <strong className="font-mono text-xs text-amber-700">
                        %{nf(comp.imbalanceCostRatio, 1)}
                      </strong>
                    </div>
                  </div>

                  {/* Gerekçe Metni */}
                  <div className="rounded-md border border-slate-200/60 bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-700">
                    <strong className="mb-1 block text-slate-900">
                      Portföy Hizmeti Gerekçesi:
                    </strong>
                    {comp.rationale}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
