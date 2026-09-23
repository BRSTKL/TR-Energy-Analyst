"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Flame,
  Layers,
  Lightbulb,
  PlusCircle,
  Presentation,
  Sun,
  Wind,
  Zap,
} from "lucide-react";
import { EpiasSyncDialog } from "@/components/epias-sync-dialog";

interface LatestProject {
  id: string;
  name: string;
  description?: string | null;
  plantCount: number;
  totalRecords: number;
  plants: Array<{ name: string; type: string }>;
}

/**
 * Veritabanındaki en son oluşturulan projeyi gösterir. Proje yoksa proje oluşturmaya yönlendirir.
 */
function LatestProjectBanner() {
  const [project, setProject] = useState<LatestProject | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setProject(json?.projects?.[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (project === undefined) {
    return <div className="h-24 animate-pulse rounded-xl border border-sky-100 bg-sky-50/60" />;
  }

  if (project === null) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Henüz proje yok. Üretim verinizi yüklemek için bir proje oluşturun.
        </p>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/projects">
            <Layers className="h-4 w-4" />
            Projelerim
          </Link>
        </Button>
      </div>
    );
  }

  const base = `/projects/${project.id}`;
  const summary =
    project.description ||
    `${project.plants.map((p) => `${p.name} (${p.type})`).join(", ")} santralleri`;

  return (
    <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 via-indigo-50 to-slate-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-sky-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              Son Proje
            </span>
            <h2 className="text-lg font-bold text-slate-900">{project.name}</h2>
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">{summary}</p>
          <p className="text-xs text-slate-500">
            {project.plantCount} santral · {project.totalRecords.toLocaleString("tr-TR")} saatlik kayıt
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700">
            <Link href={`${base}/results`}>
              <Activity className="h-4 w-4" />
              Sonuç Raporu
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
            <Link href={`${base}/insights`}>
              <Lightbulb className="h-4 w-4" />
              Stratejik İçgörüler
            </Link>
          </Button>
          <a href={`/api${base}/export/excel`} download>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              Excel (.xlsx)
            </Button>
          </a>
          <a href={`/api${base}/export/pptx`} download>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-600 text-amber-700 hover:bg-amber-50"
            >
              <Presentation className="h-3.5 w-3.5 text-amber-600" />
              PPT (.pptx)
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Örnek başlangıç verileri
  const sampleData = [
    {
      hour: "09:00",
      plant: "Ege RES-1 (45 MW)",
      type: "RES",
      forecast: 32.5,
      actual: 28.0,
      imbalance: -4.5,
      ptf: 2850,
      smf: 3200,
      direction: "ENERGY_DEFICIT",
      cost: -14832,
    },
    {
      hour: "10:00",
      plant: "İç Anadolu GES-2 (20 MW)",
      type: "GES",
      forecast: 15.0,
      actual: 17.2,
      imbalance: 2.2,
      ptf: 2700,
      smf: 2400,
      direction: "ENERGY_SURPLUS",
      cost: 5121,
    },
    {
      hour: "11:00",
      plant: "Fırat HES-4 (120 MW)",
      type: "HES",
      forecast: 80.0,
      actual: 80.0,
      imbalance: 0.0,
      ptf: 2600,
      smf: 2600,
      direction: "IN_BALANCE",
      cost: 0,
    },
    {
      hour: "12:00",
      plant: "Ege RES-1 (45 MW)",
      type: "RES",
      forecast: 30.0,
      actual: 36.5,
      imbalance: 6.5,
      ptf: 2500,
      smf: 2900,
      direction: "ENERGY_DEFICIT",
      cost: 15762,
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50/50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header Bar */}
        <div className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
                <Zap className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                TR-Energy Analyst
              </h1>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
              Enerji üreticilerinin (RES/HES/GES) gün öncesi üretim tahmini ile
              gerçekleşen üretimi kıyaslayarak dengesizlik maliyetini hesaplayan, piyasa
              verileriyle (PTF/SMF/Sistem Yönü) ilişkilendirip strateji önerisi üreten
              analiz aracı.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Dialog Trigger */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Yeni Santral / Analiz Ekle
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Yeni Santral Verisi Tanımla</DialogTitle>
                  <DialogDescription>
                    RES, HES veya GES santralinizin tahmin ve gerçekleşen üretimlerini
                    sisteme dahil edin.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Santral Adı
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: Marmara RES-3"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Santral Türü
                    </label>
                    <select className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="RES">RES (Rüzgar Enerjisi)</option>
                      <option value="HES">HES (Hidroelektrik)</option>
                      <option value="GES">GES (Güneş Enerjisi)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Kurulu Güç (MW)
                    </label>
                    <input
                      type="number"
                      placeholder="50"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    İptal
                  </Button>
                  <Button onClick={() => setDialogOpen(false)}>Kaydet</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <EpiasSyncDialog />

            <Button asChild variant="default" className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
              <Link href="/projects">
                <Layers className="h-4 w-4" />
                Projelerim
              </Link>
            </Button>

            <Button variant="outline" className="gap-2 text-slate-700">
              <Database className="h-4 w-4" />
              SQLite Dev DB
            </Button>
          </div>
        </div>

        {/* Son Proje (veritabanından) */}
        <LatestProjectBanner />

        {/* Aşağıdaki göstergeler ve tablo sabit örnek veridir */}
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="rounded bg-amber-500 px-1.5 py-0.5 font-semibold text-white">Örnek</span>
          Aşağıdaki göstergeler ve saatlik tablo, uygulamanın hesaplama mantığını tanıtan statik örnek
          verilerdir; hiçbir projeye ait değildir. Gerçek sonuçlar için proje raporlarını açın.
        </div>

        {/* Top Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Ağırlıklı Ortalama PTF
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2,662.50 ₺</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Gün Öncesi Piyasası (GÖP)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Ağırlıklı Ortalama SMF
              </CardTitle>
              <Flame className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2,775.00 ₺</div>
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                <ArrowUpRight className="h-3 w-3" /> SMF &gt; PTF (Enerji Açığı Eğilimi)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Net Portföy Dengesizliği
              </CardTitle>
              <ArrowDownRight className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+4.20 MWh</div>
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                Pozitif Dengesizlik (Net Fazla)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Tahmini Dengesizlik Bakiyesi
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">+6,051.00 ₺</div>
              <p className="mt-1 text-xs text-muted-foreground">Net Uzlaştırma Alacağı</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="overview">Dengesizlik Tablosu</TabsTrigger>
            <TabsTrigger value="strategy">Strateji Tavsiyeleri</TabsTrigger>
            <TabsTrigger value="architecture">Sistem Mimarisi</TabsTrigger>
          </TabsList>

          {/* Tab 1: Table */}
          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Saatlik Tahmin vs. Gerçekleşen Üretim Analizi</CardTitle>
                <CardDescription>
                  RES, HES ve GES santrallerinin gün öncesi KGÖP bildirimleri ile EPİAŞ
                  uzlaştırma simülasyonu.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Saat</TableHead>
                      <TableHead>Santral</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead className="text-right">Tahmin (MWh)</TableHead>
                      <TableHead className="text-right">Gerçekleşen (MWh)</TableHead>
                      <TableHead className="text-right">Dengesizlik</TableHead>
                      <TableHead className="text-right">PTF (₺)</TableHead>
                      <TableHead className="text-right">SMF (₺)</TableHead>
                      <TableHead>Sistem Yönü</TableHead>
                      <TableHead className="text-right">Dengesizlik Tutarı (₺)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sampleData.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{row.hour}</TableCell>
                        <TableCell>{row.plant}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              row.type === "RES"
                                ? "bg-cyan-100 text-cyan-800"
                                : row.type === "GES"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {row.type === "RES" && <Wind className="h-3 w-3" />}
                            {row.type === "GES" && <Sun className="h-3 w-3" />}
                            {row.type === "HES" && <Zap className="h-3 w-3" />}
                            {row.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.forecast.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.actual.toFixed(1)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono font-medium ${
                            row.imbalance > 0
                              ? "text-emerald-600"
                              : row.imbalance < 0
                                ? "text-rose-600"
                                : "text-slate-500"
                          }`}
                        >
                          {row.imbalance > 0 ? `+${row.imbalance}` : row.imbalance} MWh
                        </TableCell>
                        <TableCell className="text-right font-mono">{row.ptf}</TableCell>
                        <TableCell className="text-right font-mono">{row.smf}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                              row.direction === "ENERGY_DEFICIT"
                                ? "bg-rose-100 text-rose-700"
                                : row.direction === "ENERGY_SURPLUS"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {row.direction === "ENERGY_DEFICIT"
                              ? "Enerji Açığı"
                              : row.direction === "ENERGY_SURPLUS"
                                ? "Enerji Fazlası"
                                : "Dengede"}
                          </span>
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono font-semibold ${
                            row.cost > 0
                              ? "text-emerald-600"
                              : row.cost < 0
                                ? "text-rose-600"
                                : "text-slate-500"
                          }`}
                        >
                          {row.cost > 0
                            ? `+${row.cost.toLocaleString("tr-TR")}`
                            : row.cost.toLocaleString("tr-TR")}{" "}
                          ₺
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Strategy */}
          <TabsContent value="strategy" className="mt-4">
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="border-cyan-200">
                <CardHeader>
                  <div className="flex items-center gap-2 text-cyan-700">
                    <Wind className="h-5 w-5" />
                    <CardTitle className="text-lg">RES (Rüzgar) Stratejisi</CardTitle>
                  </div>
                  <CardDescription>
                    Rüzgar tahmin sapmalarına karşı pozisyon alma
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p>
                      Sistem enerji açığında iken eksik üretim cezası (Max(PTF, SMF)) çok
                      yüksektir.
                    </p>
                  </div>
                  <div className="rounded-md bg-cyan-50 p-3 text-xs text-cyan-900">
                    <strong>Öneri:</strong> Tahmin modellerinde %5 güvenlik marjı
                    uygulayın ve son 2 saatte GİP üzerinden ters pozisyon alın.
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200">
                <CardHeader>
                  <div className="flex items-center gap-2 text-blue-700">
                    <Zap className="h-5 w-5" />
                    <CardTitle className="text-lg">
                      HES (Hidroelektrik) Stratejisi
                    </CardTitle>
                  </div>
                  <CardDescription>
                    Depolamalı santraller için pik fiyat arbitrajı
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <p>
                      Barajlı santraller sistem marjinal fiyatına hızlı reaksiyon
                      verebilir.
                    </p>
                  </div>
                  <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-900">
                    <strong>Öneri:</strong> SMF yüksek saatlerde DGP YAL teklifleri
                    vererek ek marj sağlayın.
                  </div>
                </CardContent>
              </Card>

              <Card className="border-amber-200">
                <CardHeader>
                  <div className="flex items-center gap-2 text-amber-700">
                    <Sun className="h-5 w-5" />
                    <CardTitle className="text-lg">GES (Güneş) Stratejisi</CardTitle>
                  </div>
                  <CardDescription>
                    Radyasyon ve bulutluluk faktörlerinin optimizasyonu
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-2">
                    <Activity className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p>
                      Öğle saatlerinde güneş santralleri kaynaklı sistem fazlası ve
                      negatif fiyat baskısı oluşabilir.
                    </p>
                  </div>
                  <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                    <strong>Öneri:</strong> Sabah ve akşam geçiş saatlerinde tahminleri
                    muhafazakar tutun.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab 3: Architecture */}
          <TabsContent value="architecture" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Kurulu Altyapı ve Teknoloji Yığını</CardTitle>
                <CardDescription>
                  TR-Energy Analyst projesinin katmanları ve yapılandırması
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-700">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border bg-white p-4">
                    <h4 className="font-semibold text-slate-900">
                      Next.js 14 App Router
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      TypeScript, React Server Components ve optimize edilmiş layout
                      yapısı.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-white p-4">
                    <h4 className="font-semibold text-slate-900">
                      Tailwind CSS &amp; shadcn/ui
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Button, Card, Table, Dialog, Tabs bileşenleri ile modern arayüz.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-white p-4">
                    <h4 className="font-semibold text-slate-900">
                      Prisma ORM (SQLite / Postgres)
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Geliştirme için hafif SQLite, üretimde Postgres geçişine hazır
                      `.env` mimarisi.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-white p-4">
                    <h4 className="font-semibold text-slate-900">
                      Vitest Test Altyapısı
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      EPİAŞ formülleri, sistem yönü tespiti ve strateji motoru test
                      paketi.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-white p-4">
                    <h4 className="font-semibold text-slate-900">Kod Kalitesi</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      ESLint ve Prettier ile tutarlı, temiz kod standardı.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-white p-4">
                    <h4 className="font-semibold text-slate-900">Modüler Mimari</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      /lib/calculations, /lib/parsers, /lib/strategy, /components dizin
                      ayrımı.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
