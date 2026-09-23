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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
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
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileSpreadsheet,
  Flame,
  Gauge,
  Layers,
  Lightbulb,
  Percent,
  Presentation,
  RefreshCw,
  Scale,
  Sparkles,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  Wind,
  Zap,
} from "lucide-react";
import {
  ForecastBiasResult,
  PeriodEfficiency,
  PotentialUpliftResult,
} from "@/lib/analysis/planning-efficiency";
import {
  ArbitrageOverview,
  ArbitrageAggregate,
  TopArbitrageHour,
  HourlyProfilePoint,
} from "@/lib/analysis/intraday-arbitrage";
import { SystemDirection } from "@/lib/calculations/types";
import { EpiasSyncDialog } from "@/components/epias-sync-dialog";
import { DataQualityBanner } from "@/components/data-quality-banner";
import { MarketDataUploadDialog } from "@/components/market-data-upload-dialog";

const MONTH_NAMES_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

interface HeatmapCell {
  dayOfWeekIndex: number;
  dayName: string;
  hour: number;
  hourStr: string;
  efficiencyRatio: number;
  totalActualMwh: number;
  totalForecastMwh: number;
  totalLossTl: number;
  count: number;
}

interface HourlyDetailItem {
  hour: string;
  timestamp: string;
  actualMwh: number;
  forecastMwh: number;
  ptf: number;
  smf: number;
  gipPrice?: number | null;
  systemDirection: SystemDirection;
  imbalanceMwh: number;
  imbalanceCost: number;
  totalRevenue: number;
  fictiveRevenue: number;
}

interface WorstDayItem extends PeriodEfficiency {
  hourlyDetail: HourlyDetailItem[];
}

interface MonthlyEfficiencyItem {
  yearMonth: string;
  monthName: string;
  totalRevenue: number;
  fictiveRevenue: number;
  lossTl: number;
  efficiencyRatio: number;
  efficiencyPercent: number;
  totalActualMwh: number;
  totalForecastMwh: number;
}

interface SummaryData {
  totalActualMwh: number;
  totalForecastMwh: number;
  totalRevenue: number;
  fictiveRevenue: number;
  lossTl: number;
  efficiencyRatio: number;
  efficiencyPercent: number;
}

interface PlantPlanningData {
  plantId: string;
  plantName: string;
  plantType: string;
  capacityMw: number;
  summary: SummaryData;
  bias: ForecastBiasResult;
  uplift: PotentialUpliftResult;
  monthlyEfficiency: MonthlyEfficiencyItem[];
  worst10Days: WorstDayItem[];
  heatmap: HeatmapCell[];
  arbitrage: ArbitrageOverview;
}

interface PlanningApiResponse {
  success: boolean;
  project: {
    id: string;
    name: string;
    description?: string;
  };
  pricingProfile: {
    positiveSurplusCoef: number;
    positiveOtherCoef: number;
    negativeDeficitCoef: number;
    negativeOtherCoef: number;
  };
  portfolio: {
    summary: SummaryData;
    bias: ForecastBiasResult;
    uplift: PotentialUpliftResult;
    monthlyEfficiency: MonthlyEfficiencyItem[];
    worst10Days: WorstDayItem[];
    heatmap: HeatmapCell[];
    arbitrage: ArbitrageOverview;
  };
  plants: PlantPlanningData[];
}

/** İşaretli TL gösterimi: "+1.234", "−1.234" (tipografik eksi) */
function formatSignedTl(value: number): string {
  const abs = Math.abs(value).toLocaleString("tr-TR");
  return value > 0 ? `+${abs}` : value < 0 ? `−${abs}` : abs;
}

/** İşaretli yüzde gösterimi: "+%1,2", "−%4,6" */
function formatSignedPercent(value: number): string {
  const abs = Math.abs(value).toLocaleString("tr-TR");
  return value > 0 ? `+%${abs}` : value < 0 ? `−%${abs}` : `%${abs}`;
}

export default function PlanningEfficiencyPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [data, setData] = useState<PlanningApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScope, setSelectedScope] = useState<string>("portfolio");
  const [activeSectionTab, setActiveSectionTab] = useState<"efficiency" | "arbitrage">("efficiency");
  const [divergenceMode, setDivergenceMode] = useState<"hourly" | "monthly">("hourly");

  // 24s Drill-Down Modal State
  const [selectedDayDetail, setSelectedDayDetail] = useState<WorstDayItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Isı Haritası Hover Tooltip State
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/planning`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.error || "Planlama verimliliği verileri alınırken bir hata oluştu."
        );
      }
      setData(json);

      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get("tab");
        if (tabParam === "arbitrage" || tabParam === "efficiency") {
          setActiveSectionTab(tabParam as "arbitrage" | "efficiency");
        }
        const plantParam = urlParams.get("plant");
        if (plantParam) {
          setSelectedScope(plantParam);
        }
        const autoOpen = urlParams.get("drilldown");
        if (autoOpen && json.portfolio?.worst10Days?.length > 0) {
          const target =
            json.portfolio.worst10Days.find(
              (d: WorstDayItem) => d.period === autoOpen
            ) || json.portfolio.worst10Days[0];
          setSelectedDayDetail(target);
          setIsDetailOpen(true);
        }
      }
    } catch (err) {
      console.error("Fetch planning data error:", err);
      setError(
        err instanceof Error ? err.message : "Beklenmedik bir hata oluştu."
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aktif Kapsam Verileri (Tüm Portföy veya Seçili Santral)
  const currentView = useMemo(() => {
    if (!data) return null;
    if (selectedScope === "portfolio") {
      return {
        name: "Tüm Portföy",
        type: "PORTFOLIO",
        summary: data.portfolio.summary,
        bias: data.portfolio.bias,
        uplift: data.portfolio.uplift,
        monthlyEfficiency: data.portfolio.monthlyEfficiency,
        worst10Days: data.portfolio.worst10Days,
        heatmap: data.portfolio.heatmap,
        arbitrage: data.portfolio.arbitrage,
      };
    }
    const plant = data.plants.find((p) => p.plantId === selectedScope);
    if (!plant) {
      return {
        name: "Tüm Portföy",
        type: "PORTFOLIO",
        summary: data.portfolio.summary,
        bias: data.portfolio.bias,
        uplift: data.portfolio.uplift,
        monthlyEfficiency: data.portfolio.monthlyEfficiency,
        worst10Days: data.portfolio.worst10Days,
        heatmap: data.portfolio.heatmap,
        arbitrage: data.portfolio.arbitrage,
      };
    }
    return {
      name: plant.plantName,
      type: plant.plantType,
      summary: plant.summary,
      bias: plant.bias,
      uplift: plant.uplift,
      monthlyEfficiency: plant.monthlyEfficiency,
      worst10Days: plant.worst10Days,
      heatmap: plant.heatmap,
      arbitrage: plant.arbitrage,
    };
  }, [data, selectedScope]);

  // Aylık Verimlilik Grafiği Formatı
  const monthlyChartData = useMemo(() => {
    if (!currentView) return [];
    return currentView.monthlyEfficiency
      .filter((m) => m.totalActualMwh > 0)
      .map((m) => ({
      ay: m.monthName.substring(0, 3),
      tamAy: m.monthName,
      yearMonth: m.yearMonth,
      verimlilik: m.efficiencyPercent,
      fiiliGelir: m.totalRevenue,
      fiktifGelir: m.fictiveRevenue,
      kayipTl: m.lossTl,
      uretimMwh: m.totalActualMwh,
    }));
  }, [currentView]);

  // Kalibrasyon senaryosunun sonucu: yanlılık yok / düzeltme kazandırır / düzeltme zarar verir
  const upliftOutcome: "neutral" | "gain" | "loss" = !currentView
    ? "neutral"
    : currentView.bias.direction === "NEUTRAL" || currentView.uplift.totalUpliftTl === 0
      ? "neutral"
      : currentView.uplift.totalUpliftTl > 0
        ? "gain"
        : "loss";

  // "Ne Olurdu?" Bar Chart Verileri
  const whatIfChartData = useMemo(() => {
    if (!currentView) return [];
    const actualRev = currentView.summary.totalRevenue;
    const simulatedRev =
      currentView.uplift.simulatedTotalRevenue ||
      actualRev + currentView.uplift.totalUpliftTl;
    const actualLoss = currentView.summary.lossTl;
    const simulatedLoss = actualLoss - currentView.uplift.costReductionTl;

    return [
      {
        kategori: "Yıllık Toplam Gelir",
        "Fiili Durum": actualRev,
        "Yanlılık Giderilmiş (Simüle)": simulatedRev,
      },
      {
        kategori: "Dengesizlik Maliyeti / Kayıp",
        "Fiili Durum": actualLoss,
        "Yanlılık Giderilmiş (Simüle)": simulatedLoss,
      },
    ];
  }, [currentView]);

  // GİP Aylık Kaçırılan Fırsat ve Doğru Kararlar Grafiği
  const monthlyArbitrageChartData = useMemo(() => {
    if (!currentView?.arbitrage?.monthlyAggregates) return [];
    return currentView.arbitrage.monthlyAggregates.map((m) => {
      const monthNum = parseInt(m.period.split("-")[1], 10);
      const monthName = MONTH_NAMES_TR[monthNum - 1] || m.period;
      return {
        period: m.period,
        ay: monthName.substring(0, 3),
        tamAy: monthName,
        kacirilanFirsatTl: m.missedOpportunityTl,
        dogruKararlarTl: m.correctDecisionsTl,
        gipOrt: m.avgGipPrice,
        dengesizlikOrt: m.avgImbalancePrice,
        kapananSaat: m.positiveHoursCount,
      };
    });
  }, [currentView]);

  // Dengesizlik Fiyatı vs GİP Fiyatı Zaman Serisi Verileri
  const priceDivergenceChartData = useMemo(() => {
    if (!currentView?.arbitrage) return [];
    if (divergenceMode === "monthly") {
      return currentView.arbitrage.monthlyAggregates.map((m) => {
        const monthNum = parseInt(m.period.split("-")[1], 10);
        const monthName = MONTH_NAMES_TR[monthNum - 1] || m.period;
        return {
          etiket: monthName.substring(0, 3),
          tamEtiket: monthName,
          gipFiyat: m.avgGipPrice,
          dengesizlikFiyat: m.avgImbalancePrice,
          fark: Number((m.avgGipPrice - m.avgImbalancePrice).toFixed(2)),
        };
      });
    }
    // divergenceMode === "hourly" (24-Saatlik Gün İçi Ortalama Profil)
    return (currentView.arbitrage.hourlyProfile24 || []).map((h) => ({
      etiket: h.hourStr,
      tamEtiket: `Saat ${h.hourStr}`,
      gipFiyat: h.avgGipPrice,
      dengesizlikFiyat: h.avgImbalancePrice,
      ptfFiyat: h.avgPtfPrice,
      smfFiyat: h.avgSmfPrice,
      fark: Number((h.avgGipPrice - h.avgImbalancePrice).toFixed(2)),
      firsatTl: h.totalOpportunityTl,
    }));
  }, [currentView, divergenceMode]);

  // Gün x Saat Isı Haritası Matrisi Düzeni (7 gün x 24 saat)
  const heatmapRows = useMemo(() => {
    if (!currentView) return [];
    const days = [
      "Pazartesi",
      "Salı",
      "Çarşamba",
      "Perşembe",
      "Cuma",
      "Cumartesi",
      "Pazar",
    ];

    return days.map((dayName, dayIndex) => {
      const cells = currentView.heatmap.filter(
        (c) => c.dayOfWeekIndex === dayIndex
      );
      // Saat 0'dan 23'e sıralı
      cells.sort((a, b) => a.hour - b.hour);
      return {
        dayName,
        dayIndex,
        cells,
      };
    });
  }, [currentView]);

  // Isı Haritası Hücre Rengi Fonksiyonu
  const getCellColorClass = (ratio: number, count: number) => {
    if (count === 0) return "bg-slate-100 text-slate-300";
    if (ratio >= 0.985) return "bg-emerald-600 text-white";
    if (ratio >= 0.96) return "bg-emerald-500 text-white";
    if (ratio >= 0.93) return "bg-lime-400 text-slate-900";
    if (ratio >= 0.9) return "bg-amber-400 text-slate-900";
    if (ratio >= 0.85) return "bg-orange-500 text-white";
    return "bg-rose-600 text-white";
  };

  // 1. Loading State
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
          <h2 className="text-xl font-semibold text-slate-800">
            Planlama Verimliliği & Simülasyon Hesaplanıyor...
          </h2>
          <p className="max-w-sm text-sm text-slate-500">
            Saatlik fiili ve fiktif gelirler kıyaslanıyor, sistematik yanlılıklar ve gün-saat
            ısı haritası çıkarılıyor.
          </p>
        </div>
      </div>
    );
  }

  // 2. Error State
  if (error || !data || !currentView) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-md border-rose-200">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg text-slate-900">Veriler Yüklenemedi</CardTitle>
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

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* Header & Sub-Nav */}
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
              <Link
                href={`/projects/${projectId}/results`}
                className="text-xs text-slate-500 transition-colors hover:text-slate-900"
              >
                Sonuç Raporu
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-medium text-slate-700">
                Planlama Verimliliği
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Planlama Verimliliği & Simülasyon
              </h1>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                Faz 7 Motoru
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              {data.project.name} • Fiili vs Fiktif gelir oranı, tahmin yanlılığı tespiti ve
              &quot;Ne Olurdu?&quot; gelir artışı simülasyonu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              asChild
              variant="outline"
              className="gap-1.5 border-slate-300 hover:bg-slate-100"
            >
              <Link href={`/projects/${projectId}/results`}>
                <FileSpreadsheet className="h-3.5 w-3.5 text-slate-600" />
                Sonuç Tablosu
              </Link>
            </Button>
            <Button
              size="sm"
              asChild
              variant="outline"
              className="gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              <Link href={`/projects/${projectId}/insights`}>
                <Lightbulb className="h-3.5 w-3.5 text-indigo-600" />
                Stratejik İçgörüler
              </Link>
            </Button>
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
                Excel İndir
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
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 pt-8 sm:px-6 lg:px-8">
        <DataQualityBanner projectId={projectId} refreshKey={data} />

        {/* Kapsam / Santral Seçici */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Analiz Kapsamı:
            </span>
            <Button
              variant={selectedScope === "portfolio" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedScope("portfolio")}
              className="h-8 gap-1.5 text-xs"
            >
              <Layers className="h-3.5 w-3.5" />
              Tüm Portföy ({data.plants.length} Santral)
            </Button>

            {data.plants.map((plant) => (
              <Button
                key={plant.plantId}
                variant={selectedScope === plant.plantId ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedScope(plant.plantId)}
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
                {plant.plantName}
              </Button>
            ))}
          </div>

          <div className="text-xs text-slate-500">
            Aktif Görünüm:{" "}
            <strong className="text-slate-800">{currentView.name}</strong>
          </div>
        </div>

        {/* TAB SWITCHER: Planlama Verimliliği vs GİP Arbitraj Analizi */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveSectionTab("efficiency")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all ${
                activeSectionTab === "efficiency"
                  ? "border-sky-600 bg-sky-50/60 text-sky-800 shadow-sm"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
              }`}
            >
              <Gauge className="h-4 w-4" />
              Planlama Verimliliği & Simülasyon
            </button>
            <button
              type="button"
              onClick={() => setActiveSectionTab("arbitrage")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all ${
                activeSectionTab === "arbitrage"
                  ? "border-amber-600 bg-amber-50/60 text-amber-900 shadow-sm"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
              }`}
            >
              <Zap className="h-4 w-4 text-amber-600" />
              GİP Arbitraj Analizi
              {currentView.arbitrage?.hasGipData ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  Aktif ({currentView.arbitrage.totalHoursWithGip.toLocaleString("tr-TR")} Saat)
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  GİP Verisi Yok
                </span>
              )}
            </button>
          </div>
        </div>

        {activeSectionTab === "efficiency" && (
          <>
            {/* 1. BÖLÜM: 4 ANA KPI KARTI */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* KPI 1: Planlama Verimlilik Oranı */}
          <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Planlama Verimliliği
              </CardTitle>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <Gauge className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  %{currentView.summary.efficiencyPercent.toFixed(1)}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                    currentView.summary.efficiencyPercent >= 98
                      ? "bg-emerald-100 text-emerald-800"
                      : currentView.summary.efficiencyPercent >= 95
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {currentView.summary.efficiencyPercent >= 98
                    ? "Mükemmele Yakın"
                    : currentView.summary.efficiencyPercent >= 95
                    ? "İyi Seviye"
                    : "Optimizasyon Gerekli"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Fiili Gelir / Fiktif (Mükemmel) Gelir oranı (1.0 = sıfır dengesizlik maliyeti).
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
                <span>Fiili Gelir:</span>
                <span className="font-mono font-medium text-slate-900">
                  {currentView.summary.totalRevenue.toLocaleString("tr-TR")} ₺
                </span>
              </div>
            </CardContent>
          </Card>

          {/* KPI 2: Toplam Dengesizlik Kaybı */}
          <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Dengesizlik Kaybı (TL)
              </CardTitle>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                <TrendingDown className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-rose-600 sm:text-3xl">
                {currentView.summary.lossTl.toLocaleString("tr-TR")}{" "}
                <span className="text-base font-medium">₺</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Tahmin sapmaları ve cezalı katsayılar nedeniyle kaybedilen potansiyel tutar.
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
                <span>Fiktif Tavan Gelir:</span>
                <span className="font-mono font-medium text-emerald-700">
                  {currentView.summary.fictiveRevenue.toLocaleString("tr-TR")} ₺
                </span>
              </div>
            </CardContent>
          </Card>

          {/* KPI 3: Tespit Edilen Tahmin Yanlılığı */}
          <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Tahmin Yanlılığı (Bias)
              </CardTitle>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  currentView.bias.direction === "OVER_FORECAST"
                    ? "bg-rose-100 text-rose-700"
                    : currentView.bias.direction === "UNDER_FORECAST"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                <Target className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div
                  className={`text-xl font-bold tracking-tight sm:text-2xl ${
                    currentView.bias.direction === "OVER_FORECAST"
                      ? "text-rose-600"
                      : currentView.bias.direction === "UNDER_FORECAST"
                      ? "text-amber-600"
                      : "text-slate-700"
                  }`}
                >
                  {currentView.bias.direction === "OVER_FORECAST"
                    ? `Aşırı Tahmin (+%${currentView.bias.avgBiasPercent})`
                    : currentView.bias.direction === "UNDER_FORECAST"
                    ? `Eksik Tahmin (%${currentView.bias.avgBiasPercent})`
                    : "Nötr / Dengeli Dağılım"}
                </div>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                {currentView.bias.explanation}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
                <span>Hata Tutarlılığı:</span>
                <span className="font-mono font-medium text-slate-900">
                  %{ (currentView.bias.consistency * 100).toFixed(0) } saatte
                </span>
              </div>
            </CardContent>
          </Card>

          {/* KPI 4: "Ne Olurdu?" Potansiyel Gelir Artışı */}
          <Card
            className={`border-slate-200 bg-gradient-to-br ${
              upliftOutcome === "loss" ? "from-rose-50/50" : "from-emerald-50/50"
            } to-white shadow-sm transition-shadow hover:shadow-md`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle
                className={`text-xs font-medium uppercase tracking-wider ${
                  upliftOutcome === "loss" ? "text-rose-800" : "text-emerald-800"
                }`}
              >
                {upliftOutcome === "loss" ? "Kalibrasyonun Gelir Etkisi" : "Potansiyel Gelir Artışı"}
              </CardTitle>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Sparkles className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold tracking-tight sm:text-3xl ${
                  upliftOutcome === "loss" ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {formatSignedTl(currentView.uplift.totalUpliftTl)}{" "}
                <span className="text-base font-medium">₺</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {upliftOutcome === "loss" ? (
                  <>
                    Toplam yanlılığı tek bir oranla düzeltmek bu dönemde geliri{" "}
                    <strong>{formatSignedPercent(currentView.uplift.upliftPercent)}</strong> değiştirirdi;
                    bu santral için önerilmez.
                  </>
                ) : (
                  <>
                    Sistematik yanlılık giderildiğinde beklenen net gelir değişimi (
                    <strong>{formatSignedPercent(currentView.uplift.upliftPercent)}</strong>).
                  </>
                )}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-xs text-slate-600">
                <span>{currentView.uplift.costReductionTl < 0 ? "Dengesizlik Maliyeti Artışı:" : "Dengesizlik Tasarrufu:"}</span>
                <span
                  className={`font-mono font-medium ${
                    currentView.uplift.costReductionTl < 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {Math.abs(currentView.uplift.costReductionTl).toLocaleString("tr-TR")} ₺
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 2. BÖLÜM: "NE OLURDU?" (WHAT-IF) SİMÜLASYON KARTI & DİNAMİK MESAJ */}
        <section className="space-y-4">
          <Card className="overflow-hidden border-indigo-100 shadow-sm">
            <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 p-6 text-white">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-200 border border-indigo-400/30">
                      Faz 7 Simülasyon Çıktısı
                    </span>
                    <h2 className="text-xl font-bold tracking-tight text-white">
                      &quot;Ne Olurdu?&quot; Tahmin Kalibrasyon Senaryosu
                    </h2>
                  </div>
                  <p className="max-w-2xl text-xs text-slate-300 sm:text-sm">
                    {upliftOutcome === "gain" ? (
                      <>
                        Eğer santralin sistematik tahmin yanlılığı ({currentView.bias.avgBiasPercent > 0 ? "+" : ""}
                        {currentView.bias.avgBiasPercent}%) giderilmiş olsaydı, yıllık geliriniz{" "}
                        <strong className="text-emerald-300">
                          {formatSignedPercent(currentView.uplift.upliftPercent)} (
                          {formatSignedTl(currentView.uplift.totalUpliftTl)} ₺)
                        </strong>{" "}
                        daha yüksek olacak ve dengesizlik maliyetiniz{" "}
                        <strong className="text-emerald-300">
                          {currentView.uplift.costReductionTl.toLocaleString("tr-TR")} ₺
                        </strong>{" "}
                        azalacaktı.
                      </>
                    ) : upliftOutcome === "loss" ? (
                      <>
                        {currentView.name} için toplam tahmin{" "}
                        {currentView.bias.avgBiasPercent > 0 ? "fazla" : "eksik"} görünüyor (
                        {currentView.bias.avgBiasPercent > 0 ? "+" : ""}
                        {currentView.bias.avgBiasPercent}%), ancak tahmini tek bir oranla ölçeklemek geliri{" "}
                        <strong className="text-rose-300">
                          {formatSignedTl(currentView.uplift.totalUpliftTl)} ₺
                        </strong>{" "}
                        değiştirirdi, yani dengesizlik maliyeti artardı. Hata saate ve mevsime göre yön
                        değiştiriyor; düzeltme tek katsayıyla değil saat/ay bazında yapılmalıdır.
                      </>
                    ) : (
                      <>
                        {currentView.name} için sistematik tek yönlü bir tahmin yanlılığı
                        tespit edilmemiştir (Nötr Dağılım). Tahmin sapmaları simetrik
                        olduğu için tek yönlü kalibrasyon yerine gün içi (GİP) pozisyon
                        güncellemeleri ve depolama optimizasyonu ile kalan{" "}
                        <strong className="text-amber-300">
                          {currentView.summary.lossTl.toLocaleString("tr-TR")} ₺
                        </strong>{" "}
                        dengesizlik maliyeti hedeflenmelidir.
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-lg bg-white/10 px-4 py-2.5 backdrop-blur-sm">
                    <div className="text-2xs uppercase tracking-wider text-slate-300">
                      Mevcut Fiili Gelir
                    </div>
                    <div className="text-base font-bold text-white">
                      {currentView.summary.totalRevenue.toLocaleString("tr-TR")} ₺
                    </div>
                  </div>
                  <div className="flex items-center text-slate-400">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <div className="rounded-lg bg-emerald-500/20 px-4 py-2.5 border border-emerald-400/30 backdrop-blur-sm">
                    <div className="text-2xs uppercase tracking-wider text-emerald-200">
                      Simüle Edilen Gelir
                    </div>
                    <div className="text-base font-bold text-emerald-300">
                      {(
                        currentView.uplift.simulatedTotalRevenue ||
                        currentView.summary.totalRevenue + currentView.uplift.totalUpliftTl
                      ).toLocaleString("tr-TR")}{" "}
                      ₺
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Yan Yana Kıyaslama Bar Chart */}
            <CardContent className="p-6">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Fiili Durum vs Simüle Edilmiş Durum Kıyaslaması
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sistematik hata giderildiğinde gelir ve dengesizlik maliyeti değişimi
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-slate-500" />
                    <span className="text-slate-600">Fiili Durum (Mevcut)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-emerald-500" />
                    <span className="text-slate-600">Yanlılık Düzeltilmiş (Simüle)</span>
                  </div>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={whatIfChartData}
                    margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="kategori"
                      stroke="#64748b"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M ₺`}
                    />
                    <Tooltip
                      formatter={(val: any) => [
                        `${Number(val || 0).toLocaleString("tr-TR")} ₺`,
                        "",
                      ]}
                      labelStyle={{ fontWeight: "bold", color: "#1e293b" }}
                      contentStyle={{
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        border: "1px solid #e2e8f0",
                      }}
                    />
                    <Bar
                      dataKey="Fiili Durum"
                      fill="#64748b"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={60}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="Yanlılık Giderilmiş (Simüle)"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={60}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 3. BÖLÜM: AYLIK VERİMLİLİK TRENDİ & GÜN x SAAT ISI HARİTASI */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Sol: Aylık Verimlilik Trendi */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Aylık Verimlilik Trendi (%)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Ay bazında fiili gelir / fiktif gelir oranı seyri
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-sky-600 font-semibold bg-sky-50 px-2.5 py-1 rounded-md">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Ortalama: %{currentView.summary.efficiencyPercent.toFixed(1)}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={monthlyChartData}
                    margin={{ top: 15, right: 15, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="ay"
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={[
                        (dataMin: number) => Math.max(0, Math.floor(dataMin - 2)),
                        100,
                      ]}
                      tickFormatter={(v) => `%${v}`}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => {
                        if (name === "verimlilik") return [`%${Number(val || 0).toFixed(2)}`, "Verimlilik Oranı"];
                        return [`${Number(val || 0).toLocaleString("tr-TR")} ₺`, name];
                      }}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload;
                        return item ? `${item.tamAy} (${item.yearMonth})` : label;
                      }}
                      contentStyle={{
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        border: "1px solid #e2e8f0",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="verimlilik"
                      name="verimlilik"
                      stroke="#0284c7"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#0284c7" }}
                      activeDot={{ r: 6, fill: "#0369a1" }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Alt Metrik Özeti */}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs">
                <div>
                  <span className="text-slate-400">En Yüksek Ay</span>
                  <div className="font-semibold text-slate-800">
                    {monthlyChartData.length > 0
                      ? [...monthlyChartData].sort((a, b) => b.verimlilik - a.verimlilik)[0]?.tamAy
                      : "-"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">En Düşük Ay</span>
                  <div className="font-semibold text-rose-600">
                    {monthlyChartData.length > 0
                      ? [...monthlyChartData].sort((a, b) => a.verimlilik - b.verimlilik)[0]?.tamAy
                      : "-"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Yıllık Kayıp</span>
                  <div className="font-semibold text-slate-800">
                    {currentView.summary.lossTl.toLocaleString("tr-TR")} ₺
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sağ: Gün x Saat Verimlilik Isı Haritası */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Gün × Saat Verimlilik Isı Haritası
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Haftanın günleri ve günün saatlerine göre verimlilik oranı yoğunluğu
                  </CardDescription>
                </div>
                <Clock className="h-4 w-4 text-slate-400" />
              </div>
            </CardHeader>
            <CardContent>
              {/* 24 Saat Başlıkları */}
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[500px]">
                  {/* Saat Numaraları */}
                  <div className="flex items-center text-2xs text-slate-400 mb-1">
                    <span className="w-16 shrink-0 text-slate-400">Gün / Saat</span>
                    <div className="grid grid-cols-24 flex-1 gap-0.5 text-center">
                      {Array.from({ length: 24 }, (_, i) => (
                        <div key={i} className="text-3xs truncate">
                          {i % 3 === 0 ? `${i}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 7 Günün Satırları */}
                  <div className="space-y-1">
                    {heatmapRows.map((row) => (
                      <div key={row.dayIndex} className="flex items-center gap-1.5">
                        <span className="w-16 shrink-0 text-2xs font-medium text-slate-600">
                          {row.dayName.substring(0, 3)}
                        </span>
                        <div className="grid grid-cols-24 flex-1 gap-0.5">
                          {row.cells.map((cell) => (
                            <button
                              key={cell.hour}
                              type="button"
                              onMouseEnter={() => setHoveredCell(cell)}
                              onMouseLeave={() => setHoveredCell(null)}
                              className={`h-6 rounded-xs transition-transform hover:scale-125 hover:z-10 focus:outline-none ${getCellColorClass(
                                cell.efficiencyRatio,
                                cell.count
                              )}`}
                              title={`${cell.dayName} ${cell.hourStr} — Verimlilik: %${(
                                cell.efficiencyRatio * 100
                              ).toFixed(1)}`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Hover Detay Kutusu */}
                  <div className="mt-3 min-h-[38px] rounded-md bg-slate-50 p-2 text-2xs text-slate-700 border border-slate-200 flex items-center justify-between">
                    {hoveredCell ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">
                            {hoveredCell.dayName} {hoveredCell.hourStr}
                          </span>
                          <span>•</span>
                          <span>
                            Verimlilik:{" "}
                            <strong className="text-slate-900">
                              %{(hoveredCell.efficiencyRatio * 100).toFixed(1)}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            Gerçekleşen:{" "}
                            <strong>{hoveredCell.totalActualMwh.toLocaleString("tr-TR")} MWh</strong>
                          </span>
                        </div>
                        <div className="font-semibold text-rose-600">
                          Kayıp: {hoveredCell.totalLossTl.toLocaleString("tr-TR")} ₺
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400 italic">
                        Detay görmek için fareyi ısı haritası kutucukları üzerine getirin.
                      </span>
                    )}
                  </div>

                  {/* Renk Lejantı */}
                  <div className="mt-3 flex flex-wrap items-center justify-between text-2xs text-slate-500">
                    <span className="font-semibold text-slate-600">Verimlilik Skalası:</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-xs bg-rose-600" />
                        <span>&lt; %85</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-xs bg-orange-500" />
                        <span>%85 - %90</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-xs bg-amber-400" />
                        <span>%90 - %93</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-xs bg-lime-400" />
                        <span>%93 - %96</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
                        <span>%96 - %98.5</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                        <span>&gt; %98.5</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 4. BÖLÜM: EN VERİMSİZ 10 GÜN TABLOSU & 24S DRILL-DOWN İNCELEMESİ */}
        <section className="space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-100 text-rose-700">
                  <Flame className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  En Verimsiz 10 Gün (En Yüksek Dengesizlik Kaybı)
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Kayıp tutarına (TL) göre sıralanmış kritik günler. Herhangi bir satıra tıklayarak o günün 24 saatlik MWh ve PTF/SMF çift eksenli grafiğini açabilirsiniz.
              </p>
            </div>
            <div className="text-xs text-slate-400">
              Satıra tıklayarak 24 saatlik drill-down açın
            </div>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="w-12 text-center text-xs">#</TableHead>
                  <TableHead className="text-xs">Tarih</TableHead>
                  <TableHead className="text-right text-xs">Verimlilik (%)</TableHead>
                  <TableHead className="text-right text-xs">Gerçekleşen (MWh)</TableHead>
                  <TableHead className="text-right text-xs">Tahmin (MWh)</TableHead>
                  <TableHead className="text-right text-xs">Net Sapma</TableHead>
                  <TableHead className="text-center text-xs">Hakim Yön</TableHead>
                  <TableHead className="text-right text-xs">Dengesizlik Kaybı</TableHead>
                  <TableHead className="w-24 text-center text-xs">Aksiyon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentView.worst10Days.map((day, idx) => {
                  const netDiffMwh = day.totalForecastMwh - day.totalActualMwh;
                  return (
                    <TableRow
                      key={day.period}
                      onClick={() => {
                        setSelectedDayDetail(day);
                        setIsDetailOpen(true);
                      }}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <TableCell className="text-center font-mono text-xs font-semibold text-slate-400">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{day.period}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        <span
                          className={`rounded-md px-1.5 py-0.5 ${
                            day.efficiencyRatio >= 0.98
                              ? "bg-emerald-50 text-emerald-700"
                              : day.efficiencyRatio >= 0.95
                              ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          %{(day.efficiencyRatio * 100).toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-700">
                        {day.totalActualMwh.toLocaleString("tr-TR")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-700">
                        {day.totalForecastMwh.toLocaleString("tr-TR")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span
                          className={
                            netDiffMwh > 0
                              ? "text-rose-600"
                              : netDiffMwh < 0
                              ? "text-amber-600"
                              : "text-slate-500"
                          }
                        >
                          {netDiffMwh > 0 ? "+" : ""}
                          {netDiffMwh.toFixed(1)} MWh
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${
                            day.dominantSystemDirection === "DEFICIT"
                              ? "bg-rose-100 text-rose-800"
                              : day.dominantSystemDirection === "SURPLUS"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {day.dominantSystemDirection === "DEFICIT"
                            ? "AÇIK"
                            : day.dominantSystemDirection === "SURPLUS"
                            ? "FAZLA"
                            : "DENGEDE"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-rose-600">
                        {day.lossTl.toLocaleString("tr-TR")} ₺
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDayDetail(day);
                            setIsDetailOpen(true);
                          }}
                          className="h-7 gap-1 px-2 text-2xs text-indigo-600 hover:bg-indigo-50"
                        >
                          <Eye className="h-3 w-3" />
                          24s İncele
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </section>
        </>
      )}

        {/* ========================================================================= */}
        {/* GİP ARBİTRAJ ANALİZİ SEKMESİ                                             */}
        {/* ========================================================================= */}
        {activeSectionTab === "arbitrage" && (
          <div className="space-y-8">
            {/* GİP Verisi Yoksa Boş Durum (Empty State) */}
            {!currentView.arbitrage?.hasGipData ? (
              <Card className="border-2 border-dashed border-amber-300 bg-amber-50/40 p-12 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 shadow-inner">
                  <AlertCircle className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
                  GİP (Gün İçi Piyasası) Verisi Bulunmuyor
                </h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                  GİP verisi yüklenirse bu analiz aktifleşir. Projenize EPİAŞ Gün İçi Piyasası Ağırlıklı Ortalama Fiyatı (GİP AOF) sütununu içeren piyasa verisi eklediğinizde; dengesizlik pozisyonlarınızı GİP üzerinden kapama fırsatları, saatlik arbitraj spreadleri ve kaçırılan gelir potansiyeli otomatik olarak burada hesaplanacaktır.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button asChild size="sm" className="gap-2 bg-amber-600 text-white hover:bg-amber-700">
                    <Link href={`/projects/${projectId}/data`}>
                      <FileSpreadsheet className="h-4 w-4" />
                      Piyasa Verisi Yükle / Eşleştir
                    </Link>
                  </Button>
                </div>
              </Card>
            ) : (
              <>
                {/* 1. KPI KARTLARI */}
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* KPI 1: Toplam Kaçırılan Fırsat (TL) */}
                  <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Toplam Kaçırılan Fırsat
                      </CardTitle>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <TrendingUp className="h-4 w-4" />
                      </span>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-baseline gap-2">
                        <div className="text-2xl font-bold tracking-tight text-emerald-600 sm:text-3xl">
                          {currentView.arbitrage.totalMissedOpportunityTl.toLocaleString("tr-TR")} ₺
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Pozitif GİP arbitraj potansiyeli toplamı
                      </p>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
                        <span>Karlı Saatler:</span>
                        <span className="font-semibold text-emerald-700">
                          {currentView.arbitrage.positiveHoursCount.toLocaleString("tr-TR")} saat
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* KPI 2: Doğru Verilen Kararlar (TL) */}
                  <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Doğru Verilen Kararlar
                      </CardTitle>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-baseline gap-2">
                        <div className="text-2xl font-bold tracking-tight text-indigo-600 sm:text-3xl">
                          {currentView.arbitrage.totalCorrectDecisionsTl.toLocaleString("tr-TR")} ₺
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Dengesizlikte kalmanın GİP&apos;ten avantajlı olduğu saatler
                      </p>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
                        <span>Korunan Saatler:</span>
                        <span className="font-semibold text-indigo-700">
                          {currentView.arbitrage.negativeHoursCount.toLocaleString("tr-TR")} saat
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* KPI 3: Fırsat Yakalanabilir Saatler */}
                  <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Fırsat Yakalanabilir Saatler
                      </CardTitle>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Clock className="h-4 w-4" />
                      </span>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-baseline gap-2">
                        <div className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                          %{((currentView.arbitrage.positiveHoursCount / (currentView.arbitrage.totalHoursWithGip || 1)) * 100).toFixed(1)}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        GİP&apos;te pozisyon kapatmanın avantaj sağladığı zaman oranı
                      </p>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
                        <span>Toplam GİP Kaydı:</span>
                        <span className="font-semibold text-slate-800">
                          {currentView.arbitrage.totalHoursWithGip.toLocaleString("tr-TR")} saat
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* KPI 4: Ortalama Fiyat Avantajı */}
                  <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Ortalama Fiyat Avantajı
                      </CardTitle>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <Sparkles className="h-4 w-4" />
                      </span>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-baseline gap-2">
                        <div className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                          {currentView.arbitrage.avgOpportunityPerMwh.toFixed(2)} ₺
                        </div>
                        <span className="text-xs font-semibold text-slate-500">/ MWh</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Dengesizlik MWh başına ortalama yakalanabilir marj
                      </p>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
                        <span>GİP Veri Kapsamı:</span>
                        <span className="font-semibold text-sky-700">
                          %{currentView.arbitrage.gipCoveragePercent}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </section>

                {/* 2. GRAFİKLER BÖLÜMÜ (AYLIK TREND & FİYAT AYRIŞMASI) */}
                <section className="grid gap-6 lg:grid-cols-2">
                  {/* Grafik 1: Aylık Kaçırılan Fırsat Trendi */}
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900">
                            Aylık Kaçırılan Fırsat Trendi (TL)
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500">
                            GİP yerine EPİAŞ dengesizlik uzlaştırmasında kalınması nedeniyle kaçırılan potansiyel kazanç
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80 w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={monthlyArbitrageChartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="ay" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#cbd5e1" }} />
                            <YAxis
                              tick={{ fontSize: 11, fill: "#64748b" }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k ₺`}
                            />
                            <Tooltip
                              formatter={(value: any, name?: any) => [
                                `${Number(value).toLocaleString("tr-TR")} ₺`,
                                name === "kacirilanFirsatTl" ? "Kaçırılan Fırsat" : "Doğru Kararlar",
                              ]}
                              labelFormatter={(label) => `${label} Ayı Arbitraj Özeti`}
                            />
                            <Legend verticalAlign="top" height={36} />
                            <Bar
                              dataKey="kacirilanFirsatTl"
                              name="Kaçırılan Fırsat (TL)"
                              fill="#059669"
                              radius={[4, 4, 0, 0]}
                              isAnimationActive={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="dogruKararlarTl"
                              name="Doğru Kararlar (TL)"
                              stroke="#6366f1"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              isAnimationActive={false}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Grafik 2: Dengesizlik Fiyatı vs GİP Fiyatı Zaman Serisi */}
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900">
                            Dengesizlik Fiyatı vs GİP Fiyatı
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500">
                            Fiyat ayrışmasını gösteren çift çizgili zaman serisi ve arbitraj makası
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setDivergenceMode("hourly")}
                            className={`rounded px-2.5 py-1 font-medium transition-colors ${
                              divergenceMode === "hourly"
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            24-Saatlik Profil
                          </button>
                          <button
                            type="button"
                            onClick={() => setDivergenceMode("monthly")}
                            className={`rounded px-2.5 py-1 font-medium transition-colors ${
                              divergenceMode === "monthly"
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Aylık Ortalama
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80 w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={priceDivergenceChartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="etiket" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#cbd5e1" }} />
                            <YAxis
                              tick={{ fontSize: 11, fill: "#64748b" }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => `${v.toFixed(0)} ₺`}
                            />
                            <Tooltip
                              formatter={(value: any, name?: any) => [
                                `${Number(value).toLocaleString("tr-TR")} ₺/MWh`,
                                name === "gipFiyat"
                                  ? "GİP AOF"
                                  : name === "dengesizlikFiyat"
                                  ? "Dengesizlik Fiyatı"
                                  : "PTF Referans",
                              ]}
                              labelFormatter={(label) =>
                                divergenceMode === "hourly" ? `Saat ${label}` : `${label} Ayı`
                              }
                            />
                            <Legend verticalAlign="top" height={36} />
                            <Line
                              type="monotone"
                              dataKey="gipFiyat"
                              name="GİP AOF (₺/MWh)"
                              stroke="#8b5cf6"
                              strokeWidth={2.5}
                              dot={{ r: 3 }}
                              isAnimationActive={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="dengesizlikFiyat"
                              name="Dengesizlik Fiyatı (₺/MWh)"
                              stroke="#f59e0b"
                              strokeWidth={2.5}
                              dot={{ r: 3 }}
                              isAnimationActive={false}
                            />
                            {divergenceMode === "hourly" && (
                              <Line
                                type="monotone"
                                dataKey="ptfFiyat"
                                name="PTF (₺/MWh)"
                                stroke="#94a3b8"
                                strokeWidth={1.5}
                                strokeDasharray="4 4"
                                dot={false}
                                isAnimationActive={false}
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </section>

                {/* 3. EN YÜKSEK ARBİTRAJ FIRSATI OLAN 10 SAAT TABLOSU */}
                <section className="space-y-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        En Yüksek Arbitraj Fırsatı Olan 10 Saat
                      </h3>
                      <p className="text-xs text-slate-500">
                        GİP ile EPİAŞ dengesizlik fiyatı makasının açıldığı ve en büyük potansiyel tasarrufun/gelirin kaçırıldığı saatler
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      İlk {Math.min(10, currentView.arbitrage.topHours.length)} Saat Sıralandı
                    </span>
                  </div>

                  <Card className="border-slate-200 shadow-sm overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80">
                          <TableHead className="w-12 text-center text-xs">#</TableHead>
                          <TableHead className="text-xs">Tarih &amp; Saat</TableHead>
                          {selectedScope === "portfolio" && (
                            <TableHead className="text-xs">Santral</TableHead>
                          )}
                          <TableHead className="text-xs">Dengesizlik Yönü &amp; Miktarı</TableHead>
                          <TableHead className="text-right text-xs">Dengesizlik Fiyatı</TableHead>
                          <TableHead className="text-right text-xs">GİP Fiyatı</TableHead>
                          <TableHead className="text-right text-xs">Fark (Makas)</TableHead>
                          <TableHead className="text-right text-xs font-bold text-emerald-800">
                            Kaçırılan Fırsat (TL)
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentView.arbitrage.topHours.slice(0, 10).map((hourItem, idx) => (
                          <TableRow key={`${hourItem.dateStr}-${hourItem.hourStr}-${idx}`} className="hover:bg-slate-50">
                            <TableCell className="text-center font-mono text-xs font-semibold text-slate-400">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="text-xs font-medium text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                <span>{hourItem.dateStr}</span>
                                <span className="font-mono text-slate-500 font-semibold">{hourItem.hourStr}</span>
                              </div>
                            </TableCell>
                            {selectedScope === "portfolio" && (
                              <TableCell className="text-xs font-medium text-slate-700">
                                {hourItem.plantName || "—"}
                              </TableCell>
                            )}
                            <TableCell className="text-xs">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${
                                  hourItem.direction === "DEFICIT"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {hourItem.imbalanceMwh > 0 ? "+" : ""}
                                {hourItem.imbalanceMwh} MWh ({hourItem.direction === "DEFICIT" ? "Açık" : "Fazla"})
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-slate-700">
                              {hourItem.imbalancePrice.toLocaleString("tr-TR")} ₺
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold text-purple-700">
                              {hourItem.gipPrice.toLocaleString("tr-TR")} ₺
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-bold text-amber-700">
                              +{hourItem.priceDifference.toLocaleString("tr-TR")} ₺/MWh
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-bold text-emerald-600">
                              {hourItem.opportunityTl.toLocaleString("tr-TR")} ₺
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </section>

                {/* 4. METODOLOJİ & RİSK UYARISI KUTUSU */}
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-900">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="space-y-1 text-xs text-amber-950">
                      <h4 className="font-bold text-sm text-amber-900">
                        Metodoloji &amp; Risk Uyarısı (Teorik Üst Sınır)
                      </h4>
                      <p className="leading-relaxed">
                        Bu analiz, üreticinin her saat için tam isabetli zamanda ve tam miktar kadar Gün İçi Piyasası&apos;nda (GİP) işlem yapabildiğini varsayan <strong>TEORİK bir üst sınırdır</strong>. Gerçek hayatta piyasa likidite derinliği, emir eşleşme hızı, kapı kapanış süresi (gate closure) ve operasyonel kısıtlar bu potansiyeli tam olarak yakalamayı güçleştirir.
                      </p>
                      <p className="leading-relaxed">
                        Bu nedenle sunulan rakamlar bir &quot;kesin kazanç garantisi&quot; olarak değil, portföy yönetiminde ve gün içi ticaret stratejilerinde <strong>araştırılmaya ve optimize edilmeye değer potansiyel alanlar</strong> olarak değerlendirilmelidir.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 5. 24 SAATLİK DRILL-DOWN İKİLİ EKSENLİ MODAL / DİALOG */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl w-full">
            {selectedDayDetail && (
              <>
                <DialogHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <DialogTitle className="text-xl font-bold text-slate-900">
                        {selectedDayDetail.period} — 24 Saatlik Üretim ve Fiyat Drill-Down Analizi
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-500">
                        Left Axis: Gerçekleşen vs Tahmin (MWh) • Right Axis: PTF vs SMF (₺/MWh)
                      </DialogDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                        Kayıp: {selectedDayDetail.lossTl.toLocaleString("tr-TR")} ₺
                      </div>
                      <div className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        Verim: %{(selectedDayDetail.efficiencyRatio * 100).toFixed(1)}
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                {/* Grafik Alanı */}
                <div className="h-80 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={selectedDayDetail.hourlyDetail}
                      margin={{ top: 10, right: 30, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="hour" stroke="#64748b" fontSize={11} tickLine={false} />
                      {/* Sol Eksen: MWh */}
                      <YAxis
                        yAxisId="left"
                        stroke="#0284c7"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v} MWh`}
                      />
                      {/* Sağ Eksen: ₺/MWh */}
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#ef4444"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v} ₺`}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          border: "1px solid #e2e8f0",
                        }}
                        formatter={(val: any, name: any) => {
                          if (name === "Gerçekleşen MWh" || name === "Tahmin MWh") {
                            return [`${Number(val || 0).toFixed(2)} MWh`, name];
                          }
                          return [`${Number(val || 0).toFixed(2)} ₺/MWh`, name];
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />

                      {/* MWh Serileri (Sol Eksen) */}
                      <Bar
                        yAxisId="left"
                        dataKey="actualMwh"
                        name="Gerçekleşen MWh"
                        fill="#0284c7"
                        opacity={0.7}
                        radius={[2, 2, 0, 0]}
                        maxBarSize={20}
                        isAnimationActive={false}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="forecastMwh"
                        name="Tahmin MWh"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        strokeDasharray="4 4"
                        dot={{ r: 2 }}
                        isAnimationActive={false}
                      />

                      {/* Fiyat Serileri (Sağ Eksen) */}
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="ptf"
                        name="PTF (₺/MWh)"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="smf"
                        name="SMF (₺/MWh)"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Drill-down Açıklama Özeti */}
                <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 text-xs text-slate-700 space-y-1.5">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Kayıp Analizi ve Fiyat Dinamiği:
                  </div>
                  <p>
                    {selectedDayDetail.period} günü toplam{" "}
                    <strong>{selectedDayDetail.totalActualMwh.toLocaleString("tr-TR")} MWh</strong> fiili üretim ve{" "}
                    <strong>{selectedDayDetail.totalForecastMwh.toLocaleString("tr-TR")} MWh</strong> tahmin
                    gerçekleşmiştir. Hakim piyasa yönü{" "}
                    <strong>{selectedDayDetail.dominantSystemDirection === "DEFICIT" ? "Enerji Açığı (DEFICIT)" : selectedDayDetail.dominantSystemDirection === "SURPLUS" ? "Enerji Fazlası (SURPLUS)" : "Dengede"}</strong>{" "}
                    olup, tahmin sapmalarının SMF-PTF makasının açıldığı saatlerde yoğunlaşması dengesizlik maliyetini artırmıştır.
                  </p>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
