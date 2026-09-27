"use client";

import React, { useEffect, useState, useMemo } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpDown,
  Download,
  FileSpreadsheet,
  Flame,
  Layers,
  Lightbulb,
  RefreshCw,
  Sun,
  Target,
  TrendingDown,
  Wind,
  Zap,
  UploadCloud,
  Factory,
  FlaskConical,
  Network,
} from "lucide-react";
import {
  HourlyResult,
  ImbalancePricingProfile,
  MonthlyAggregate,
  YearlyAggregate,
} from "@/lib/calculations/types";
import { PricingProfileDialog } from "@/components/pricing-profile-dialog";
import { EpiasSyncDialog } from "@/components/epias-sync-dialog";
import { DataQualityBanner } from "@/components/data-quality-banner";
import { MarketDataStatus } from "@/components/market-data-status";
import { MarketDataUploadDialog } from "@/components/market-data-upload-dialog";
import { ReportDownloadDialog } from "@/components/report-download-dialog";
import { PlantComparisonCard } from "@/components/plant-comparison-card";
import { LowPriceExposureCard } from "@/components/low-price-exposure-card";
import { ForecastAccuracyCard } from "@/components/forecast-accuracy-card";
import type { PlantComparisonResult } from "@/lib/analysis/plant-comparison";
import { NettingCard } from "@/components/netting-card";
import { SapmaYukuCard, type SapmaSummary } from "@/components/sapma-yuku-card";
import type { NettingResult } from "@/lib/analysis/portfolio-netting";

interface PlantResult {
  plantId: string;
  plantName: string;
  plantType: string;
  capacityMw: number;
  hourly: HourlyResult[];
  monthly: MonthlyAggregate[];
  yearly: YearlyAggregate;
}

interface ApiResponse {
  success: boolean;
  project: {
    id: string;
    name: string;
    description?: string;
  };
  pricingProfile?: ImbalancePricingProfile;
  plants: PlantResult[];
  portfolio: {
    monthly: MonthlyAggregate[];
    yearly: YearlyAggregate;
  };
  comparison?: PlantComparisonResult;
  netting?: NettingResult;
  /** Başlık altındaki sade özet */
  summary?: { plantCount: number; capacityMw: number; companies: string[]; source: string };
  /** Şirket bazında uzlaştırma, KÜPST ve YEKDEM varsayımları (Dengesizlik Karnesi ile aynı motor) */
  sapma?: SapmaSummary | null;
}

export default function ProjectResultsPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState<string>("all");

  // Pivot Tablo Sıralama State'i
  const [sortField, setSortField] = useState<string>("yearMonth");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/results`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Proje bulunamadı.");
        }
        throw new Error("Veriler yüklenirken bir sunucu hatası oluştu.");
      }
      const json: ApiResponse = await res.json();
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

  // Seçili Santral / Portföy KPI Hesaplaması
  const currentKPI = useMemo(() => {
    if (!data) return null;

    if (selectedPlantId === "all") {
      return {
        name: "Tüm Portföy",
        type: "PORTFOLIO",
        ...data.portfolio.yearly,
      };
    }

    const plant = data.plants.find((p) => p.plantId === selectedPlantId);
    if (!plant) return null;

    return {
      name: plant.plantName,
      type: plant.plantType,
      ...plant.yearly,
    };
  }, [data, selectedPlantId]);

  // Grafik 1: Aylık Toplam Gelir vs Dengesizlik Maliyeti
  const monthlyRevenueChartData = useMemo(() => {
    if (!data) return [];

    const months = Array.from(
      new Set(
        selectedPlantId === "all"
          ? data.portfolio.monthly.map((m) => m.yearMonth)
          : (data.plants.find((p) => p.plantId === selectedPlantId)?.monthly || []).map(
              (m) => m.yearMonth
            )
      )
    ).sort();

    return months.map((ym) => {
      if (selectedPlantId === "all") {
        const item = data.portfolio.monthly.find((m) => m.yearMonth === ym);
        return {
          month: ym,
          "Toplam Gelir": item?.totalRevenue || 0,
          "Dengesizlik Maliyeti": item?.totalImbalanceCost || 0,
        };
      }

      const plant = data.plants.find((p) => p.plantId === selectedPlantId);
      const item = plant?.monthly.find((m) => m.yearMonth === ym);
      return {
        month: ym,
        "Toplam Gelir": item?.totalRevenue || 0,
        "Dengesizlik Maliyeti": item?.totalImbalanceCost || 0,
      };
    });
  }, [data, selectedPlantId]);

  // Grafik 2: Aylık Birim Dengesizlik Maliyeti Trendi (Tüm santraller kıyaslamalı)
  const unitCostTrendChartData = useMemo(() => {
    if (!data) return [];

    const allMonths = Array.from(
      new Set(data.portfolio.monthly.map((m) => m.yearMonth))
    ).sort();

    return allMonths.map((ym) => {
      const row: Record<string, string | number> = { month: ym };

      // Her santral için birim maliyet
      data.plants.forEach((plant) => {
        const m = plant.monthly.find((item) => item.yearMonth === ym);
        row[plant.plantName] = m?.unitImbalanceCost || 0;
      });

      // Portföy ağırlıklı ortalama birim maliyet
      const portItem = data.portfolio.monthly.find((item) => item.yearMonth === ym);
      row["Portföy Ağırlıklı Ort."] = portItem?.unitImbalanceCost || 0;

      return row;
    });
  }, [data]);

  // Grafik 3: Saatlik Dengesizlik Dağılımı (00:00 - 23:00 saatlik sapma yoğunluğu)
  const hourlyDistributionChartData = useMemo(() => {
    if (!data) return [];

    const hourlyRecords =
      selectedPlantId === "all"
        ? data.plants.flatMap((p) => p.hourly)
        : data.plants.find((p) => p.plantId === selectedPlantId)?.hourly || [];

    // 00 - 23 saatlik kovalara ayır
    const hours = Array.from({ length: 24 }, (_, i) => {
      const hStr = i < 10 ? `0${i}:00` : `${i}:00`;
      return {
        hour: hStr,
        pozitifMwh: 0,
        negatifMwh: 0,
        netMwh: 0,
        count: 0,
      };
    });

    hourlyRecords.forEach((rec) => {
      const date = new Date(rec.timestamp);
      const h = date.getUTCHours();
      if (hours[h]) {
        if (rec.imbalanceMwh > 0) {
          hours[h].pozitifMwh += rec.imbalanceMwh;
        } else if (rec.imbalanceMwh < 0) {
          hours[h].negatifMwh += Math.abs(rec.imbalanceMwh);
        }
        hours[h].netMwh += rec.imbalanceMwh;
        hours[h].count += 1;
      }
    });

    return hours.map((h) => ({
      hour: h.hour,
      "Pozitif Dengesizlik (Fazla)": Number(h.pozitifMwh.toFixed(2)),
      "Negatif Dengesizlik (Eksik)": Number(h.negatifMwh.toFixed(2)),
      "Net Dengesizlik": Number(h.netMwh.toFixed(2)),
    }));
  }, [data, selectedPlantId]);

  // Pivot Tablo Satırları (Ay x Santral)
  const pivotRows = useMemo(() => {
    if (!data) return [];

    const rows: Array<{
      plantId: string;
      plantName: string;
      plantType: string;
      yearMonth: string;
      totalActualMwh: number;
      totalDayAheadSalesAmount: number;
      totalImbalanceAmount: number;
      totalRevenue: number;
      unitRevenue: number;
      totalImbalanceCost: number;
      unitImbalanceCost: number;
    }> = [];

    const targetPlants =
      selectedPlantId === "all"
        ? data.plants
        : data.plants.filter((p) => p.plantId === selectedPlantId);

    targetPlants.forEach((plant) => {
      plant.monthly.forEach((m) => {
        rows.push({
          plantId: plant.plantId,
          plantName: plant.plantName,
          plantType: plant.plantType,
          yearMonth: m.yearMonth,
          totalActualMwh: m.totalActualMwh,
          totalDayAheadSalesAmount: m.totalDayAheadSalesAmount,
          totalImbalanceAmount: m.totalImbalanceAmount,
          totalRevenue: m.totalRevenue,
          unitRevenue: m.unitRevenue,
          totalImbalanceCost: m.totalImbalanceCost,
          unitImbalanceCost: m.unitImbalanceCost,
        });
      });
    });

    // Sıralama
    return rows.sort((a, b) => {
      let valA = a[sortField as keyof typeof a];
      let valB = b[sortField as keyof typeof b];

      if (typeof valA === "string" && typeof valB === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortDirection === "asc" ? valA - valB : valB - valA;
    });
  }, [data, selectedPlantId, sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // CSV Dışa Aktarma Fonksiyonu (UTF-8 BOM ile Excel uyumlu)
  const exportToCsv = () => {
    if (!pivotRows.length) return;

    const headers = [
      "Santral",
      "Tür",
      "Ay",
      "Toplam Üretim (MWh)",
      "GÖP Satış Tutarı (TL)",
      "Dengesizlik Tutarı (TL)",
      "Toplam Gelir (TL)",
      "Birim Gelir (TL/MWh)",
      "Dengesizlik Maliyeti (TL)",
      "Birim Dengesizlik Maliyeti (TL/MWh)",
    ];

    const csvLines = [headers.join(";")];

    pivotRows.forEach((row) => {
      const line = [
        `"${row.plantName}"`,
        `"${row.plantType}"`,
        `"${row.yearMonth}"`,
        row.totalActualMwh.toFixed(2).replace(".", ","),
        row.totalDayAheadSalesAmount.toFixed(2).replace(".", ","),
        row.totalImbalanceAmount.toFixed(2).replace(".", ","),
        row.totalRevenue.toFixed(2).replace(".", ","),
        row.unitRevenue.toFixed(2).replace(".", ","),
        row.totalImbalanceCost.toFixed(2).replace(".", ","),
        row.unitImbalanceCost.toFixed(2).replace(".", ","),
      ];
      csvLines.push(line.join(";"));
    });

    const bom = "\uFEFF";
    const blob = new Blob([bom + csvLines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TR-Energy-Sonuclar-${projectId}-${selectedPlantId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 1. Loading State
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
          <h2 className="text-xl font-semibold text-slate-800">
            Piyasa ve Dengesizlik Sonuçları Hesaplanıyor...
          </h2>
          <p className="max-w-sm text-sm text-slate-500">
            Saatlik üretim ve EPİAŞ verileri çekilip aylık/yıllık ağırlıklı metrikler
            çıkarılıyor.
          </p>
        </div>
      </div>
    );
  }

  // 2. Error / Empty State
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-md border-rose-200">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg text-slate-900">Sonuçlar Yüklenemedi</CardTitle>
            <CardDescription className="text-slate-600">
              {error || "Bu projeye ait kayıt bulunamadı."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={fetchData} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Tekrar Dene
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Ana Sayfaya Dön</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Renk paleti
  const plantColors: Record<string, string> = {
    "Karaburun RES": "#0284c7",
    "Toroslar GES": "#f59e0b",
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* Header & Back Nav */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-900"
              >
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-medium text-slate-700">Sonuç Raporu</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {data.project.name}
            </h1>
            {/* Açıklama özet satırındaki şirket adıyla aynıysa tekrar gösterilmez */}
            {data.project.description &&
              !data.summary?.companies.some(
                (c) => c.toLocaleLowerCase("tr-TR") === data.project.description!.trim().toLocaleLowerCase("tr-TR")
              ) && <p className="mt-1 max-w-2xl text-xs text-slate-600 sm:text-sm">{data.project.description}</p>}
            {data.summary && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                {data.summary.companies.length > 0 && (
                  <span className="font-medium text-slate-700">
                    {data.summary.companies.length === 1 ? data.summary.companies[0] : `${data.summary.companies.length} şirket`}
                  </span>
                )}
                <span>{data.summary.plantCount} santral</span>
                <span>·</span>
                <span>{data.summary.capacityMw.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} MW</span>
                <span>·</span>
                <span>Veri: {data.summary.source}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              asChild
              className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Link href={`/projects/${projectId}/insights`}>
                <Lightbulb className="h-3.5 w-3.5" />
                Stratejik İçgörüler
              </Link>
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
            <Button asChild size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
              <Link href={`/projects/${projectId}/import`}>
                <UploadCloud className="h-4 w-4" />
                Üretim Verisi Yükle
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`/projects/${projectId}/dsg`}>
                <Network className="h-3.5 w-3.5" />
                DSG Senaryoları
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`/projects/${projectId}/backtest`}>
                <FlaskConical className="h-3.5 w-3.5" />
                Geriye Dönük Test
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`/projects/${projectId}/plants`}>
                <Factory className="h-3.5 w-3.5" />
                Santraller
              </Link>
            </Button>
            <EpiasSyncDialog
              projectId={projectId}
              onSyncSuccess={() => fetchData()}
            />
            <MarketDataUploadDialog
              projectId={projectId}
              onUploadSuccess={() => fetchData()}
            />
            <PricingProfileDialog
              projectId={projectId}
              initialProfile={data.pricingProfile}
              onProfileUpdated={() => fetchData()}
            />
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </Button>
            <Button
              size="sm"
              onClick={exportToCsv}
              variant="outline"
              className="gap-1.5 text-slate-600 hover:bg-slate-100"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 pt-8 sm:px-6 lg:px-8">
        <DataQualityBanner projectId={projectId} refreshKey={data} />

        <MarketDataStatus projectId={projectId} refreshKey={data} onSyncSuccess={() => fetchData()} />

        {/* Aktif Piyasa Profili Rozeti */}
        {data.pricingProfile && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/70 px-4 py-2.5 text-xs text-slate-700 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-900">
                Piyasa Profili: {data.pricingProfile.name}
              </span>
              <span className="hidden sm:inline text-slate-300">|</span>
              {data.pricingProfile.mode !== "CUSTOM" ? (
                <span className="text-slate-600">
                  Mevzuat: her saat kendi tarihinin kuralıyla · 2026 öncesi sabit %3 · 2026&apos;dan itibaren sistemle aynı
                  yönde %6, ters yönde %3
                </span>
              ) : (
              <>
              <span className="text-slate-600">
                Pozitif Dengesizlik (SURPLUS / Diğer):{" "}
                <strong className="text-emerald-700 font-mono">{data.pricingProfile.positiveSurplusCoef}</strong> /{" "}
                <strong className="text-emerald-700 font-mono">{data.pricingProfile.positiveOtherCoef}</strong>
              </span>
              <span className="hidden sm:inline text-slate-300">•</span>
              <span className="text-slate-600">
                Negatif Dengesizlik (DEFICIT / Diğer):{" "}
                <strong className="text-rose-700 font-mono">{data.pricingProfile.negativeDeficitCoef}</strong> /{" "}
                <strong className="text-rose-700 font-mono">{data.pricingProfile.negativeOtherCoef}</strong>
              </span>
              </>
              )}
            </div>
            <PricingProfileDialog
              projectId={projectId}
              initialProfile={data.pricingProfile}
              onProfileUpdated={() => fetchData()}
              trigger={
                <button
                  type="button"
                  className="font-medium text-indigo-600 hover:text-indigo-800 underline underline-offset-2 text-xs"
                >
                  Katsayıları Değiştir
                </button>
              }
            />
          </div>
        )}

        {/* Santral Filtre Seçici */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Görünüm:
            </span>
            <Button
              variant={selectedPlantId === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedPlantId("all")}
              className="h-8 gap-1.5 text-xs"
            >
              <Layers className="h-3.5 w-3.5" />
              Tüm Portföy ({data.plants.length} Santral)
            </Button>

            {data.plants.map((plant) => (
              <Button
                key={plant.plantId}
                variant={selectedPlantId === plant.plantId ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedPlantId(plant.plantId)}
                className="h-8 gap-1.5 text-xs"
              >
                {plant.plantType === "RES" && (
                  <Wind className="h-3.5 w-3.5 text-cyan-600" />
                )}
                {plant.plantType === "GES" && (
                  <Sun className="h-3.5 w-3.5 text-amber-500" />
                )}
                {plant.plantType === "HES" && (
                  <Zap className="h-3.5 w-3.5 text-blue-600" />
                )}
                {plant.plantName} ({plant.capacityMw} MW)
              </Button>
            ))}
          </div>

          <div className="text-xs text-slate-500">
            Aktif Filtre:{" "}
            <strong className="text-slate-800">
              {selectedPlantId === "all"
                ? "Konsolide Portföy"
                : data.plants.find((p) => p.plantId === selectedPlantId)?.plantName}
            </strong>
          </div>
        </div>

        {/* 1. Üst KPI Kartları */}
        {currentKPI && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Toplam Üretim */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Toplam Üretim
                </CardTitle>
                <Activity className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {currentKPI.totalActualMwh.toLocaleString("tr-TR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span className="text-sm font-normal text-slate-500">MWh</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {currentKPI.name} gerçekleşen üretim hacmi
                </p>
              </CardContent>
            </Card>

            {/* Toplam Gelir */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {(data.sapma?.yekdem?.plantNames.length ?? 0) > 0 ? "Piyasa değeri (PTF)" : "Toplam Gelir"}
                </CardTitle>
                <ArrowDownRight className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {currentKPI.totalRevenue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}{" "}
                  <span className="text-sm font-normal text-slate-500">₺</span>
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
                  Birim Gelir:{" "}
                  {currentKPI.unitRevenue.toLocaleString("tr-TR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  ₺/MWh
                </p>
                {(data.sapma?.yekdem?.plantNames.length ?? 0) > 0 && (
                  <p className="mt-1 text-2xs text-slate-500">
                    YEKDEM santrallerinin fiili geliri YEKDEM fiyatındandır; burada üretimin PTF değeri gösterilir.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Toplam Dengesizlik Maliyeti */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Dengesizlik Maliyeti
                </CardTitle>
                <Flame className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-600">
                  {currentKPI.totalImbalanceCost.toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span className="text-sm font-normal text-slate-500">₺</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedPlantId === "all"
                    ? data?.sapma && data.sapma.settlement.sameCompanyNettingTl > 0
                      ? `Şirket bazında uzlaştırma (santral bazında ${Math.round(
                          data.sapma.settlement.plantLevelCostTl
                        ).toLocaleString("tr-TR")} ₺)`
                      : "Şirket bazında uzlaştırma"
                    : "Santral tek başına uzlaştırılsaydı"}
                </p>
              </CardContent>
            </Card>

            {/* Ağırlıklı Birim Dengesizlik Maliyeti */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Birim Dengesizlik Maliyeti
                </CardTitle>
                <TrendingDown className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {currentKPI.unitImbalanceCost.toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span className="text-sm font-normal text-slate-500">₺/MWh</span>
                </div>
                <p className="mt-1 text-xs font-medium text-amber-700">
                  Üretim ağırlıklı ortalama (∑Maliyet / ∑MWh)
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Sapma yükü: şirket bazında dengesizlik + KÜPST, 2026 ve YEKDEM varsayımları */}
        {data.sapma && <SapmaYukuCard sapma={data.sapma} projectId={projectId} onRefresh={fetchData} />}

        {/* 2. Recharts Görsel Analitik Grafikleri */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Grafik 1: Aylık Gelir vs Dengesizlik Maliyeti */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Aylık Toplam Gelir ve Dengesizlik Maliyeti
              </CardTitle>
              <CardDescription>
                Aylar bazında GÖP + dengesizlik gerçekleşen toplam geliri ile dengesizlik
                maliyetinin karşılaştırılması.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyRevenueChartData}
                    margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e2e8f0"
                    />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748b" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="#64748b"
                      tickFormatter={(val) => `${(val / 1000).toFixed(0)}k ₺`}
                    />
                    <Tooltip
                      formatter={(val: any) =>
                        `${Number(val || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`
                      }
                    />
                    <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                    <Bar
                      isAnimationActive={false}
                      dataKey="Toplam Gelir"
                      fill="#0284c7"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="Dengesizlik Maliyeti"
                      fill="#f43f5e"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Grafik 2: Aylık Birim Dengesizlik Maliyeti Trendi (Tüm Santraller) */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Aylık Birim Dengesizlik Maliyeti Trendi (₺/MWh)
              </CardTitle>
              <CardDescription>
                Farklı santrallerin MWh başına oluşan dengesizlik maliyeti performansının
                zaman içindeki kıyaslaması.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={unitCostTrendChartData}
                    margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e2e8f0"
                    />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748b" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="#64748b"
                      tickFormatter={(val) => `${val.toFixed(0)} ₺`}
                    />
                    <Tooltip
                      formatter={(val: any) =>
                        `${Number(val || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺/MWh`
                      }
                    />
                    <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                    {data.plants.map((plant) => (
                      <Line
                        key={plant.plantId}
                        isAnimationActive={false}
                        type="monotone"
                        dataKey={plant.plantName}
                        stroke={plantColors[plant.plantName] || "#6366f1"}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                    <Line
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="Portföy Ağırlıklı Ort."
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Grafik 3: Saatlik Dengesizlik Dağılımı */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Saatlik Dengesizlik Dağılımı (Günün Saatlerine Göre Sapma MWh)
            </CardTitle>
            <CardDescription>
              Günün hangi saatlerinde pozitif (fazla üretim) ve negatif (eksik üretim)
              sapmaların yoğunlaştığını gösteren profil.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={hourlyDistributionChartData}
                  margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#64748b"
                    tickFormatter={(val) => `${val} MWh`}
                  />
                  <Tooltip
                    formatter={(val: any) =>
                      `${Number(val || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} MWh`
                    }
                  />
                  <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                  <Bar
                    isAnimationActive={false}
                    dataKey="Pozitif Dengesizlik (Fazla)"
                    fill="#10b981"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="Negatif Dengesizlik (Eksik)"
                    fill="#ef4444"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Santral ve Teknoloji Karşılaştırması (Capture Price) */}
        {data.comparison && (
          <PlantComparisonCard comparison={data.comparison} yekdemPlants={data.sapma?.yekdem?.plantNames ?? []} />
        )}

        {/* Düşük ve sıfır fiyatlı saat maruziyeti */}
        {data.comparison && (
          <LowPriceExposureCard comparison={data.comparison} yekdemPlants={data.sapma?.yekdem?.plantNames ?? []} />
        )}

        {/* DSG Netleştirme Analizi */}
        {data.netting && (
          <NettingCard
            netting={data.netting}
            projectId={projectId}
            companies={data.sapma?.settlement.companies}
            crossCompanyBenefitTl={data.sapma?.dsg?.benefitTl ?? null}
            aggregatorName={data.sapma?.aggregator?.name ?? null}
          />
        )}

        {/* Fiyattan Bağımsız Tahmin Doğruluğu */}
        <ForecastAccuracyCard projectId={projectId} refreshKey={data} />

        {/* 3. Detaylı Pivot Tablo (Ay x Santral, Sıralanabilir, CSV Export) */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                Detaylı Pivot Tablo (Ay x Santral)
              </CardTitle>
              <CardDescription>
                Her santralin ay bazındaki üretim, GÖP geliri, dengesizlik tutarı ve birim
                maliyetleri.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={exportToCsv}
              className="h-8 gap-2 self-start text-xs sm:self-auto"
            >
              <Download className="h-3.5 w-3.5" />
              CSV Dışa Aktar
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead
                      className="cursor-pointer hover:text-slate-900"
                      onClick={() => handleSort("plantName")}
                    >
                      <div className="flex items-center gap-1">
                        Santral <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead>Tür</TableHead>
                    <TableHead
                      className="cursor-pointer hover:text-slate-900"
                      onClick={() => handleSort("yearMonth")}
                    >
                      <div className="flex items-center gap-1">
                        Dönem <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right hover:text-slate-900"
                      onClick={() => handleSort("totalActualMwh")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Üretim (MWh) <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">GÖP Tutarı (₺)</TableHead>
                    <TableHead className="text-right">Dengesizlik Tutarı (₺)</TableHead>
                    <TableHead
                      className="cursor-pointer text-right hover:text-slate-900"
                      onClick={() => handleSort("totalRevenue")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Toplam Gelir (₺) <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Birim Gelir (₺/MWh)</TableHead>
                    <TableHead
                      className="cursor-pointer text-right hover:text-slate-900"
                      onClick={() => handleSort("totalImbalanceCost")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Dengesizlik Maliyeti (₺) <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right hover:text-slate-900"
                      onClick={() => handleSort("unitImbalanceCost")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Birim Maliyet (₺/MWh) <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pivotRows.map((row, idx) => (
                    <TableRow key={`${row.plantId}-${row.yearMonth}-${idx}`}>
                      <TableCell className="font-semibold text-slate-900">
                        {row.plantName}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.plantType === "RES"
                              ? "bg-cyan-100 text-cyan-800"
                              : row.plantType === "GES"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {row.plantType === "RES" && <Wind className="h-3 w-3" />}
                          {row.plantType === "GES" && <Sun className="h-3 w-3" />}
                          {row.plantType === "HES" && <Zap className="h-3 w-3" />}
                          {row.plantType}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-slate-700">
                        {row.yearMonth}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {row.totalActualMwh.toLocaleString("tr-TR", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-600">
                        {row.totalDayAheadSalesAmount.toLocaleString("tr-TR", {
                          maximumFractionDigits: 0,
                        })}{" "}
                        ₺
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-medium ${
                          row.totalImbalanceAmount > 0
                            ? "text-emerald-600"
                            : row.totalImbalanceAmount < 0
                              ? "text-rose-600"
                              : "text-slate-500"
                        }`}
                      >
                        {row.totalImbalanceAmount > 0 ? "+" : ""}
                        {row.totalImbalanceAmount.toLocaleString("tr-TR", {
                          maximumFractionDigits: 0,
                        })}{" "}
                        ₺
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">
                        {row.totalRevenue.toLocaleString("tr-TR", {
                          maximumFractionDigits: 0,
                        })}{" "}
                        ₺
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-700">
                        {row.unitRevenue.toLocaleString("tr-TR", {
                          maximumFractionDigits: 2,
                        })}{" "}
                        ₺
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-rose-600">
                        {row.totalImbalanceCost.toLocaleString("tr-TR", {
                          maximumFractionDigits: 0,
                        })}{" "}
                        ₺
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-amber-700">
                        {row.unitImbalanceCost.toLocaleString("tr-TR", {
                          maximumFractionDigits: 2,
                        })}{" "}
                        ₺
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
