"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, CloudDownload, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EpiasPlantPicker, plantDisplayName } from "@/components/epias-plant-picker";
import {
  deserializeSeries,
  detectTechnology,
  EpiasPowerPlant,
  HourlySeries,
  KGUP_VERSION_LABELS,
  KgupVersion,
  mergePlantSeries,
  PlantTechnology,
  SerializedSeries,
  suggestCapacityMw,
  sumSeries,
} from "@/lib/epias-plant/plant-data";
import { DateChunk, monthChunks } from "@/lib/date-chunks";

interface Uevcb {
  id: number;
  name: string;
  eic?: string | null;
}

interface PlantMeta {
  epiasPlantId: number;
  organizationId: number | null;
  organizationName: string | null;
  yekdem: boolean | null;
  yekdemNextYear: boolean | null;
}

interface ProjectOption {
  id: string;
  name: string;
  plantCount: number;
}

/** Bir santralin EPİAŞ çekim durumu */
interface PlantJob {
  /** Verinin çekildiği dönem ve KGÜP versiyonu ("başlangıç|bitiş|versiyon"); ayar değişirse yeniden çekilir */
  key: string;
  version: KgupVersion;
  uevcbs: Uevcb[];
  kgupParts: HourlySeries[];
  uevmParts: HourlySeries[];
  failed: Array<DateChunk & { error: string }>;
  error: string | null;
  running: boolean;
  /** Havuzdan okunan ve EPİAŞ'tan çekilip havuza eklenen ay sayısı */
  fromPool: number;
  fromEpias: number;
}

/** Kullanıcının düzenleyebildiği santral bilgileri (öneriler bir kez doldurulur, sonra ezilmez) */
interface PlantForm {
  name: string;
  type: PlantTechnology | "";
  capacity: string;
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const num = (v: number, d = 0) => v.toLocaleString("tr-TR", { maximumFractionDigits: d });

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  if (!d.success) throw new Error(d.error);
  return d as T;
}

function EpiasPlantImport() {
  const router = useRouter();
  const params = useSearchParams();
  const presetProjectId = params.get("projectId");

  // 1. Proje
  const [target, setTarget] = useState<"new" | "existing">(presetProjectId ? "existing" : "new");
  const [projectName, setProjectName] = useState(params.get("name") ?? "");
  const [description, setDescription] = useState(params.get("desc") ?? "");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [targetProjectId, setTargetProjectId] = useState(presetProjectId ?? "");

  // 2. Santraller
  const [selected, setSelected] = useState<EpiasPowerPlant[]>([]);
  const [presetError, setPresetError] = useState<string | null>(null);

  // 3. Dönem ve çekim
  const [startDay, setStartDay] = useState("2025-01-01");
  const [endDay, setEndDay] = useState("2025-12-31");
  const [kgupVersion, setKgupVersion] = useState<KgupVersion>("FIRST");
  const [jobs, setJobs] = useState<Record<number, PlantJob>>({});
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const datesTouched = useRef(false);

  // 4. Kontrol ve kayıt
  const [forms, setForms] = useState<Record<number, PlantForm>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [addedNotice, setAddedNotice] = useState<{ projectId: string } | null>(null);
  /** Santrallerin sahibi (şirket) ve YEKDEM durumu: dengesizlik şirket bazında uzlaştırılır */
  const [meta, setMeta] = useState<Record<number, PlantMeta>>({});
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        const list: ProjectOption[] = d.projects.map((p: ProjectOption) => ({ id: p.id, name: p.name, plantCount: p.plantCount }));
        setProjects(list);
        if (list.length > 0) setTargetProjectId((cur) => cur || list[0].id);
      })
      .catch(() => {});
  }, []);

  // Yeni proje penceresinde seçilen santraller (?ids=) listeye alınır
  useEffect(() => {
    const ids = params.get("ids");
    if (!ids) return;
    fetch(`/api/epias/plants?ids=${encodeURIComponent(ids)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setSelected(d.plants);
      })
      .catch((e) => setPresetError(e instanceof Error ? e.message : "Seçilen santraller yüklenemedi."));
  }, [params]);

  // Mevcut projeye eklerken dönem, projedeki üretim verisinin aralığıyla başlar (DSG ortak saatlere bakar)
  useEffect(() => {
    if (target !== "existing" || !targetProjectId || datesTouched.current) return;
    fetch(`/api/projects/${targetProjectId}`)
      .then((r) => r.json())
      .then((d) => {
        const range = d?.project?.dataRange;
        if (range && !datesTouched.current) {
          setStartDay(range.start);
          setEndDay(range.end);
        }
      })
      .catch(() => {});
  }, [target, targetProjectId]);

  const fetchKey = `${startDay}|${endDay}|${kgupVersion}`;

  const updateJob = (id: number, patch: Partial<PlantJob> | ((j: PlantJob) => Partial<PlantJob>)) =>
    setJobs((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) } };
    });

  /**
   * Santralin dönem verisi veri havuzundan gelir; havuzda eksik aylar sunucuda EPİAŞ'tan çekilip havuza yazılır
   * (PLAN 7.4). Başarısız aylar job.failed'e yazılır; tekrar deneme aynı çağrıdır (başarılı aylar havuzda kalır).
   */
  const fetchPlant = async (plant: EpiasPowerPlant) => {
    setJobs((prev) => ({
      ...prev,
      [plant.id]: {
        key: fetchKey, version: kgupVersion, uevcbs: prev[plant.id]?.uevcbs ?? [], kgupParts: [], uevmParts: [],
        failed: [], error: null, running: true, fromPool: 0, fromEpias: 0,
      },
    }));
    try {
      setProgress(`${plantDisplayName(plant)} · veri havuzu (eksik aylar EPİAŞ'tan)`);
      const d = await postJson<{
        uevcbs: Uevcb[];
        months: Array<{ year: number; month: number; source: "pool" | "epias" | "failed" | "future"; error?: string }>;
        kgup: SerializedSeries;
        uevm: SerializedSeries;
      }>("/api/pool/plant", { powerPlantId: plant.id, startDay, endDay, kgupVersion });
      const chunks = monthChunks(startDay, endDay);
      const chunkOf = (y: number, m: number) => chunks.find((c) => c.start.slice(0, 7) === `${y}-${String(m).padStart(2, "0")}`);
      const failed = d.months.flatMap((m) => {
        const c = m.source === "failed" ? chunkOf(m.year, m.month) : undefined;
        return c ? [{ ...c, error: m.error ?? "hata" }] : [];
      });
      updateJob(plant.id, {
        uevcbs: d.uevcbs,
        kgupParts: [deserializeSeries(d.kgup)],
        uevmParts: [deserializeSeries(d.uevm)],
        failed,
        running: false,
        fromPool: d.months.filter((m) => m.source === "pool").length,
        fromEpias: d.months.filter((m) => m.source === "epias").length,
      });
    } catch (e) {
      updateJob(plant.id, { error: e instanceof Error ? e.message : "Veri çekilemedi.", running: false });
    }
  };

  /** Seçili santrallerden bu dönem/versiyon için verisi olmayanları sırayla çeker */
  const fetchAll = async () => {
    setFetching(true);
    setAddedNotice(null);
    for (const p of selected) {
      if (jobs[p.id]?.key === fetchKey && !jobs[p.id].error) continue;
      await fetchPlant(p);
    }
    await loadMeta(selected.map((p) => p.id));
    setProgress(null);
    setFetching(false);
  };

  /** Sahip şirket ve YEKDEM durumu; ilk seferde EPİAŞ'taki tüm şirketler taranır (birkaç dakika sürebilir) */
  const loadMeta = async (ids: number[]) => {
    const missing = ids.filter((id) => !meta[id]);
    if (missing.length === 0) return;
    setProgress("Santrallerin sahibi ve YEKDEM durumu (ilk seferde birkaç dakika sürebilir)");
    try {
      const d = await postJson<{ items: PlantMeta[]; errors: string[] }>("/api/epias/plants/meta", {
        ids: missing,
        year: Number(startDay.slice(0, 4)),
        lastYear: Number(endDay.slice(0, 4)),
      });
      setMeta((prev) => ({ ...prev, ...Object.fromEntries(d.items.map((m) => [m.epiasPlantId, m])) }));
      setMetaError(d.errors.length ? d.errors.join(" ") : null);
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : "Santral sahibi bulunamadı.");
    }
  };

  const retryFailed = async (plant: EpiasPowerPlant) => {
    const job = jobs[plant.id];
    if (!job) return;
    setFetching(true);
    await fetchPlant(plant);
    setProgress(null);
    setFetching(false);
  };

  // Santral bazında birleştirilmiş seri, tür ve güç önerisi
  const merged = useMemo(() => {
    const out: Record<number, ReturnType<typeof buildMerged>> = {};
    for (const p of selected) {
      const j = jobs[p.id];
      if (j && !j.running && (j.kgupParts.length > 0 || j.uevmParts.length > 0)) out[p.id] = buildMerged(j, startDay, endDay);
    }
    return out;
  }, [selected, jobs, startDay, endDay]);

  // Kayıttan önce veri bütünlüğü: planı ve gerçekleşeni birlikte olan saatleri ayın %90'ından az olan santral-aylar.
  // Eksik ay hesaplardan sessizce düşer (santral maliyeti, portföy netleşmesi, sektör kıyası); kullanıcı görerek onaylar.
  const gapSummary = useMemo(
    () =>
      selected
        .map((p) => {
          const m = merged[p.id];
          const months = m ? m.series.coverage.filter((c) => c.hours > 0 && c.bothHours < c.hours * 0.9) : [];
          return { name: plantDisplayName(p), months };
        })
        .filter((g) => g.months.length > 0),
    [selected, merged]
  );
  const [gapsAcknowledged, setGapsAcknowledged] = useState(false);
  useEffect(() => setGapsAcknowledged(false), [gapSummary.length, fetchKey]);

  // Önerileri bir kez doldur; kullanıcı değiştirirse ezme
  useEffect(() => {
    setForms((prev) => {
      let next = prev;
      for (const p of selected) {
        const m = merged[p.id];
        const cur = prev[p.id] ?? { name: plantDisplayName(p), type: "", capacity: "" };
        const filled: PlantForm = {
          name: cur.name,
          type: cur.type || m?.tech.type || "",
          capacity: cur.capacity || (m && m.capacity > 0 ? String(m.capacity) : ""),
        };
        if (!prev[p.id] || filled.type !== cur.type || filled.capacity !== cur.capacity) next = { ...next, [p.id]: filled };
      }
      return next;
    });
  }, [selected, merged]);

  const setForm = (id: number, patch: Partial<PlantForm>) => setForms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const plantStatus = (p: EpiasPowerPlant): "none" | "stale" | "running" | "error" | "ready" => {
    const j = jobs[p.id];
    if (!j) return "none";
    if (j.running) return "running";
    if (j.key !== fetchKey) return "stale";
    const m = merged[p.id];
    if (j.error || !m || m.series.checks.some((c) => c.level === "error")) return "error";
    return "ready";
  };

  const allReady = selected.length > 0 && selected.every((p) => plantStatus(p) === "ready");
  const formsValid = selected.every((p) => {
    const f = forms[p.id];
    return f && f.name.trim() && f.type && Number(f.capacity.replace(",", ".")) > 0;
  });
  const needFetch = selected.some((p) => ["none", "stale", "error"].includes(plantStatus(p)));

  const save = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const d = await postJson<{ projectId: string; noOverlapWithExisting: boolean; added: boolean }>("/api/epias/plants/project", {
        ...(target === "existing" ? { targetProjectId } : { projectName, description }),
        plants: selected.map((p) => {
          const f = forms[p.id];
          const j = jobs[p.id];
          return {
            plantName: f.name,
            type: f.type,
            capacityMw: Number(f.capacity.replace(",", ".")),
            source: { powerPlantId: p.id, uevcbIds: j.uevcbs.map((u) => u.id), kgupVersion: j.version },
            meta: meta[p.id] ?? null,
            rows: merged[p.id].series.rows.map((r) => [r.timestamp.getTime(), r.forecastMwh, r.actualMwh]),
          };
        }),
      });
      if (d.added && d.noOverlapWithExisting) {
        // Ortak saat yoksa sonuç sayfasına geçmeden uyar: DSG analizi bu santralleri diğerleriyle birlikte göremez
        setAddedNotice({ projectId: d.projectId });
        setCreating(false);
        return;
      }
      router.push(`/projects/${d.projectId}/results`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setCreating(false);
    }
  };

  const targetProject = projects.find((p) => p.id === targetProjectId);

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <Link
            href={presetProjectId ? `/projects/${presetProjectId}/plants` : "/projects"}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-3 w-3" /> {presetProjectId ? "Santraller" : "Projelerim"}
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">EPİAŞ&apos;tan santral analizi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Santralleri adıyla arayıp seçin. Her birinin gün öncesi planı (KGÜP) ve gerçekleşen üretimi (UEVM) EPİAŞ
            Şeffaflık Platformu&apos;ndan çekilir, saat saat birleştirilir ve tek projede analiz edilir.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 pt-6 sm:px-6">
        {/* 1. Proje */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Proje</CardTitle>
            <CardDescription>
              Santraller yeni bir projeye ya da mevcut bir projeye eklenir. Aynı projedeki santraller portföy ve DSG
              (dengeden sorumlu grup) analizinde birlikte değerlendirilir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Santraller nereye kaydedilsin">
              {(
                [
                  ["new", "Yeni proje"],
                  ["existing", "Mevcut projeye ekle"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={target === value}
                  disabled={(value === "existing" && projects.length === 0) || creating}
                  onClick={() => setTarget(value)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                    target === value ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {target === "new" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Proje adı *
                  <input
                    className={`${inputClass} mt-1`}
                    value={projectName}
                    placeholder="Örn: Ege RES portföyü 2025"
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Açıklama / Kapsam
                  <input
                    className={`${inputClass} mt-1`}
                    value={description}
                    placeholder="Örn: RES ve GES santralleri portföy optimizasyonu"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <label className="block text-xs font-semibold text-slate-700 sm:max-w-md">
                Proje
                <select className={`${inputClass} mt-1`} value={targetProjectId} onChange={(e) => setTargetProjectId(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.plantCount} santral)
                    </option>
                  ))}
                </select>
              </label>
            )}
          </CardContent>
        </Card>

        {/* 2. Santraller */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2. Santraller</CardTitle>
            <CardDescription>
              İstediğiniz kadar santral ekleyin. Yalnızca EPİAŞ&apos;ın santral bazında üretim yayımladığı (lisanslı)
              santraller listelenir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {presetError && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {presetError}
              </div>
            )}
            <EpiasPlantPicker selected={selected} onChange={setSelected} disabled={fetching || creating} />
          </CardContent>
        </Card>

        {/* 3. Dönem ve çekim */}
        {selected.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3. Dönem ve veri</CardTitle>
              <CardDescription>
                Santraller sırayla, ay ay çekilir. Bağlantı koparsa yalnızca başarısız aylar tekrar denenir; daha önce
                çekilmiş santraller yeniden çekilmez.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <label className="block text-xs font-semibold text-slate-700">
                  Başlangıç
                  <input
                    type="date"
                    className={`${inputClass} mt-1`}
                    value={startDay}
                    disabled={fetching}
                    onChange={(e) => {
                      datesTouched.current = true;
                      setStartDay(e.target.value);
                    }}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Bitiş
                  <input
                    type="date"
                    className={`${inputClass} mt-1`}
                    value={endDay}
                    disabled={fetching}
                    onChange={(e) => {
                      datesTouched.current = true;
                      setEndDay(e.target.value);
                    }}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  KGÜP versiyonu
                  <select
                    className={`${inputClass} mt-1`}
                    value={kgupVersion}
                    disabled={fetching}
                    onChange={(e) => setKgupVersion(e.target.value as KgupVersion)}
                    title="İlk versiyon gün öncesi plandır ve sapma analizi için doğru olandır. Son versiyon gün içi düzeltmeleri içerir; hata olduğundan küçük görünür."
                  >
                    {(Object.keys(KGUP_VERSION_LABELS) as KgupVersion[]).map((v) => (
                      <option key={v} value={v}>
                        {KGUP_VERSION_LABELS[v]}
                        {v === "FIRST" ? " (önerilen)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  onClick={fetchAll}
                  disabled={fetching || creating || !needFetch || !startDay || !endDay || startDay > endDay}
                  className="gap-1.5 bg-sky-600 text-white hover:bg-sky-700"
                >
                  {fetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                  {fetching ? "Çekiliyor…" : needFetch ? "Verileri çek" : "Veriler hazır"}
                </Button>
              </div>
              {target === "existing" && targetProject && (
                <p className="text-xs text-slate-500">
                  Dönem, &quot;{targetProject.name}&quot; projesindeki üretim verisinin aralığıyla başladı; DSG analizi yalnızca
                  ortak saatlere bakar.
                </p>
              )}
              {progress && (
                <p className="flex items-center gap-2 text-xs text-sky-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* 4. Kontrol ve kayıt */}
        {selected.length > 0 && Object.keys(jobs).length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">4. Kontrol ve kayıt</CardTitle>
              <CardDescription>
                Her santralin verisini kontrol edin; ad, tür ve kurulu gücü gerekirse düzeltin.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selected.map((p) => (
                <PlantReview
                  key={p.id}
                  plant={p}
                  status={plantStatus(p)}
                  job={jobs[p.id]}
                  merged={merged[p.id]}
                  form={forms[p.id]}
                  meta={meta[p.id]}
                  onForm={(patch) => setForm(p.id, patch)}
                  onRetry={() => retryFailed(p)}
                  onRemove={() => setSelected((prev) => prev.filter((s) => s.id !== p.id))}
                  busy={fetching || creating}
                />
              ))}

              {metaError && (
                <p className="flex items-start gap-1.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Santral sahibi / YEKDEM bilgisi alınamadı: {metaError} Kayıt
                  yine yapılır; bilgiyi sonradan proje sayfasından güncelleyebilirsiniz.
                </p>
              )}
              {createError && (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {createError}
                </div>
              )}
              {addedNotice && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Santraller eklendi, ancak projedeki diğer santrallerle ortak saatleri yok. Portföy ve DSG analizleri
                    yalnızca ortak saatlere bakar; aynı dönemi çekip tekrar eklemeniz gerekebilir.{" "}
                    <Link href={`/projects/${addedNotice.projectId}/results`} className="font-semibold underline">
                      Yine de sonuçlara git
                    </Link>
                  </span>
                </div>
              )}
              {!allReady && !fetching && (
                <p className="text-xs text-slate-500">
                  Kaydetmek için tüm santrallerin verisi bu dönem için çekilmiş ve hatasız olmalı. Sorunlu santrali
                  tekrar deneyin ya da listeden çıkarın.
                </p>
              )}
              {allReady && gapSummary.length > 0 && (
                <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4" /> Eksik veri: bu aylar hesaplara girmeyecek
                  </p>
                  <ul className="list-disc pl-5">
                    {gapSummary.map((g) => (
                      <li key={g.name}>
                        {g.name}:{" "}
                        {g.months
                          .map((c) => `${c.month.slice(5)}.${c.month.slice(0, 4)} (${c.bothHours}/${c.hours} saat)`)
                          .join(", ")}
                      </li>
                    ))}
                  </ul>
                  <p>
                    Eksik ay santralin birim maliyetini, portföy netleşmesini ve sektör kıyasını etkiler. Dönemi değiştirip yeniden
                    çekebilir, santrali çıkarabilir ya da bilerek devam edebilirsiniz; rapor eksik ayları ayrıca belirtir.
                  </p>
                  <label className="flex items-center gap-1.5 font-medium">
                    <input type="checkbox" checked={gapsAcknowledged} onChange={(e) => setGapsAcknowledged(e.target.checked)} />
                    Eksik ayları gördüm, bu haliyle kaydet
                  </label>
                </div>
              )}
              <Button
                onClick={save}
                disabled={
                  creating ||
                  fetching ||
                  !allReady ||
                  (gapSummary.length > 0 && !gapsAcknowledged) ||
                  !formsValid ||
                  (target === "new" ? !projectName.trim() : !targetProjectId) ||
                  addedNotice !== null
                }
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {creating
                  ? "Kaydediliyor (eksik piyasa fiyatları da çekiliyor)…"
                  : target === "new"
                    ? `Projeyi oluştur ve analiz et (${selected.length} santral)`
                    : `Projeye ekle ve analiz et (${selected.length} santral)`}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function buildMerged(j: PlantJob, startDay: string, endDay: string) {
  const kgup = sumSeries(j.kgupParts);
  const uevm = sumSeries(j.uevmParts);
  return {
    series: mergePlantSeries(kgup, uevm, startDay, endDay),
    tech: detectTechnology(uevm.byFuel),
    capacity: suggestCapacityMw(uevm.values.values()),
    skipped: kgup.skipped + uevm.skipped,
  };
}

function PlantReview({
  plant,
  status,
  job,
  merged,
  form,
  meta,
  onForm,
  onRetry,
  onRemove,
  busy,
}: {
  plant: EpiasPowerPlant;
  status: "none" | "stale" | "running" | "error" | "ready";
  job?: PlantJob;
  merged?: ReturnType<typeof buildMerged>;
  form?: PlantForm;
  meta?: PlantMeta;
  onForm: (patch: Partial<PlantForm>) => void;
  onRetry: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const badge = {
    none: ["Çekilmedi", "bg-slate-100 text-slate-600"],
    stale: ["Dönem değişti, yeniden çekilecek", "bg-slate-100 text-slate-600"],
    running: ["Çekiliyor", "bg-sky-100 text-sky-800"],
    error: ["Sorun var", "bg-rose-100 text-rose-800"],
    ready: ["Hazır", "bg-emerald-100 text-emerald-800"],
  }[status];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{plantDisplayName(plant)}</span>
          <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${badge[1]}`}>{badge[0]}</span>
          {meta?.yekdem && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-2xs font-semibold text-violet-800">YEKDEM</span>}
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`${plantDisplayName(plant)} santralini listeden çıkar`}
          className="text-slate-400 hover:text-rose-500 disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {meta?.organizationName && <p className="mt-1 text-2xs text-slate-500">Sahibi: {meta.organizationName}</p>}
      {job?.error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {job.error}
        </p>
      )}
      {job && !job.running && job.failed.length > 0 && (
        <p className="mt-2 text-xs text-amber-800">
          {job.failed.length} ay çekilemedi: {job.failed.map((f) => f.label).join(", ")}. İlk hata: {job.failed[0].error}
        </p>
      )}
      {job && !job.running && (job.error || job.failed.length > 0) && (
        <Button size="sm" variant="outline" onClick={onRetry} disabled={busy} className="mt-2 gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Tekrar dene
        </Button>
      )}

      {merged && status !== "running" && (
        <>
          <p className="mt-2 text-xs text-slate-500">
            Plan (KGÜP) {num(merged.series.kgupTotalMwh)} MWh · Gerçekleşen (UEVM) {num(merged.series.uevmTotalMwh)} MWh ·
            Eşleşen saat {num(merged.series.rows.length)}
            {merged.skipped > 0 && ` · okunamayan kayıt ${num(merged.skipped)}`}
            {job && job.uevcbs.length > 0 && ` · UEVÇB: ${job.uevcbs.map((u) => u.name).join(", ")}`}
            {job && ` · KGÜP ${KGUP_VERSION_LABELS[job.version].toLocaleLowerCase("tr-TR")}`}
            {job && ` · Veri havuzu: ${job.fromPool} ay havuzdan${job.fromEpias > 0 ? `, ${job.fromEpias} ay EPİAŞ'tan eklendi` : ""}`}
          </p>
          <div className="mt-2 space-y-1">
            {merged.series.checks.map((c, i) => (
              <p
                key={i}
                className={`flex items-start gap-1.5 text-xs ${
                  c.level === "error" ? "text-rose-700" : c.level === "warning" ? "text-amber-800" : "text-emerald-700"
                }`}
              >
                {c.level === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                {c.message}
              </p>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {merged.series.coverage.map((m) => {
              const r = m.hours ? m.bothHours / m.hours : 0;
              return (
                <span
                  key={m.month}
                  title={`${m.month}: KGÜP ${m.kgupHours}, UEVM ${m.uevmHours}, eşleşen ${m.bothHours} / ${m.hours} saat`}
                  className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${
                    r >= 0.95 ? "bg-emerald-500 text-white" : r > 0 ? "bg-amber-400 text-amber-950" : "bg-rose-400 text-white"
                  }`}
                >
                  {m.month.slice(5)}.{m.month.slice(2, 4)}
                </span>
              );
            })}
          </div>
        </>
      )}

      {form && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <label className="block text-2xs font-semibold text-slate-600">
            Santral adı
            <input className={`${inputClass} mt-0.5`} value={form.name} disabled={busy} onChange={(e) => onForm({ name: e.target.value })} />
          </label>
          <label className="block text-2xs font-semibold text-slate-600">
            Tür{" "}
            {merged && (
              <span className="font-normal text-slate-500">
                {merged.tech.type ? "(UEVM'den)" : merged.tech.dominant ? "(karışık, seçin)" : "(seçin)"}
              </span>
            )}
            <select
              className={`${inputClass} mt-0.5`}
              value={form.type}
              disabled={busy}
              onChange={(e) => onForm({ type: e.target.value as PlantTechnology })}
            >
              <option value="">Seçin</option>
              <option value="RES">RES</option>
              <option value="HES">HES</option>
              <option value="GES">GES</option>
            </select>
          </label>
          <label className="block text-2xs font-semibold text-slate-600">
            Kurulu güç (MW)
            <input
              className={`${inputClass} mt-0.5`}
              inputMode="decimal"
              value={form.capacity}
              disabled={busy}
              onChange={(e) => onForm({ capacity: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export default function EpiasPlantImportPage() {
  return (
    <Suspense fallback={null}>
      <EpiasPlantImport />
    </Suspense>
  );
}
