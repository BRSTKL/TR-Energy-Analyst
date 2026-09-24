"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, CloudDownload, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deserializeSeries,
  detectTechnology,
  EpiasPowerPlant,
  HourlySeries,
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

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const num = (v: number, d = 0) => v.toLocaleString("tr-TR", { maximumFractionDigits: d });

export default function EpiasPlantImportPage() {
  const router = useRouter();

  // 1. Arama
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EpiasPowerPlant[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [plant, setPlant] = useState<EpiasPowerPlant | null>(null);
  const searchId = useRef(0);

  // 2. Dönem ve çekim
  const [startDay, setStartDay] = useState("2025-01-01");
  const [endDay, setEndDay] = useState("2025-12-31");
  const [uevcbs, setUevcbs] = useState<Uevcb[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [kgupParts, setKgupParts] = useState<HourlySeries[]>([]);
  const [uevmParts, setUevmParts] = useState<HourlySeries[]>([]);
  const [failed, setFailed] = useState<Array<DateChunk & { error: string }>>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 3. Proje
  const [projectName, setProjectName] = useState("");
  const [plantName, setPlantName] = useState("");
  const [type, setType] = useState<PlantTechnology | "">("");
  const [capacity, setCapacity] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = ++searchId.current;
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/epias/plants?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => {
          if (id !== searchId.current) return;
          if (!d.success) throw new Error(d.error);
          setResults(d.plants);
          setSearchError(null);
        })
        .catch((e) => id === searchId.current && setSearchError(e instanceof Error ? e.message : "Arama yapılamadı."))
        .finally(() => id === searchId.current && setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const choosePlant = (p: EpiasPowerPlant) => {
    setPlant(p);
    setUevcbs(null);
    setKgupParts([]);
    setUevmParts([]);
    setFailed([]);
    setFetchError(null);
    setPlantName(p.name);
    setProjectName(p.name);
  };

  const runFetch = async (chunks: DateChunk[], units: Uevcb[]) => {
    if (!plant) return;
    setFetching(true);
    const failures: Array<DateChunk & { error: string }> = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      setProgress({ done: i, total: chunks.length, label: c.label });
      try {
        const res = await fetch("/api/epias/plants/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ powerPlantId: plant.id, uevcbIds: units.map((u) => u.id), startDay: c.start, endDay: c.end }),
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error);
        setKgupParts((prev) => [...prev, deserializeSeries(d.kgup as SerializedSeries)]);
        setUevmParts((prev) => [...prev, deserializeSeries(d.uevm as SerializedSeries)]);
      } catch (e) {
        failures.push({ ...c, error: e instanceof Error ? e.message : "hata" });
      }
    }
    setFailed(failures);
    setProgress(null);
    setFetching(false);
  };

  const startFetch = async () => {
    if (!plant) return;
    setFetchError(null);
    setKgupParts([]);
    setUevmParts([]);
    setFailed([]);
    try {
      const res = await fetch("/api/epias/plants/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ powerPlantId: plant.id, startDay }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      if (!d.uevcbs.length) throw new Error("Bu santral için uzlaştırma birimi (UEVÇB) bulunamadı; KGÜP çekilemez.");
      setUevcbs(d.uevcbs);
      await runFetch(monthChunks(startDay, endDay), d.uevcbs);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Veri çekilemedi.");
    }
  };

  const merged = useMemo(() => {
    if (kgupParts.length === 0 && uevmParts.length === 0) return null;
    const kgup = sumSeries(kgupParts);
    const uevm = sumSeries(uevmParts);
    return {
      series: mergePlantSeries(kgup, uevm, startDay, endDay),
      tech: detectTechnology(uevm.byFuel),
      capacity: suggestCapacityMw(uevm.values.values()),
      skipped: kgup.skipped + uevm.skipped,
    };
  }, [kgupParts, uevmParts, startDay, endDay]);

  // Önerileri bir kez doldur; kullanıcı değiştirirse ezme
  useEffect(() => {
    if (!merged || fetching) return;
    if (!type && merged.tech.type) setType(merged.tech.type);
    if (!capacity && merged.capacity > 0) setCapacity(String(merged.capacity));
  }, [merged, fetching, type, capacity]);

  const hasError = merged?.series.checks.some((c) => c.level === "error") ?? true;

  const createProject = async () => {
    if (!merged || !plant) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/epias/plants/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          plantName,
          type,
          capacityMw: Number(capacity.replace(",", ".")),
          source: { powerPlantId: plant.id, uevcbIds: uevcbs?.map((u) => u.id) },
          rows: merged.series.rows.map((r) => [r.timestamp.getTime(), r.forecastMwh, r.actualMwh]),
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      router.push(`/projects/${d.projectId}/results`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Proje oluşturulamadı.");
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <Link href="/projects" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-3 w-3" /> Projelerim
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">EPİAŞ&apos;tan santral analizi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Santralin adını yazın. Gün öncesi planı (KGÜP) ve gerçekleşen üretimi (UEVM) EPİAŞ Şeffaflık
            Platformu&apos;ndan çekilir, saat saat birleştirilir ve analiz için proje oluşturulur.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 pt-6 sm:px-6">
        {/* 1. Santral */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Santral</CardTitle>
            <CardDescription>Yalnızca EPİAŞ&apos;ın santral bazında üretim yayımladığı (lisanslı) santraller listelenir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Santral adı, örneğin Bahçe RES"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {searching && (
              <p className="text-xs text-slate-500">
                EPİAŞ&apos;a bağlanılıyor… İlk aramada santral listesi indirilir; bağlantı yoksa hata 30 saniye kadar
                sonra gösterilir.
              </p>
            )}
            {searchError && (
              <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {searchError}
              </div>
            )}
            {results.length > 0 && (
              <div className="max-h-64 divide-y overflow-y-auto rounded-md border border-slate-200 bg-white">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choosePlant(p)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      plant?.id === p.id ? "bg-indigo-50 text-indigo-900" : "text-slate-800"
                    }`}
                  >
                    <span>{p.name}</span>
                    <span className="font-mono text-2xs text-slate-400">{p.eic}</span>
                  </button>
                ))}
              </div>
            )}
            {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-xs text-slate-500">Eşleşen santral yok.</p>
            )}
          </CardContent>
        </Card>

        {/* 2. Dönem ve çekim */}
        {plant && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2. Dönem: {plant.name}</CardTitle>
              <CardDescription>Veri ay ay çekilir; bağlantı koparsa yalnızca başarısız aylar tekrar denenir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="block text-xs font-semibold text-slate-700">
                  Başlangıç
                  <input type="date" className={`${inputClass} mt-1`} value={startDay} onChange={(e) => setStartDay(e.target.value)} />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Bitiş
                  <input type="date" className={`${inputClass} mt-1`} value={endDay} onChange={(e) => setEndDay(e.target.value)} />
                </label>
                <Button onClick={startFetch} disabled={fetching || !startDay || !endDay || startDay > endDay} className="gap-1.5 bg-sky-600 text-white hover:bg-sky-700">
                  {fetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                  {fetching && progress ? `${progress.label} (${progress.done + 1}/${progress.total})` : "Verileri çek"}
                </Button>
              </div>
              {uevcbs && (
                <p className="text-xs text-slate-500">
                  Uzlaştırma birimleri: {uevcbs.map((u) => u.name).join(", ")} (KGÜP bunların toplamıdır)
                </p>
              )}
              {fetchError && (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {fetchError}
                </div>
              )}
              {failed.length > 0 && !fetching && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <span>
                    {failed.length} dönem çekilemedi: {failed.map((f) => f.label).join(", ")}. İlk hata: {failed[0].error}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => uevcbs && runFetch(failed, uevcbs)} className="gap-1">
                    <RefreshCw className="h-3.5 w-3.5" /> Tekrar dene
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 3. Özet ve proje */}
        {merged && !fetching && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3. Kontrol ve proje</CardTitle>
              <CardDescription>
                Plan (KGÜP) {num(merged.series.kgupTotalMwh)} MWh · Gerçekleşen (UEVM) {num(merged.series.uevmTotalMwh)} MWh ·
                Eşleşen saat {num(merged.series.rows.length)}
                {merged.skipped > 0 && ` · okunamayan kayıt ${num(merged.skipped)}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {merged.series.checks.map((c, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${
                      c.level === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : c.level === "warning"
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {c.level === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                    {c.message}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1">
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

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Proje adı
                  <input className={`${inputClass} mt-1`} value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Santral adı
                  <input className={`${inputClass} mt-1`} value={plantName} onChange={(e) => setPlantName(e.target.value)} />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Tür{" "}
                  <span className="font-normal text-slate-500">
                    {merged.tech.type ? "(UEVM'den bulundu)" : merged.tech.dominant ? "(kaynak karışık, seçin)" : "(seçin)"}
                  </span>
                  <select className={`${inputClass} mt-1`} value={type} onChange={(e) => setType(e.target.value as PlantTechnology)}>
                    <option value="">Seçin</option>
                    <option value="RES">RES</option>
                    <option value="HES">HES</option>
                    <option value="GES">GES</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Kurulu güç (MW) <span className="font-normal text-slate-500">(en yüksek üretimden önerildi)</span>
                  <input className={`${inputClass} mt-1`} inputMode="decimal" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                </label>
              </div>

              {createError && (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {createError}
                </div>
              )}
              <Button
                onClick={createProject}
                disabled={creating || hasError || !type || !capacity || !projectName.trim()}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {creating ? "Proje oluşturuluyor (eksik piyasa fiyatları da çekiliyor)…" : "Projeyi oluştur ve analiz et"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
