/**
 * TR-Energy Analyst PowerPoint Export Modülü (PptxGenJS)
 *
 * Kurumsal 16:9 Widescreen Sunum Formatı (13,33 x 7,5 inç, Maksimum 6-7 slayt):
 * - Slayt 1: Kapak (Proje adı, dönem, tarih)
 * - Slayt 2: Yönetici Özeti (KPI kartları + Aylık Gelir & Maliyet Karşılaştırmalı Grafik)
 * - Slayt 3: Ana Bulgular & Dengesizlik Dinamikleri (En kritik saatler, sistem yönü ve zaman dilimi)
 * - Slayt 4: Santral Karşılaştırması & Portföy Riski (Birim metrikler, skor tablosu)
 * - Slayt 5: Tahmin Doğruluğu & Sistematik Sapma (Fiyattan bağımsız; veri varsa eklenir)
 * - Slayt 6: DSG Netleştirme Analizi (Birden fazla santral varsa eklenir)
 * - Slayt 6b: DSG Faydasının Paylaştırılması (paylaştırma verisi varsa eklenir)
 * - Slayt 7: Strateji ve Azaltım Önerileri (Kural tabanlı somut aksiyon adımları)
 * - Slayt 8: Sonuç & Uygulama Yol Haritası (Kısa, orta ve uzun vadeli adımlar)
 *
 * Tüm koordinatlar LAYOUT_WIDE (13,33 x 7,5 inç) içindir.
 */

import pptxgen from "pptxgenjs";
import {
  HighestCostHoursAnalysis,
  MitigationSuggestion,
  PlantComparisonResult,
} from "../strategy/insights";
import { AccuracyStats, diagnoseAccuracy } from "../analysis/forecast-accuracy";
import type { ScalingImpact } from "../analysis/scaling-impact";
import type { BacktestSummary } from "../analysis/backtest";
import type { NettingGroupResult, NettingResult } from "../analysis/portfolio-netting";
import type { AllocationMethod } from "../analysis/dsg-scenarios";

export interface PptxMonthlyMetric {
  month: string;
  actualMwh: number;
  revenue: number;
  imbalanceCost: number;
}

export interface PptxExportProjectData {
  projectName: string;
  projectDescription?: string;
  totalActualMwh: number;
  totalRevenue: number;
  totalImbalanceCost: number;
  unitImbalanceCost: number;
  monthlyBreakdown?: PptxMonthlyMetric[];
  plantComparison?: PlantComparisonResult[];
  forecastAccuracy?: {
    plants: Array<{
      plantName: string;
      plantType: string;
      overall: AccuracyStats;
      /** Tahmin Σgerçekleşen/Σtahmin ile ölçeklenseydi dengesizlik maliyeti (piyasa verisi olan saatler) */
      scaling?: ScalingImpact;
      /** Aynı ölçeklemenin geriye dönük testi (görmediği aylarda); test edilemiyorsa null */
      backtest?: BacktestSummary | null;
    }>;
    portfolio: AccuracyStats;
  };
  netting?: NettingResult;
  /** Tüm santrallerin tek DSG'de toplandığı durum için paylaştırma yöntemleri (en fazla 8 santral) */
  dsgAllocation?: AllocationMethod[] | null;
}

export interface PptxExportInsightsData {
  portfolioHighestCostHours?: HighestCostHoursAnalysis;
  plantInsights?: Array<{
    plantName: string;
    plantType: string;
    highestCostHours: HighestCostHoursAnalysis;
    suggestions: MitigationSuggestion[];
  }>;
  chartImages?: {
    monthlyComparison?: string; // Base64 data URI (image/png;base64,...)
    plantComparison?: string;
  };
}

function formatTL(val: number): string {
  return (
    new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 0,
    }).format(val) + " ₺"
  );
}

function formatMwh(val: number): string {
  return (
    new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 1,
    }).format(val) + " MWh"
  );
}

function formatUnit(val: number): string {
  return (
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val) + " ₺/MWh"
  );
}

export async function exportToPptx(
  projectData: PptxExportProjectData,
  insightsData?: PptxExportInsightsData
): Promise<Buffer> {
  const pptx = new pptxgen();

  // LAYOUT_16x9 10 x 5,625 inçtir; slayt koordinatları 13,33 x 7,5 inç (LAYOUT_WIDE, yine 16:9) için yazılmıştır
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "TR-Energy Analyst";
  pptx.company = "EPİAŞ Enerji Analiz Platformu";
  pptx.title = `${projectData.projectName} - Dengesizlik Maliyet ve Strateji Raporu`;

  // Renk Paleti (Hex)
  const colors = {
    darkBg: "0F172A", // Slate 900
    cardBg: "FFFFFF",
    slideBg: "F8FAFC", // Slate 50
    primary: "0284C7", // Sky 600
    primaryDark: "0369A1", // Sky 700
    accentCyan: "38BDF8", // Sky 400
    textPrimary: "0F172A",
    textSecondary: "475569", // Slate 600
    textMuted: "94A3B8", // Slate 400
    border: "E2E8F0",
    success: "16A34A", // Green 600
    danger: "DC2626", // Red 600
    warning: "D97706", // Amber 600
    badgeDeficit: "FEE2E2",
    badgeSurplus: "FEF3C7",
  };

  // -------------------------------------------------------------
  // SLAYT 1: KAPAK (TITLE / COVER)
  // -------------------------------------------------------------
  const slide1 = pptx.addSlide();
  slide1.background = { color: colors.darkBg };

  // Üst Küçük Rozet / Kategori
  slide1.addShape(pptx.ShapeType.roundRect, {
    x: 0.8,
    y: 1.5,
    w: 3.8,
    h: 0.4,
    fill: { color: "1E293B" },
    line: { color: "334155", width: 1 },
    rectRadius: 0.08,
  });
  slide1.addText("⚡ TR-ENERGY ANALYST | PİYASA RAPORU", {
    x: 0.9,
    y: 1.5,
    w: 3.6,
    h: 0.4,
    fontSize: 10,
    bold: true,
    color: colors.accentCyan,
    align: "left",
    valign: "middle",
  });

  // Ana Başlık
  slide1.addText("Dengesizlik Maliyeti & Stratejik Yol Haritası", {
    x: 0.8,
    y: 2.2,
    w: 11.5,
    h: 1.2,
    fontSize: 32,
    bold: true,
    color: "FFFFFF",
    fontFace: "Arial",
  });

  // Alt Başlık (Proje Adı)
  slide1.addText(
    `Portföy Projesi: ${projectData.projectName}\n${
      projectData.projectDescription ||
      "EPİAŞ Gün Öncesi Piyasası (GÖP) ve Dengeleme Güç Piyasası (DGP) Risk & Verimlilik Değerlendirmesi"
    }`,
    {
      x: 0.8,
      y: 3.5,
      w: 11.0,
      h: 1.0,
      fontSize: 15,
      color: "CBD5E1",
      lineSpacing: 22,
    }
  );

  // Kapak Bilgi Kutusu (Tarih ve Kapsam)
  slide1.addShape(pptx.ShapeType.roundRect, {
    x: 0.8,
    y: 5.2,
    w: 11.7,
    h: 1.2,
    fill: { color: "1E293B" },
    line: { color: "334155", width: 1 },
    rectRadius: 0.1,
  });

  const currentDate = new Date().toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  slide1.addText(
    [
      { text: "Rapor Tarihi: ", options: { bold: true, color: "94A3B8" } },
      { text: `${currentDate}    `, options: { color: "FFFFFF" } },
      { text: "Kapsam: ", options: { bold: true, color: "94A3B8" } },
      { text: "Saatlik Uzlaştırma & Kural Tabanlı Strateji    ", options: { color: "FFFFFF" } },
      { text: "Piyasa: ", options: { bold: true, color: "94A3B8" } },
      { text: "EPİAŞ GÖP / DGP / GİP", options: { color: colors.accentCyan } },
    ],
    {
      x: 1.1,
      y: 5.5,
      w: 11.0,
      h: 0.6,
      fontSize: 12,
      valign: "middle",
    }
  );

  // -------------------------------------------------------------
  // SLAYT 2: YÖNETİCİ ÖZETİ (EXECUTIVE SUMMARY)
  // -------------------------------------------------------------
  const slide2 = pptx.addSlide();
  slide2.background = { color: colors.slideBg };

  // Slayt Başlığı
  slide2.addText("Yönetici Özeti — Temel Performans Göstergeleri", {
    x: 0.8,
    y: 0.5,
    w: 10,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: colors.textPrimary,
  });
  slide2.addText(
    "Portföyün toplam üretim, brüt/net gelir hacmi ve dengesizlik maliyeti baskısı",
    {
      x: 0.8,
      y: 0.95,
      w: 10,
      h: 0.3,
      fontSize: 11,
      color: colors.textSecondary,
    }
  );

  // 4 KPI Kartı
  const kpiData = [
    {
      title: "Toplam Üretim",
      value: formatMwh(projectData.totalActualMwh),
      sub: "Gerçekleşen net üretim",
      color: colors.primary,
    },
    {
      title: "Toplam Net Gelir",
      value: formatTL(projectData.totalRevenue),
      sub: "GÖP + Dengesizlik uzlaştırması",
      color: colors.success,
    },
    {
      title: "Toplam Dengesizlik Maliyeti",
      value: formatTL(projectData.totalImbalanceCost),
      sub: "Fiktif gelir kaybı farkı",
      color: colors.danger,
    },
    {
      title: "Ort. Birim Dengesizlik Maliyeti",
      value: formatUnit(projectData.unitImbalanceCost),
      sub:
        projectData.totalRevenue > 0
          ? `%${new Intl.NumberFormat("tr-TR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }).format((projectData.totalImbalanceCost / projectData.totalRevenue) * 100)} ciro kaybı`
          : "Birim üretim maliyeti",
      color: colors.warning,
    },
  ];

  const cardW = 2.75;
  const gap = 0.24;
  kpiData.forEach((kpi, idx) => {
    const cardX = 0.8 + idx * (cardW + gap);
    slide2.addShape(pptx.ShapeType.roundRect, {
      x: cardX,
      y: 1.4,
      w: cardW,
      h: 1.35,
      fill: { color: colors.cardBg },
      line: { color: colors.border, width: 1 },
      rectRadius: 0.1,
    });

    slide2.addText(kpi.title, {
      x: cardX + 0.15,
      y: 1.5,
      w: cardW - 0.3,
      h: 0.25,
      fontSize: 10,
      bold: true,
      color: colors.textSecondary,
    });

    slide2.addText(kpi.value, {
      x: cardX + 0.15,
      y: 1.78,
      w: cardW - 0.3,
      h: 0.45,
      fontSize: 16,
      bold: true,
      color: kpi.color,
    });

    slide2.addText(kpi.sub, {
      x: cardX + 0.15,
      y: 2.28,
      w: cardW - 0.3,
      h: 0.3,
      fontSize: 9,
      color: colors.textMuted,
    });
  });

  // Aylık Grafik Alanı (Görsel veya Yerel Grafik)
  if (insightsData?.chartImages?.monthlyComparison) {
    slide2.addImage({
      data: insightsData.chartImages.monthlyComparison,
      x: 0.8,
      y: 2.95,
      w: 11.7,
      h: 4.1,
    });
  } else if (projectData.monthlyBreakdown && projectData.monthlyBreakdown.length > 0) {
    // Yerel Widescreen PowerPoint Bar Grafiği
    const labels = projectData.monthlyBreakdown.map((m) => m.month);
    const revenueValues = projectData.monthlyBreakdown.map((m) =>
      Number((m.revenue / 1000).toFixed(1))
    );
    const costValues = projectData.monthlyBreakdown.map((m) =>
      Number((m.imbalanceCost / 1000).toFixed(1))
    );

    slide2.addChart(
      pptx.ChartType.bar,
      [
        { name: "Toplam Gelir (Bin ₺)", labels, values: revenueValues },
        { name: "Dengesizlik Maliyeti (Bin ₺)", labels, values: costValues },
      ],
      {
        x: 0.8,
        y: 2.95,
        w: 11.7,
        h: 4.1,
        showLegend: true,
        legendPos: "t",
        chartColors: ["0284C7", "EF4444"],
        barGrouping: "clustered",
        catAxisLabelColor: "475569",
        catAxisLabelFontSize: 10,
        valAxisLabelColor: "475569",
        valAxisLabelFontSize: 9,
      }
    );
  } else {
    // Veri yoksa özet bilgilendirme paneli
    slide2.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 2.95,
      w: 11.7,
      h: 4.1,
      fill: { color: colors.cardBg },
      line: { color: colors.border, width: 1 },
      rectRadius: 0.1,
    });
    slide2.addText("Aylık konsolide veriler işlendi. Detaylar sonraki sayfalarda listelenmiştir.", {
      x: 1.0,
      y: 4.5,
      w: 11.3,
      h: 0.5,
      fontSize: 14,
      color: colors.textSecondary,
      align: "center",
    });
  }

  // -------------------------------------------------------------
  // SLAYT 3: ANA BULGULAR & DENGESİZLİK DİNAMİKLERİ
  // -------------------------------------------------------------
  const slide3 = pptx.addSlide();
  slide3.background = { color: colors.slideBg };

  slide3.addText("Ana Bulgular — Kritik Saatler & Sistem Dinamikleri", {
    x: 0.8,
    y: 0.5,
    w: 10,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: colors.textPrimary,
  });
  slide3.addText(
    "En yüksek maliyet yaratan kritik 20 saatin ortak piyasa ve operasyon örüntüleri",
    {
      x: 0.8,
      y: 0.95,
      w: 10,
      h: 0.3,
      fontSize: 11,
      color: colors.textSecondary,
    }
  );

  const highestAnalysis = insightsData?.portfolioHighestCostHours;

  // Sol Taraf: 3 Büyük Analiz Kartı
  const analysisCards = [
    {
      title: "1. Baskın Sistem Yönü Etkisi",
      metric: highestAnalysis
        ? `Sistem ${
            highestAnalysis.directionDistribution.dominantDirection === "DEFICIT"
              ? "Enerji Açığında"
              : highestAnalysis.directionDistribution.dominantDirection === "SURPLUS"
                ? "Enerji Fazlasında"
                : "Dengede"
          }`
        : "Sistem Yönü",
      detail: highestAnalysis
        ? `Kritik saatlerin %${(
            highestAnalysis.directionDistribution[
              highestAnalysis.directionDistribution.dominantDirection
            ]?.percentage || 0
          ).toFixed(0)}'i sistemin ${
            highestAnalysis.directionDistribution.dominantDirection === "DEFICIT"
              ? "enerji açığında olduğu (SMF > PTF, 1+k ceza katsayılı)"
              : "enerji fazlasında olduğu"
          } anlarda gerçekleşti.`
        : "Sistem yönü dağılımı stabil.",
      color: colors.danger,
    },
    {
      title: "2. Zaman Aralığı Yoğunlaşması",
      metric: highestAnalysis
        ? `${highestAnalysis.dominantInterval.label}`
        : "Zaman Dilimi",
      detail: highestAnalysis
        ? `Maliyetlerin %${highestAnalysis.dominantInterval.percentage.toFixed(
            0
          )}'i bu saat penceresinde kümelenmektedir. Gün İçi Piyasası (GİP) pozisyon güncellemeleri bu aralıkta kritik önem taşır.`
        : "Saat dilimi dağılımı homojen.",
      color: colors.primary,
    },
    {
      title: "3. Tahmin Sapması Sıçraması",
      metric: highestAnalysis
        ? `%${(highestAnalysis.topNMeanErrorRate * 100).toFixed(1)} Sapma Oranı`
        : "Sapma Artışı",
      detail: highestAnalysis
        ? `Kritik saatlerdeki ortalama tahmin hatası (%${(
            highestAnalysis.topNMeanErrorRate * 100
          ).toFixed(1)}), genel portföy ortalamasından (%${(
            highestAnalysis.overallMeanErrorRate * 100
          ).toFixed(1)}) tam ${highestAnalysis.errorRateRatio.toFixed(
            1
          )} kat daha yüksektir.`
        : "Hata oranları kabul edilebilir bantta.",
      color: colors.warning,
    },
  ];

  const leftCardW = 6.2;
  analysisCards.forEach((c, idx) => {
    const cardY = 1.4 + idx * 1.75;
    slide3.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: cardY,
      w: leftCardW,
      h: 1.6,
      fill: { color: colors.cardBg },
      line: { color: colors.border, width: 1 },
      rectRadius: 0.1,
    });

    slide3.addText(c.title, {
      x: 1.0,
      y: cardY + 0.12,
      w: leftCardW - 0.4,
      h: 0.25,
      fontSize: 11,
      bold: true,
      color: colors.textSecondary,
    });

    slide3.addText(c.metric, {
      x: 1.0,
      y: cardY + 0.4,
      w: leftCardW - 0.4,
      h: 0.35,
      fontSize: 15,
      bold: true,
      color: c.color,
    });

    slide3.addText(c.detail, {
      x: 1.0,
      y: cardY + 0.8,
      w: leftCardW - 0.4,
      h: 0.7,
      fontSize: 10,
      color: colors.textPrimary,
      lineSpacing: 14,
    });
  });

  // Sağ Taraf: Zaman Dilimi Dağılım Tablosu & Bias Özeti
  slide3.addShape(pptx.ShapeType.roundRect, {
    x: 7.25,
    y: 1.4,
    w: 5.25,
    h: 5.1,
    fill: { color: colors.cardBg },
    line: { color: colors.border, width: 1 },
    rectRadius: 0.1,
  });

  slide3.addText("Saat Dilimi Kırılımı (Kritik Saatler)", {
    x: 7.5,
    y: 1.6,
    w: 4.8,
    h: 0.3,
    fontSize: 13,
    bold: true,
    color: colors.textPrimary,
  });

  if (highestAnalysis) {
    const intervals = [
      highestAnalysis.timeIntervalDistribution.MORNING,
      highestAnalysis.timeIntervalDistribution.AFTERNOON,
      highestAnalysis.timeIntervalDistribution.EVENING,
      highestAnalysis.timeIntervalDistribution.NIGHT,
    ];

    intervals.forEach((intervalItem, idx) => {
      const itemY = 2.1 + idx * 0.75;

      slide3.addText(intervalItem.label, {
        x: 7.5,
        y: itemY,
        w: 3.2,
        h: 0.3,
        fontSize: 11,
        color: colors.textPrimary,
      });

      slide3.addText(`%${intervalItem.percentage.toFixed(0)} (${intervalItem.count} saat)`, {
        x: 10.7,
        y: itemY,
        w: 1.6,
        h: 0.3,
        fontSize: 11,
        bold: true,
        align: "right",
        color: intervalItem.percentage >= 30 ? colors.danger : colors.textSecondary,
      });

      // Basit ilerleme çubuğu
      slide3.addShape(pptx.ShapeType.roundRect, {
        x: 7.5,
        y: itemY + 0.32,
        w: 4.8,
        h: 0.08,
        fill: { color: "E2E8F0" },
        line: { color: "E2E8F0", width: 0 },
        rectRadius: 0.04,
      });

      const fillW = Math.max(0.1, (intervalItem.percentage / 100) * 4.8);
      slide3.addShape(pptx.ShapeType.roundRect, {
        x: 7.5,
        y: itemY + 0.32,
        w: fillW,
        h: 0.08,
        fill: { color: intervalItem.percentage >= 30 ? colors.danger : colors.primary },
        line: { type: "none" },
        rectRadius: 0.04,
      });
    });

    // Model Yanlılığı (Bias) Kutusu
    slide3.addShape(pptx.ShapeType.roundRect, {
      x: 7.5,
      y: 5.25,
      w: 4.8,
      h: 1.05,
      fill: { color: "F1F5F9" },
      line: { color: "CBD5E1", width: 1 },
      rectRadius: 0.08,
    });

    const biasText =
      highestAnalysis.systematicBias === "OVER_FORECASTING"
        ? "Aşırı Tahmin (Over-Forecasting): Taahhüt edilen enerji fiili üretimden sistematik olarak yüksektir. Negatif dengesizlik cezası baskındır."
        : highestAnalysis.systematicBias === "UNDER_FORECASTING"
          ? "Eksik Tahmin (Under-Forecasting): Üretim potansiyeli tam yansıtılmamakta, enerji iskontolu fiyattan satılmaktadır."
          : "Dengeli / Karışık Sapma: Belirgin bir tek yönlü sapma gözlemlenmemiştir.";

    slide3.addText(
      [
        { text: "Sistematik Yanlılık Durumu: ", options: { bold: true, color: colors.textPrimary } },
        { text: biasText, options: { color: colors.textSecondary } },
      ],
      {
        x: 7.65,
        y: 5.35,
        w: 4.5,
        h: 0.85,
        fontSize: 9.5,
        lineSpacing: 13,
      }
    );
  }

  // -------------------------------------------------------------
  // SLAYT 4: SANTRAL KARŞILAŞTIRMASI & PORTFÖY RİSKİ
  // -------------------------------------------------------------
  const slide4 = pptx.addSlide();
  slide4.background = { color: colors.slideBg };

  slide4.addText("Santral Karşılaştırması & Portföy Yönetim Riski", {
    x: 0.8,
    y: 0.5,
    w: 10,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: colors.textPrimary,
  });
  slide4.addText(
    "Santral bazında birim gelir, birim ceza maliyeti ve portföy uygunluk skorları",
    {
      x: 0.8,
      y: 0.95,
      w: 10,
      h: 0.3,
      fontSize: 11,
      color: colors.textSecondary,
    }
  );

  const plants = projectData.plantComparison || [];

  // Sol Taraf: Karşılaştırmalı Grafik (Görsel veya Yerel Kıyaslama Grafiği)
  if (insightsData?.chartImages?.plantComparison) {
    slide4.addImage({
      data: insightsData.chartImages.plantComparison,
      x: 0.8,
      y: 1.4,
      w: 5.7,
      h: 5.1,
    });
  } else if (plants.length > 0) {
    const labels = plants.map((p) => p.plantName);
    const unitRevenues = plants.map((p) => p.unitRevenue);
    const unitCosts = plants.map((p) => p.unitImbalanceCost);

    slide4.addChart(
      pptx.ChartType.bar,
      [
        { name: "Birim Gelir (₺/MWh)", labels, values: unitRevenues },
        { name: "Birim Maliyet (₺/MWh)", labels, values: unitCosts },
      ],
      {
        x: 0.8,
        y: 1.4,
        w: 5.7,
        h: 5.1,
        showLegend: true,
        legendPos: "t",
        chartColors: ["0284C7", "EF4444"],
        barGrouping: "clustered",
        catAxisLabelColor: "475569",
        catAxisLabelFontSize: 9,
        valAxisLabelColor: "475569",
        valAxisLabelFontSize: 8,
      }
    );
  }

  // Sağ Taraf: Karşılaştırma Tablosu
  const tableHeaders = [
    { text: "Santral", options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" } } },
    { text: "Tür", options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" } } },
    {
      text: "Birim Gelir",
      options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" }, align: "right" },
    },
    {
      text: "Birim Ceza",
      options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" }, align: "right" },
    },
    {
      text: "Skor",
      options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" }, align: "center" },
    },
    {
      text: "Profil",
      options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" }, align: "center" },
    },
  ];

  const tableRows: any[][] = [tableHeaders];

  plants.forEach((p) => {
    tableRows.push([
      { text: p.plantName, options: { bold: true, color: colors.textPrimary } },
      { text: p.plantType, options: { color: colors.textSecondary } },
      { text: formatUnit(p.unitRevenue), options: { align: "right", color: colors.textPrimary } },
      {
        text: formatUnit(p.unitImbalanceCost),
        options: { align: "right", color: colors.danger, bold: true },
      },
      {
        text: `${p.score}/100`,
        options: { align: "center", bold: true, color: colors.primary },
      },
      {
        text:
          p.assessment === "EXCELLENT"
            ? "MÜKEMMEL"
            : p.assessment === "GOOD"
              ? "İYİ"
              : p.assessment === "MODERATE"
                ? "ORTA"
                : "RİSKLİ",
        options: {
          align: "center",
          bold: true,
          color:
            p.assessment === "EXCELLENT" || p.assessment === "GOOD"
              ? colors.success
              : p.assessment === "MODERATE"
                ? colors.warning
                : colors.danger,
        },
      },
    ]);
  });

  slide4.addTable(tableRows, {
    x: 6.8,
    y: 1.4,
    w: 5.7,
    colW: [1.5, 0.6, 1.2, 1.2, 0.6, 0.6],
    border: { pt: 0.5, color: "CBD5E1" },
    fontSize: 9,
    rowH: 0.35,
    autoPage: false,
  });

  // Santral Gerekçe Kartı (Sağ Alt Kısım)
  const rationaleY = 1.4 + tableRows.length * 0.38 + 0.25;
  if (plants.length > 0 && rationaleY < 6.8) {
    const p = plants[0];
    slide4.addShape(pptx.ShapeType.roundRect, {
      x: 6.8,
      y: rationaleY,
      w: 5.7,
      h: 6.8 - rationaleY,
      fill: { color: colors.cardBg },
      line: { color: colors.border, width: 1 },
      rectRadius: 0.08,
    });

    slide4.addText(`🔍 ${p.plantName} — Stratejik Portföy Analizi`, {
      x: 7.0,
      y: rationaleY + 0.15,
      w: 5.3,
      h: 0.25,
      fontSize: 10,
      bold: true,
      color: colors.primaryDark,
    });

    slide4.addText(p.rationale || "Portföy performans metrikleri stabil.", {
      x: 7.0,
      y: rationaleY + 0.45,
      w: 5.3,
      h: 6.8 - rationaleY - 0.55,
      fontSize: 9,
      color: colors.textSecondary,
      lineSpacing: 13,
    });
  }

  // -------------------------------------------------------------
  // SLAYT 5: TAHMİN DOĞRULUĞU & SİSTEMATİK SAPMA (Fiyattan bağımsız)
  // -------------------------------------------------------------
  const accuracy = projectData.forecastAccuracy;
  if (accuracy && accuracy.plants.length > 0) {
    const slideAcc = pptx.addSlide();
    slideAcc.background = { color: colors.slideBg };

    // İşaret yüzde işaretinin önüne yazılır: "+%10,7", "−%4,6"
    const pct = (v: number, digits = 1, signed = false) =>
      `${v < 0 ? "−" : signed && v > 0 ? "+" : ""}%${new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(Math.abs(v) * 100)}`;

    slideAcc.addText("Tahmin Doğruluğu & Sistematik Sapma", {
      x: 0.8,
      y: 0.5,
      w: 11.7,
      h: 0.45,
      fontSize: 20,
      bold: true,
      color: colors.textPrimary,
    });
    slideAcc.addText(
      "Gün öncesi tahmin ile gerçekleşen üretimin karşılaştırması (fiyattan bağımsız, MWh bazlı)",
      { x: 0.8, y: 0.95, w: 11.7, h: 0.3, fontSize: 11, color: colors.textSecondary }
    );

    // Sol üst: Santral tablosu
    const headerCell = (text: string, align: "left" | "right" = "right") => ({
      text,
      options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" }, align },
    });
    const accRows: any[][] = [
      [
        headerCell("Santral", "left"),
        headerCell("Bias"),
        headerCell("WAPE"),
        headerCell("Ölçekli WAPE"),
        headerCell("Tek Yönlü Pay"),
        headerCell("Eksik Tahmin %"),
      ],
    ];
    const accRow = (label: string, st: AccuracyStats, bold = false) => [
      { text: label, options: { bold: true, color: colors.textPrimary } },
      {
        text: pct(st.biasRatio, 1, true),
        options: {
          align: "right",
          bold: bold || Math.abs(st.biasRatio) >= 0.1,
          color: Math.abs(st.biasRatio) >= 0.1 ? colors.danger : colors.textPrimary,
        },
      },
      { text: pct(st.wape), options: { align: "right", bold, color: colors.textPrimary } },
      { text: pct(st.wapeAfterScaling), options: { align: "right", bold, color: colors.textSecondary } },
      {
        text: pct(st.systematicShare, 0),
        options: {
          align: "right",
          bold: bold || st.systematicShare >= 0.5,
          color: st.systematicShare >= 0.5 ? colors.warning : colors.textPrimary,
        },
      },
      { text: pct(st.underForecastHourShare, 0), options: { align: "right", bold, color: colors.textPrimary } },
    ];
    accuracy.plants.forEach((p) => accRows.push(accRow(`${p.plantName} (${p.plantType})`, p.overall)));
    const portfolioRow = accRow("Portföy", accuracy.portfolio, true);
    portfolioRow.forEach((cell: any) => (cell.options.fill = { color: "F1F5F9" }));
    accRows.push(portfolioRow);

    slideAcc.addTable(accRows, {
      x: 0.8,
      y: 1.4,
      w: 6.9,
      colW: [1.6, 0.9, 0.9, 1.3, 1.1, 1.1],
      border: { pt: 0.5, color: "CBD5E1" },
      fontSize: 9,
      rowH: 0.36,
      autoPage: false,
    });

    // Sol alt: Ölçeklemenin dengesizlik maliyetine etkisi (TL)
    // Not: Grafik yerine tablo kullanılır; bazı sunum uygulamaları yerel PPT grafiklerini çizmiyor.
    const scaled = accuracy.plants.filter((p) => p.scaling);
    if (scaled.length > 0) {
      const impactY = 1.4 + accRows.length * 0.36 + 0.35;
      slideAcc.addText("Tahmin Ölçeklemesinin Dengesizlik Maliyetine Etkisi", {
        x: 0.8,
        y: impactY,
        w: 6.9,
        h: 0.3,
        fontSize: 11,
        bold: true,
        color: colors.textPrimary,
      });

      const signedTl = (v: number) =>
        `${v < 0 ? "−" : v > 0 ? "+" : ""}${formatTL(Math.abs(v))}`;
      const colorOf = (change: number) =>
        change < 0 ? colors.success : change > 0 ? colors.danger : colors.textPrimary;
      // backtestChange: geriye dönük testteki maliyet değişimi (negatif = tasarruf); null = test edilemedi
      const impactRow = (label: string, base: number, after: number, backtestChange: number | null, bold = false) => {
        const change = after - base;
        const ratio = base !== 0 ? change / base : 0;
        return [
          { text: label, options: { bold: true, color: colors.textPrimary } },
          { text: formatTL(base), options: { align: "right", bold, color: colors.textPrimary } },
          { text: formatTL(after), options: { align: "right", bold, color: colors.textSecondary } },
          { text: signedTl(change), options: { align: "right", bold: true, color: colorOf(change) } },
          { text: pct(ratio, 1, true), options: { align: "right", bold: true, color: colorOf(change) } },
          backtestChange === null
            ? { text: "—", options: { align: "right", color: colors.textSecondary } }
            : { text: signedTl(backtestChange), options: { align: "right", bold: true, color: colorOf(backtestChange) } },
        ];
      };

      const impactRows: any[][] = [
        [
          headerCell("Santral", "left"),
          headerCell("Mevcut Maliyet"),
          headerCell("Ölçekli Tahminle"),
          headerCell("Değişim"),
          headerCell("Değişim %"),
          headerCell("Geriye Dönük Test"),
        ],
      ];
      let totalBase = 0;
      let totalAfter = 0;
      let totalBacktest: number | null = null;
      scaled.forEach((p) => {
        totalBase += p.scaling!.baselineImbalanceCost;
        totalAfter += p.scaling!.scaledImbalanceCost;
        const bt = p.backtest ? -p.backtest.outOfSampleSavingTl : null;
        if (bt !== null) totalBacktest = (totalBacktest ?? 0) + bt;
        impactRows.push(
          impactRow(p.plantName, p.scaling!.baselineImbalanceCost, p.scaling!.scaledImbalanceCost, bt)
        );
      });
      const totalRow = impactRow("Portföy", totalBase, totalAfter, totalBacktest, true);
      totalRow.forEach((cell: any) => (cell.options.fill = { color: "F1F5F9" }));
      impactRows.push(totalRow);

      slideAcc.addTable(impactRows, {
        x: 0.8,
        y: impactY + 0.35,
        w: 6.9,
        colW: [1.2, 1.2, 1.2, 1.1, 0.9, 1.3],
        border: { pt: 0.5, color: "CBD5E1" },
        fontSize: 9,
        rowH: 0.32,
        autoPage: false,
      });

      const changeRatio = totalBase !== 0 ? (totalAfter - totalBase) / totalBase : 0;
      slideAcc.addText(
        (Math.abs(changeRatio) < 0.05
          ? `Sonuç: Net hacim sapmasını gidermek portföy dengesizlik maliyetini yalnızca ${pct(changeRatio, 1, true)} değiştiriyor. Maliyeti saat bazındaki hatalar belirliyor; kaldıraç tahmin modelinin iyileştirilmesidir.`
          : `Sonuç: Tahmin ölçeklemesi portföy dengesizlik maliyetini ${pct(changeRatio, 1, true)} değiştiriyor.`) +
          (totalBacktest !== null
            ? ` Geriye dönük testte (katsayı önceki 4 aydan, görmediği aylarda) değişim: ${signedTl(totalBacktest)}.`
            : ""),
        {
          x: 0.8,
          y: impactY + 0.35 + impactRows.length * 0.32 + 0.1,
          w: 6.9,
          h: 0.5,
          fontSize: 9,
          italic: true,
          color: colors.primaryDark,
          valign: "top",
        }
      );
    }

    // Sağ: Santral bazında bulgu kartları (en yüksek tek yönlü paydan başlayarak)
    const findings = [...accuracy.plants].sort(
      (a, b) => b.overall.systematicShare - a.overall.systematicShare
    );
    const cardGap = 0.12;
    const cardH = Math.min(1.4, (6.55 - 1.4 - cardGap * (findings.length - 1)) / findings.length);

    findings.forEach((p, idx) => {
      const cardY = 1.4 + idx * (cardH + cardGap);
      const stripColor =
        p.overall.systematicShare >= 0.5
          ? colors.warning
          : p.overall.systematicShare >= 0.2
            ? colors.primary
            : colors.textMuted;

      slideAcc.addShape(pptx.ShapeType.roundRect, {
        x: 8.0,
        y: cardY,
        w: 4.5,
        h: cardH,
        fill: { color: colors.cardBg },
        line: { color: colors.border, width: 1 },
        rectRadius: 0.08,
      });
      slideAcc.addShape(pptx.ShapeType.rect, {
        x: 8.0,
        y: cardY,
        w: 0.12,
        h: cardH,
        fill: { color: stripColor },
        line: { color: stripColor, width: 0 },
      });
      slideAcc.addText(`${p.plantName} (${p.plantType})`, {
        x: 8.25,
        y: cardY + 0.06,
        w: 4.1,
        h: 0.26,
        fontSize: 10,
        bold: true,
        color: colors.primaryDark,
      });
      slideAcc.addText(diagnoseAccuracy(p.overall), {
        x: 8.25,
        y: cardY + 0.32,
        w: 4.1,
        h: cardH - 0.38,
        fontSize: 8.5,
        color: colors.textSecondary,
        valign: "top",
        lineSpacing: 11,
      });
    });

    slideAcc.addText(
      "Bias = Σ(gerçekleşen − tahmin) / Σ tahmin (pozitif: eksik tahmin) · WAPE = Σ|hata| / Σ gerçekleşen · " +
        "Tek yönlü pay = |Σ hata| / Σ|hata| · Eksik tahmin % = gerçekleşenin tahminden büyük olduğu saatlerin payı · Ölçekli WAPE, tahmin tek katsayıyla " +
        "(Σ gerçekleşen / Σ tahmin) çarpıldığında oluşur; katsayı aynı dönemden hesaplandığı için iyimser bir üst sınırdır.",
      { x: 0.8, y: 6.7, w: 11.7, h: 0.45, fontSize: 7.5, color: colors.textMuted, lineSpacing: 10 }
    );
  }

  // -------------------------------------------------------------
  // SLAYT 6: DSG NETLEŞTİRME ANALİZİ
  // -------------------------------------------------------------
  const netting = projectData.netting;
  if (netting?.portfolio) {
    const slideNet = pptx.addSlide();
    slideNet.background = { color: colors.slideBg };
    const np = netting.portfolio;

    const pctN = (v: number, digits = 1) =>
      `%${new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(v * 100)}`;
    const mwhN = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(v);

    slideNet.addText("Dengeden Sorumlu Grup (DSG) Netleştirme Analizi", {
      x: 0.8,
      y: 0.5,
      w: 11.7,
      h: 0.45,
      fontSize: 20,
      bold: true,
      color: colors.textPrimary,
    });
    slideNet.addText(
      "Santraller aynı grupta olsaydı aynı saatteki fazla ve eksik üretimler birbirini dengelerdi",
      { x: 0.8, y: 0.95, w: 11.7, h: 0.3, fontSize: 11, color: colors.textSecondary }
    );

    // Üst: 3 KPI kutusu
    const kpis = [
      { title: "Bağımsız Toplam Maliyet", value: formatTL(np.standaloneCost), color: colors.textPrimary },
      { title: "DSG İçinde Netleşmiş Maliyet", value: formatTL(np.nettedCost), color: colors.textPrimary },
      {
        title: "Netleştirme Faydası",
        value: `${formatTL(np.benefitTl)} (${pctN(np.benefitRatio)})`,
        color: colors.success,
      },
    ];
    kpis.forEach((kpi, idx) => {
      const x = 0.8 + idx * 3.95;
      slideNet.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.4,
        w: 3.75,
        h: 1.0,
        fill: { color: colors.cardBg },
        line: { color: idx === 2 ? colors.success : colors.border, width: 1 },
        rectRadius: 0.08,
      });
      slideNet.addText(kpi.title, {
        x: x + 0.2,
        y: 1.5,
        w: 3.35,
        h: 0.3,
        fontSize: 10,
        color: colors.textSecondary,
      });
      slideNet.addText(kpi.value, {
        x: x + 0.2,
        y: 1.85,
        w: 3.35,
        h: 0.4,
        fontSize: 16,
        bold: true,
        color: kpi.color,
      });
    });

    // Orta: Grup tablosu
    const head = (text: string, align: "left" | "right" = "right") => ({
      text,
      options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" }, align },
    });
    const groupRow = (g: NettingGroupResult) => {
      const fill = g.kind === "portfolio" ? { color: "F1F5F9" } : undefined;
      const bold = g.kind !== "pair";
      return [
        { text: g.label, options: { bold: true, color: colors.textPrimary, fill } },
        { text: formatTL(g.standaloneCost), options: { align: "right", bold, color: colors.textPrimary, fill } },
        { text: formatTL(g.nettedCost), options: { align: "right", bold, color: colors.textSecondary, fill } },
        { text: formatTL(g.benefitTl), options: { align: "right", bold: true, color: colors.success, fill } },
        { text: pctN(g.benefitRatio), options: { align: "right", bold: true, color: colors.success, fill } },
        {
          text: `${mwhN(g.grossImbalanceMwh)} → ${mwhN(g.netImbalanceMwh)}`,
          options: { align: "right", bold, color: colors.textSecondary, fill },
        },
      ];
    };

    // Teknoloji grubuyla aynı santralleri içeren çiftler (2 santralli gruplar) tekrar gösterilmez
    const groupKey = (g: NettingGroupResult) => [...g.plantNames].sort().join("|");
    const technologyKeys = new Set(netting.technologies.map(groupKey));
    const topPairs = netting.pairs.filter((p) => !technologyKeys.has(groupKey(p))).slice(0, 3);
    const netRows: any[][] = [
      [
        head("Grup", "left"),
        head("Bağımsız Maliyet"),
        head("Netleşmiş Maliyet"),
        head("Fayda"),
        head("Fayda %"),
        head("Dengesizlik MWh (Brüt → Net)"),
      ],
      groupRow(np),
      ...netting.technologies.map(groupRow),
      ...topPairs.map(groupRow),
    ];

    slideNet.addTable(netRows, {
      x: 0.8,
      y: 2.65,
      w: 11.7,
      colW: [2.4, 1.9, 1.9, 1.8, 1.2, 2.5],
      border: { pt: 0.5, color: "CBD5E1" },
      fontSize: 10,
      rowH: 0.34,
      autoPage: false,
    });

    // Alt: Yorum
    const bestPair = netting.pairs[0];
    const message =
      `Tüm santraller tek bir dengeden sorumlu grupta toplandığında yıllık dengesizlik maliyeti ` +
      `${formatTL(np.benefitTl)} (${pctN(np.benefitRatio)}) azalır; saatlerin ${pctN(np.offsettingHourShare, 0)} ` +
      `kadarında en az bir santral fazla, bir diğeri eksik üretmiştir.` +
      (bestPair
        ? ` En yüksek ikili fayda ${bestPair.label} arasındadır (${formatTL(bestPair.benefitTl)}).`
        : "");
    const messageY = 2.65 + netRows.length * 0.34 + 0.3;
    slideNet.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: messageY,
      w: 11.7,
      h: 0.8,
      fill: { color: "ECFDF5" },
      line: { color: colors.success, width: 1 },
      rectRadius: 0.08,
    });
    slideNet.addText(message, {
      x: 1.0,
      y: messageY + 0.08,
      w: 11.3,
      h: 0.64,
      fontSize: 10.5,
      color: colors.textPrimary,
      valign: "middle",
    });

    slideNet.addText(
      "Netleşmiş maliyet: grubun saatlik toplam tahmin ve gerçekleşeni aynı PTF / SMF / sistem yönü ve katsayılarla " +
        "uzlaştırılarak hesaplanır. Maliyetin grup üyeleri arasında paylaşımı DSG sözleşmesine bağlıdır ve modellenmemiştir.",
      { x: 0.8, y: 6.75, w: 11.7, h: 0.4, fontSize: 7.5, color: colors.textMuted }
    );
  }

  const allocation = projectData.dsgAllocation;
  if (allocation && allocation.length > 0 && allocation[0].shares.length >= 2) {
    const slideAlloc = pptx.addSlide();
    slideAlloc.background = { color: colors.slideBg };
    const pctA = (v: number) =>
      `${v < 0 ? "−" : ""}%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.abs(v) * 100)}`;

    slideAlloc.addText("DSG Faydasının Paylaştırılması", {
      x: 0.8,
      y: 0.5,
      w: 11.7,
      h: 0.45,
      fontSize: 20,
      bold: true,
      color: colors.textPrimary,
    });
    slideAlloc.addText(
      "Tüm santraller tek grupta: her santralin grup içinde ödeyeceği maliyet ve tek başına kalmaya göre indirimi",
      { x: 0.8, y: 0.95, w: 11.7, h: 0.3, fontSize: 11, color: colors.textSecondary }
    );

    const head = (text: string, align: "left" | "right" = "right") => ({
      text,
      options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" }, align },
    });
    const shares = allocation[0].shares;
    const rows: any[][] = [[head("Santral", "left"), head("Tek Başına"), ...allocation.map((m) => head(m.label))]];
    shares.forEach((share, i) => {
      rows.push([
        { text: share.plantName, options: { bold: true, color: colors.textPrimary } },
        { text: formatTL(share.standaloneCost), options: { align: "right", color: colors.textPrimary } },
        ...allocation.map((m) => ({
          text: `${formatTL(m.shares[i].allocatedCost)} (${pctA(m.shares[i].discountRatio)})`,
          options: { align: "right", color: m.shares[i].discountRatio < 0 ? colors.danger : colors.textPrimary },
        })),
      ]);
    });
    const totalStandalone = shares.reduce((s, x) => s + x.standaloneCost, 0);
    const totalAllocated = allocation[0].shares.reduce((s, x) => s + x.allocatedCost, 0);
    const totalFill = { color: "F1F5F9" };
    rows.push([
      { text: "Toplam", options: { bold: true, color: colors.textPrimary, fill: totalFill } },
      { text: formatTL(totalStandalone), options: { align: "right", bold: true, color: colors.textPrimary, fill: totalFill } },
      ...allocation.map(() => ({
        text: formatTL(totalAllocated),
        options: { align: "right", bold: true, color: colors.success, fill: totalFill },
      })),
    ]);
    slideAlloc.addTable(rows, {
      x: 0.8,
      y: 1.45,
      w: 11.7,
      colW: [2.1, 2.1, ...allocation.map(() => 7.5 / allocation.length)],
      border: { pt: 0.5, color: "CBD5E1" },
      fontSize: 10,
      rowH: 0.34,
      autoPage: false,
    });

    // Yöntem notları ve istikrar
    const notesY = 1.45 + rows.length * 0.34 + 0.3;
    allocation.forEach((m, i) => {
      const x = 0.8 + i * (11.7 / allocation.length);
      const w = 11.7 / allocation.length - 0.15;
      slideAlloc.addShape(pptx.ShapeType.roundRect, {
        x,
        y: notesY,
        w,
        h: 1.25,
        fill: { color: colors.cardBg },
        line: { color: m.unstableSubgroups.length ? colors.danger : colors.border, width: 1 },
        rectRadius: 0.08,
      });
      slideAlloc.addText(
        [
          { text: `${m.label}\n`, options: { bold: true, color: colors.textPrimary, fontSize: 10.5 } },
          { text: `${m.description}\n`, options: { color: colors.textSecondary, fontSize: 8.5 } },
          {
            text: m.unstableSubgroups.length
              ? `Ayrılmak isteyebilecek: ${m.unstableSubgroups.map((g) => g.join(" + ")).join("; ")}`
              : "İstikrarlı: hiçbir alt grup ayrılarak daha ucuza gelmez.",
            options: { bold: true, color: m.unstableSubgroups.length ? colors.danger : colors.success, fontSize: 8.5 },
          },
        ],
        { x: x + 0.12, y: notesY + 0.06, w: w - 0.24, h: 1.13, valign: "top" }
      );
    });

    const shapley = allocation.find((m) => m.id === "shapley");
    // Çok santralde tablo uzar; yorum kutusu dipnotla çakışacaksa çizilmez
    const fitsMessage = notesY + 1.45 + 0.75 <= 6.7;
    if (shapley && fitsMessage) {
      const sorted = [...shapley.shares].sort((a, b) => b.discountRatio - a.discountRatio);
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      const message =
        `Katkıya göre (Shapley) en yüksek indirim ${top.plantName} için ${pctA(top.discountRatio)}, en düşük ` +
        `${bottom.plantName} için ${pctA(bottom.discountRatio)}. Maliyet orantılı paylaştırmada her santral aynı ` +
        `oranda (${pctA(1 - totalAllocated / totalStandalone)}) indirim alır; seçilen yöntem, kimin gruba katılmak ` +
        `isteyeceğini doğrudan belirler.`;
      const msgY = notesY + 1.45;
      slideAlloc.addShape(pptx.ShapeType.roundRect, {
        x: 0.8,
        y: msgY,
        w: 11.7,
        h: 0.75,
        fill: { color: "ECFDF5" },
        line: { color: colors.success, width: 1 },
        rectRadius: 0.08,
      });
      slideAlloc.addText(message, {
        x: 1.0,
        y: msgY + 0.06,
        w: 11.3,
        h: 0.63,
        fontSize: 10.5,
        color: colors.textPrimary,
        valign: "middle",
      });
    }

    slideAlloc.addText(
      "Paylaştırma DSG sözleşmesiyle belirlenir; tablo seçenekleri karşılaştırır. İstikrar: herhangi bir alt grubun kendi " +
        "aralarında kuracağı grupta ödeyeceği maliyet, bu yöntemle ödeyeceği toplamdan düşükse o alt grup ayrılmak ister.",
      { x: 0.8, y: 6.75, w: 11.7, h: 0.4, fontSize: 7.5, color: colors.textMuted }
    );
  }

  // -------------------------------------------------------------
  // SLAYT 7: STRATEJİ VE AZALTIM ÖNERİLERİ
  // -------------------------------------------------------------
  const slide5 = pptx.addSlide();
  slide5.background = { color: colors.slideBg };

  slide5.addText("Stratejik Eylem Planı & Risk Azaltma Önerileri", {
    x: 0.8,
    y: 0.5,
    w: 10,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: colors.textPrimary,
  });
  slide5.addText(
    "Kural tabanlı içgörü motoru tarafından santral dinamiklerine göre üretilen somut aksiyonlar",
    {
      x: 0.8,
      y: 0.95,
      w: 10,
      h: 0.3,
      fontSize: 11,
      color: colors.textSecondary,
    }
  );

  // Santrallerin önerilerini topla (En kritik 3-4 öneri)
  const allSuggestions: Array<MitigationSuggestion & { plantName: string }> = [];
  if (insightsData?.plantInsights) {
    insightsData.plantInsights.forEach((pi) => {
      pi.suggestions.forEach((s) => {
        allSuggestions.push({ ...s, plantName: pi.plantName });
      });
    });
  }

  // Sıralama: geçmiş veride tasarruf sağlayanlar (büyükten küçüğe) → etkisi bilinmeyenler (önceliğe göre).
  // Geçmişte maliyeti artıran öneriler sunuma alınmaz.
  const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };
  const topSuggestions = allSuggestions
    .filter((s) => s.recommended !== false)
    .sort(
      (a, b) =>
        (a.recommended === true ? 0 : 1) - (b.recommended === true ? 0 : 1) ||
        (b.impact?.savingTl ?? 0) - (a.impact?.savingTl ?? 0) ||
        (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4)
    )
    .slice(0, 3);

  if (topSuggestions.length === 0) {
    slide5.addText("Mevcut veri seti için kritik bir strateji uyarısı bulunmamaktadır.", {
      x: 1.0,
      y: 3.0,
      w: 11.0,
      h: 1.0,
      fontSize: 14,
      color: colors.textSecondary,
    });
  } else {
    topSuggestions.forEach((sugg, idx) => {
      const cardY = 1.4 + idx * 1.75;

      slide5.addShape(pptx.ShapeType.roundRect, {
        x: 0.8,
        y: cardY,
        w: 11.7,
        h: 1.62,
        fill: { color: colors.cardBg },
        line: { color: colors.border, width: 1 },
        rectRadius: 0.1,
      });

      // Sol Şerit (Öncelik Rengi)
      const stripColor =
        sugg.priority === "HIGH"
          ? colors.danger
          : sugg.priority === "MEDIUM"
            ? colors.warning
            : colors.primary;

      slide5.addShape(pptx.ShapeType.rect, {
        x: 0.8,
        y: cardY,
        w: 0.15,
        h: 1.62,
        fill: { color: stripColor },
        line: { color: stripColor, width: 0 },
      });

      // Başlık & Etiketler
      slide5.addText(
        [
          { text: `[${sugg.plantName}] `, options: { bold: true, color: colors.primaryDark } },
          { text: sugg.title, options: { bold: true, color: colors.textPrimary } },
        ],
        {
          x: 1.1,
          y: cardY + 0.12,
          w: 8.5,
          h: 0.3,
          fontSize: 12,
        }
      );

      // Öncelik Rozeti
      slide5.addShape(pptx.ShapeType.roundRect, {
        x: 10.4,
        y: cardY + 0.12,
        w: 1.9,
        h: 0.28,
        fill: { color: sugg.priority === "HIGH" ? "FEE2E2" : "FEF3C7" },
        line: { type: "none" },
        rectRadius: 0.05,
      });
      slide5.addText(`ÖNCELİK: ${{ HIGH: "YÜKSEK", MEDIUM: "ORTA", LOW: "DÜŞÜK" }[sugg.priority]}`, {
        x: 10.4,
        y: cardY + 0.12,
        w: 1.9,
        h: 0.28,
        fontSize: 9,
        bold: true,
        align: "center",
        valign: "middle",
        color: sugg.priority === "HIGH" ? colors.danger : colors.warning,
      });

      // Tetikleyici & Açıklama
      slide5.addText(
        [
          { text: "Neden: ", options: { bold: true, color: colors.textSecondary } },
          { text: `${sugg.triggerRule} `, options: { color: colors.textSecondary } },
          { text: sugg.description, options: { color: colors.textSecondary } },
        ],
        {
          x: 1.1,
          y: cardY + 0.45,
          w: 11.2,
          h: 0.5,
          fontSize: 9.5,
          lineSpacing: 13,
        }
      );

      // Aksiyon Maddeleri & Beklenen Etki
      const actionBullets = sugg.actionItems.slice(0, 2).map((a) => `• ${a}`).join("   ");
      slide5.addText(
        [
          { text: "Aksiyonlar: ", options: { bold: true, color: colors.textPrimary } },
          { text: `${actionBullets}   `, options: { color: colors.textPrimary } },
          {
            text: "| Simülasyon: ",
            options: { bold: true, color: sugg.impact ? colors.success : colors.textSecondary },
          },
          {
            text: sugg.expectedImpact,
            options: { bold: true, color: sugg.impact ? colors.success : colors.textSecondary },
          },
        ],
        {
          x: 1.1,
          y: cardY + 1.05,
          w: 11.2,
          h: 0.45,
          fontSize: 9,
        }
      );
    });
  }

  // -------------------------------------------------------------
  // SLAYT 8: SONUÇ & UYGULAMA YOL HARİTASI
  // -------------------------------------------------------------
  const slide6 = pptx.addSlide();
  slide6.background = { color: colors.slideBg };

  slide6.addText("Uygulama Yol Haritası & İzleme", {
    x: 0.8,
    y: 0.5,
    w: 10,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: colors.textPrimary,
  });
  slide6.addText("Dengesizlik kayıplarını minimize etmek için aşamalı devreye alma takvimi", {
    x: 0.8,
    y: 0.95,
    w: 10,
    h: 0.3,
    fontSize: 11,
    color: colors.textSecondary,
  });

  const roadmapPhases = [
    {
      phase: "AŞAMA 1 (1 - 2 Hafta)",
      title: "Hızlı Kazanımlar & Operasyonel Müdahale",
      items: [
        "En yüksek maliyetli saat dilimlerinde (özellikle sabah/akşam geçişleri) KGÖP tekliflerine güvenlik tolerans marjı uygulanması.",
        "Sistemin enerji açığı verme olasılığının yüksek olduğu pik saatlerde negatif dengesizlik riskini sıfırlayan ihtiyatlı tahmin profili.",
        "Gün İçi Piyasası (GİP) kapı kapanışına kadar son gerçekleşmelere göre ters yönlü pozisyon kapama disiplini.",
      ],
      color: colors.primary,
    },
    {
      phase: "AŞAMA 2 (1 - 3 Ay)",
      title: "Model Kalibrasyonu & Telemetri",
      items: [
        "Sayısal Hava Tahmin (NWP) modellerinin 6 saatlik yenilenme periyodundan saatlik yenilenen yüksek çözünürlüklü modellere geçirilmesi.",
        "RES türbin anemometre ve GES ışınım sensörü verilerinin SCADA üzerinden otomatik tahmin motoruna beslenmesi.",
        "Sistematik yanlılık (bias) gösteren santrallerde dinamik kaydırma faktörü (offset calibration) devreye alınması.",
      ],
      color: colors.warning,
    },
    {
      phase: "AŞAMA 3 (Çeyreklik / Sürekli)",
      title: "Portföy Birleştirme & Optimizasyon",
      items: [
        "Farklı üretim profiline sahip RES, HES ve GES santrallerinin tek dengeleme grubu altında toplanarak iç dengeleme tasarrufu sağlanması.",
        "Dengeleme maliyeti yüksek santrallerin portföy risk katsayılarının revize edilmesi.",
        "Aylık ve yıllık gerçekleşmeler üzerinden birim dengesizlik maliyetinin düzenli KPI olarak takip edilmesi.",
      ],
      color: colors.success,
    },
  ];

  const colW = 3.75;
  const colGap = 0.22;
  roadmapPhases.forEach((phase, idx) => {
    const colX = 0.8 + idx * (colW + colGap);

    slide6.addShape(pptx.ShapeType.roundRect, {
      x: colX,
      y: 1.4,
      w: colW,
      h: 5.1,
      fill: { color: colors.cardBg },
      line: { color: colors.border, width: 1 },
      rectRadius: 0.1,
    });

    // Üst Başlık Şeridi
    slide6.addShape(pptx.ShapeType.roundRect, {
      x: colX,
      y: 1.4,
      w: colW,
      h: 0.8,
      fill: { color: "1E293B" },
      line: { type: "none" },
      rectRadius: 0.1,
    });

    slide6.addText(phase.phase, {
      x: colX + 0.2,
      y: 1.45,
      w: colW - 0.4,
      h: 0.25,
      fontSize: 9,
      bold: true,
      color: colors.accentCyan,
    });

    slide6.addText(phase.title, {
      x: colX + 0.2,
      y: 1.7,
      w: colW - 0.4,
      h: 0.45,
      fontSize: 11,
      bold: true,
      color: "#FFFFFF",
    });

    // Maddeler
    let itemY = 2.4;
    phase.items.forEach((item) => {
      slide6.addText(`✔ ${item}`, {
        x: colX + 0.2,
        y: itemY,
        w: colW - 0.4,
        h: 1.15,
        fontSize: 9.5,
        color: colors.textPrimary,
        lineSpacing: 14,
      });
      itemY += 1.25;
    });
  });

  // Sunum Buffer Olarak Döndür
  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return buffer;
}
