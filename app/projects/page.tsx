"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  AlertCircle,
  ArrowLeft,
  Calendar,
  Database,
  FileSpreadsheet,
  FolderPlus,
  Layers,
  Lightbulb,
  Presentation,
  RefreshCw,
  Sun,
  Trash2,
  UploadCloud,
  Wind,
  Zap,
  CloudDownload,
} from "lucide-react";

import { PricingProfileDialog } from "@/components/pricing-profile-dialog";
import { EpiasSyncDialog } from "@/components/epias-sync-dialog";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { EpiasPlantPicker } from "@/components/epias-plant-picker";
import type { EpiasPowerPlant } from "@/lib/epias-plant/plant-data";
import { ImbalancePricingProfile } from "@/lib/calculations/types";

interface PlantSummary {
  id: string;
  name: string;
  type: string;
  capacityMw: number;
  recordCount: number;
}

interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  plantCount: number;
  totalCapacityMw: number;
  totalRecords: number;
  plantTypes: string[];
  pricingProfile?: ImbalancePricingProfile | null;
  plants: PlantSummary[];
}

interface PlantDraft {
  name: string;
  type: string;
  /** Formda serbest giriş (boş veya "12,5" olabilir); gönderirken sayıya çevrilir */
  capacityMw: string;
}

const MAX_PLANTS = 20;

const emptyPlant = (): PlantDraft => ({ name: "", type: "RES", capacityMw: "" });

/** Her satır için hata mesajı (yoksa null): ad zorunlu ve proje içinde benzersiz, kurulu güç > 0 */
function validatePlantDrafts(plants: PlantDraft[]): Array<string | null> {
  const key = (n: string) => n.trim().toLocaleLowerCase("tr-TR");
  return plants.map((p, i) => {
    if (!p.name.trim()) return "Santral adı zorunlu.";
    if (plants.some((o, j) => j !== i && key(o.name) === key(p.name))) return "Bu ad başka bir santralde kullanılıyor.";
    const mw = Number(p.capacityMw.replace(",", "."));
    if (!p.capacityMw.trim() || !Number.isFinite(mw) || mw <= 0) return "Kurulu güç 0'dan büyük bir sayı olmalı.";
    return null;
  });
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Yeni Proje Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [newPlants, setNewPlants] = useState<PlantDraft[]>([emptyPlant()]);
  /** Santraller EPİAŞ'tan seçilip verisi otomatik çekilir mi, yoksa elle tanımlanıp dosyadan mı yüklenir */
  const [plantSource, setPlantSource] = useState<"epias" | "manual">("epias");
  const [epiasPlants, setEpiasPlants] = useState<EpiasPowerPlant[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Projeler yüklenemedi.");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Proje listesi alınamadı.");
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const setPlantCount = (count: number) => {
    const n = Math.min(MAX_PLANTS, Math.max(1, Math.floor(count) || 1));
    setNewPlants((prev) =>
      prev.length >= n ? prev.slice(0, n) : [...prev, ...Array.from({ length: n - prev.length }, emptyPlant)]
    );
  };

  const updatePlant = (index: number, patch: Partial<PlantDraft>) => {
    setNewPlants((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const handleRemovePlantRow = (index: number) => {
    setNewPlants((prev) => prev.filter((_, i) => i !== index));
  };

  const plantErrors = validatePlantDrafts(newPlants);
  const formValid =
    projectName.trim().length > 0 &&
    (plantSource === "epias" ? epiasPlants.length > 0 : plantErrors.every((e) => e === null));

  const resetForm = () => {
    setProjectName("");
    setProjectDesc("");
    setNewPlants([emptyPlant()]);
    setEpiasPlants([]);
    setFormError(null);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;

    if (plantSource === "epias") {
      // Veri çekme ve kontrol EPİAŞ sayfasında yapılır; proje, veriler doğrulandıktan sonra oluşturulur
      const q = new URLSearchParams({
        name: projectName.trim(),
        desc: projectDesc.trim(),
        ids: epiasPlants.map((p) => p.id).join(","),
      });
      setDialogOpen(false);
      resetForm();
      router.push(`/projects/epias?${q.toString()}`);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDesc.trim(),
          plants: newPlants.map((p) => ({
            name: p.name.trim(),
            type: p.type,
            capacityMw: Number(p.capacityMw.replace(",", ".")),
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Proje oluşturulamadı.");

      setDialogOpen(false);
      resetForm();
      // Santraller tanımlandı; sıradaki adım üretim dosyasının kolonlarını eşleştirmek
      router.push(`/projects/${json.project.id}/import`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kayıt sırasında bir hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  };

  // İstatistikler
  const totalProjects = projects.length;
  const totalPlants = projects.reduce((sum, p) => sum + p.plantCount, 0);
  const totalCapacity = projects.reduce((sum, p) => sum + p.totalCapacityMw, 0);
  const totalRecords = projects.reduce((sum, p) => sum + p.totalRecords, 0);

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* Header */}
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
              <span className="text-xs font-medium text-slate-700">Projelerim</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Analiz Projelerim
            </h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              Farklı santral portföylerinizi ve analiz oturumlarınızı yönetin, sonuçları inceleyin veya rapor indirin.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <EpiasSyncDialog onSyncSuccess={fetchProjects} />

            <Button variant="outline" size="sm" onClick={fetchProjects} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Yenile
            </Button>

            <Button asChild variant="outline" size="sm" className="gap-1.5 border-sky-300 text-sky-800 hover:bg-sky-50">
              <Link href="/projects/epias">
                <CloudDownload className="h-4 w-4" />
                EPİAŞ&apos;tan santral analiz et
              </Link>
            </Button>

            {/* Yeni Proje Ekle Dialog */}
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90">
                  <FolderPlus className="h-4 w-4" />
                  Yeni Proje Oluştur
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <form onSubmit={handleCreateProject}>
                  <DialogHeader>
                    <DialogTitle>Yeni Analiz Projesi Oluştur</DialogTitle>
                    <DialogDescription>
                      Birden fazla santral içeren yeni bir analiz oturumu tanımlayın.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 py-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Proje Adı *
                      </label>
                      <input
                        type="text"
                        required
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="Örn: 2026 Hibrit Dengeleme Grubu"
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Açıklama / Kapsam
                      </label>
                      <input
                        type="text"
                        value={projectDesc}
                        onChange={(e) => setProjectDesc(e.target.value)}
                        placeholder="Örn: RES ve GES santralleri portföy optimizasyonu"
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Santrallerin kaynağı */}
                    <div className="space-y-2 pt-2">
                      <label className="text-xs font-semibold text-slate-700">Santraller *</label>
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Santraller nasıl eklensin">
                        {(
                          [
                            ["epias", "EPİAŞ'tan seç (veri otomatik)"],
                            ["manual", "Elle tanımla (dosya yükleyeceğim)"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={plantSource === value}
                            onClick={() => setPlantSource(value)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                              plantSource === value
                                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {plantSource === "epias" && (
                      <div className="space-y-1">
                        <p className="text-[11px] text-slate-500">
                          Santralleri adıyla arayıp tek tek ekleyin. Sonraki adımda dönemi seçip plan (KGÜP) ve
                          gerçekleşen üretimi (UEVM) EPİAŞ&apos;tan çekeceksiniz. Projeye daha sonra başka santral de
                          ekleyebilirsiniz.
                        </p>
                        <EpiasPlantPicker selected={epiasPlants} onChange={setEpiasPlants} compact />
                      </div>
                    )}

                    {/* Santraller */}
                    {plantSource === "manual" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-xs font-semibold text-slate-700">
                            Santral sayısı *
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={MAX_PLANTS}
                            value={newPlants.length}
                            onChange={(e) => setPlantCount(Number(e.target.value))}
                            className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Her santralin adını, türünü ve kurulu gücünü girin. Üretim dosyasını yüklerken
                          dosyadaki sayfa ve kolonları bu santrallerle eşleştireceksiniz.
                        </p>

                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                          {newPlants.map((plant, idx) => (
                            <div key={idx} className="rounded-md border bg-slate-50 p-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-5 text-right text-slate-400">{idx + 1}.</span>
                                <input
                                  type="text"
                                  value={plant.name}
                                  onChange={(e) => updatePlant(idx, { name: e.target.value })}
                                  placeholder="Santral adı (örn. Karaburun RES)"
                                  className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                                />
                                <select
                                  value={plant.type}
                                  onChange={(e) => updatePlant(idx, { type: e.target.value })}
                                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                                >
                                  <option value="RES">RES</option>
                                  <option value="HES">HES</option>
                                  <option value="GES">GES</option>
                                </select>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={plant.capacityMw}
                                  onChange={(e) => updatePlant(idx, { capacityMw: e.target.value })}
                                  placeholder="MW"
                                  className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                                />
                                {newPlants.length > 1 && (
                                  <button
                                    type="button"
                                    aria-label={`${idx + 1}. santrali kaldır`}
                                    onClick={() => handleRemovePlantRow(idx)}
                                    className="text-slate-400 hover:text-rose-500"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              {plantErrors[idx] && (plant.name || plant.capacityMw) && (
                                <p className="mt-1 pl-7 text-[11px] text-rose-600">{plantErrors[idx]}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {formError && (
                      <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                        {formError}
                      </p>
                    )}
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
                      İptal
                    </Button>
                    <Button type="submit" disabled={submitting || !formValid}>
                      {submitting
                        ? "Kaydediliyor..."
                        : plantSource === "epias"
                          ? `Devam: EPİAŞ'tan veri çek${epiasPlants.length ? ` (${epiasPlants.length} santral)` : ""}`
                          : "Projeyi Oluştur ve Veri Yükle"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 pt-8 sm:px-6 lg:px-8">
        {/* KPI Özet Kartları */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">
                Toplam Proje
              </CardTitle>
              <Layers className="h-4 w-4 text-sky-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{totalProjects}</div>
              <p className="mt-1 text-xs text-slate-500">Kayıtlı analiz oturumu</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">
                Kayıtlı Santraller
              </CardTitle>
              <Zap className="h-4 w-4 text-indigo-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{totalPlants} Adet</div>
              <p className="mt-1 text-xs text-slate-500">RES, GES ve HES portföyü</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">
                Toplam Kurulu Güç
              </CardTitle>
              <Sun className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {totalCapacity.toFixed(1)} MW
              </div>
              <p className="mt-1 text-xs text-slate-500">Aktif kurulu üretim kapasitesi</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">
                Saatlik Veri Noktası
              </CardTitle>
              <Database className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {totalRecords.toLocaleString("tr-TR")}
              </div>
              <p className="mt-1 text-xs text-slate-500">İşlenen saatlik uzlaştırma kaydı</p>
            </CardContent>
          </Card>
        </div>

        {/* Hata Durumu */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Boş Durum */}
        {!loading && projects.length === 0 && (
          <Card className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Henüz Proje Bulunmuyor</h3>
            <p className="mt-1 text-sm text-slate-500">
              Analiz yapmak ve dengesizlik maliyetlerini hesaplamak için ilk projenizi oluşturun.
            </p>
            <div className="mt-6">
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <FolderPlus className="h-4 w-4" />
                İlk Projenizi Oluşturun
              </Button>
            </div>
          </Card>
        )}

        {/* Projeler Kart Grid'i */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const formattedDate = new Date(project.createdAt).toLocaleDateString(
              "tr-TR",
              { year: "numeric", month: "long", day: "numeric" }
            );

            return (
              <Card
                key={project.id}
                className="flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-md"
              >
                <div>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formattedDate}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                        {project.totalRecords > 0
                          ? `${project.totalRecords} Kayıt`
                          : "Yeni Proje"}
                      </span>
                    </div>

                    <CardTitle className="mt-2 text-lg font-bold text-slate-900">
                      {project.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-xs text-slate-600">
                      {project.description || "Açıklama belirtilmemiş."}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Piyasa Profili Bilgisi */}
                    {project.pricingProfile && (
                      <div className="flex items-center justify-between rounded-md border border-indigo-100 bg-indigo-50/50 px-2.5 py-1 text-[11px] text-slate-700">
                        <span className="font-medium text-indigo-900 truncate">
                          {project.pricingProfile.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0">
                          +{project.pricingProfile.positiveSurplusCoef}/{project.pricingProfile.positiveOtherCoef} | -{project.pricingProfile.negativeDeficitCoef}/{project.pricingProfile.negativeOtherCoef}
                        </span>
                      </div>
                    )}

                    {/* Santral Listesi */}
                    <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                      <div className="text-[11px] font-semibold text-slate-500">
                        Santraller ({project.plantCount}) • Toplam {project.totalCapacityMw} MW
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {project.plants.map((pl) => (
                          <span
                            key={pl.id}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              pl.type === "RES"
                                ? "bg-cyan-100 text-cyan-800"
                                : pl.type === "GES"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {pl.type === "RES" && <Wind className="h-2.5 w-2.5" />}
                            {pl.type === "GES" && <Sun className="h-2.5 w-2.5" />}
                            {pl.type === "HES" && <Zap className="h-2.5 w-2.5" />}
                            {pl.name} ({pl.capacityMw} MW)
                          </span>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className="border-t bg-slate-50/40 p-4">
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        asChild
                        className="gap-1 bg-sky-600 hover:bg-sky-700"
                      >
                        <Link href={`/projects/${project.id}/results`}>
                          <Activity className="h-3.5 w-3.5" />
                          Sonuç Raporu
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        asChild
                        className="gap-1 bg-indigo-600 hover:bg-indigo-700"
                      >
                        <Link href={`/projects/${project.id}/insights`}>
                          <Lightbulb className="h-3.5 w-3.5" />
                          İçgörüler
                        </Link>
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`/api/projects/${project.id}/export/excel`}
                        download
                        className="w-full"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1 border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs"
                        >
                          <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
                          Excel (.xlsx)
                        </Button>
                      </a>
                      <a
                        href={`/api/projects/${project.id}/export/pptx`}
                        download
                        className="w-full"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1 border-amber-600 text-amber-700 hover:bg-amber-50 text-xs"
                        >
                          <Presentation className="h-3 w-3 text-amber-600" />
                          PPT (.pptx)
                        </Button>
                      </a>
                    </div>

                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 border-emerald-600 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold"
                    >
                      <Link href={`/projects/${project.id}/import`}>
                        <UploadCloud className="h-3.5 w-3.5 text-emerald-600" />
                        Üretim Verisi Yükle (.xlsx / .csv)
                      </Link>
                    </Button>

                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-slate-600 hover:text-slate-900 border border-slate-200"
                    >
                      <Link href={`/projects/${project.id}/plants`}>Santralleri Düzenle</Link>
                    </Button>

                    <PricingProfileDialog
                      projectId={project.id}
                      initialProfile={project.pricingProfile}
                      onProfileUpdated={() => fetchProjects()}
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-slate-600 hover:text-slate-900 border border-slate-200"
                        >
                          Piyasa Profili Ayarları
                        </Button>
                      }
                    />

                    <DeleteProjectDialog
                      projectId={project.id}
                      projectName={project.name}
                      plantCount={project.plantCount}
                      recordCount={project.totalRecords}
                      onDeleted={() => fetchProjects()}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
