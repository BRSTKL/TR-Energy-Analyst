"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportIssue, PlantImportMapping, PlantImportStats } from "@/lib/import/column-mapping";
import type { SheetPreview } from "@/lib/import/workbook-preview";

interface Plant {
  id: string;
  name: string;
  type: string;
  capacityMw: number;
  recordCount: number;
}

interface PlantResult {
  stats: PlantImportStats;
  issues: ImportIssue[];
  preview: Array<{ timestamp: string; forecastMwh: number; actualMwh: number }>;
}

interface PreviewResponse {
  success: boolean;
  error?: string;
  fileName: string;
  plants: Plant[];
  sheets: SheetPreview[];
  mappings: PlantImportMapping[];
  suggestions?: Array<{ plantId: string; source: string; reason: string }>;
  results: Record<string, PlantResult>;
  setIssues: ImportIssue[];
  unusedSheets: string[];
  unmappedPlants: string[];
  hasErrors: boolean;
}

interface CommitResponse {
  success: boolean;
  error?: string;
  message?: string;
  plants?: Array<{ plantName: string; written: number; replaced: number; missingMarketHours: number }>;
  missingMarketHours?: number;
  needsConfirmation?: "sheets" | "plants";
  results?: Record<string, PlantResult>;
  setIssues?: ImportIssue[];
}

const num = (v: number, digits = 1) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
const day = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "–");

const selectClass =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500";

export default function ImportPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [projectName, setProjectName] = useState("");
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetPreview[]>([]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [headerRows, setHeaderRows] = useState<Record<string, number>>({});
  const [mappings, setMappings] = useState<Record<string, PlantImportMapping | null>>({});
  const [suggestions, setSuggestions] = useState<Record<string, { source: string; reason: string }>>({});
  const [results, setResults] = useState<Record<string, PlantResult>>({});
  const [setIssues, setSetIssues] = useState<ImportIssue[]>([]);
  const [unusedSheets, setUnusedSheets] = useState<string[]>([]);
  const [hasErrors, setHasErrors] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [confirmSheets, setConfirmSheets] = useState(false);
  const [confirmPlants, setConfirmPlants] = useState(false);
  const [saveTemplate, setSaveTemplate] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);

  const validationSeq = useRef(0);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setProjectName(json.project.name);
        setPlants(json.project.plants);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Proje yüklenemedi."));
  }, [projectId]);

  const postPreview = useCallback(
    async (
      target: File,
      body: { mappings?: Record<string, PlantImportMapping | null>; headerRows?: Record<string, number> }
    ): Promise<PreviewResponse> => {
      const fd = new FormData();
      fd.append("file", target);
      if (body.mappings) {
        fd.append("mappings", JSON.stringify(Object.values(body.mappings).filter((m) => m !== null)));
      }
      if (body.headerRows) fd.append("headerRows", JSON.stringify(body.headerRows));
      const res = await fetch(`/api/projects/${projectId}/import/preview`, { method: "POST", body: fd });
      const json: PreviewResponse = await res.json();
      if (!json.success) throw new Error(json.error || "Dosya okunamadı.");
      return json;
    },
    [projectId]
  );

  const applyEvaluation = (json: PreviewResponse) => {
    setSheets(json.sheets);
    setResults(json.results);
    setSetIssues(json.setIssues);
    setUnusedSheets(json.unusedSheets);
    setHasErrors(json.hasErrors);
    setConfirmSheets(false);
    setConfirmPlants(false);
  };

  // 1. Dosya seçildiğinde: önizleme + öneriler (hiçbir şey yazılmaz)
  const handleFile = async (selected: File) => {
    setFile(selected);
    setCommitResult(null);
    setRequestError(null);
    setHeaderRows({});
    setAnalyzing(true);
    try {
      const json = await postPreview(selected, {});
      const byPlant: Record<string, PlantImportMapping | null> = {};
      for (const p of json.plants) byPlant[p.id] = json.mappings.find((m) => m.plantId === p.id) ?? null;
      setPlants(json.plants);
      setMappings(byPlant);
      setSuggestions(Object.fromEntries((json.suggestions ?? []).map((s) => [s.plantId, s])));
      setActiveSheet(json.sheets[0]?.sheetName ?? null);
      applyEvaluation(json);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Dosya okunamadı.");
      setSheets([]);
    } finally {
      setAnalyzing(false);
    }
  };

  // 2. Eşleştirme veya başlık satırı değiştikçe canlı doğrulama (kısa gecikmeyle)
  useEffect(() => {
    if (!file || analyzing || sheets.length === 0) return;
    const seq = ++validationSeq.current;
    const timer = setTimeout(async () => {
      setValidating(true);
      try {
        const json = await postPreview(file, { mappings, headerRows });
        if (seq === validationSeq.current) applyEvaluation(json);
      } catch (err) {
        if (seq === validationSeq.current) setRequestError(err instanceof Error ? err.message : "Doğrulama başarısız.");
      } finally {
        if (seq === validationSeq.current) setValidating(false);
      }
    }, 350);
    return () => clearTimeout(timer);
    // sheets bilinçli olarak bağımlılıkta yok: doğrulama sonucu sheets'i günceller, döngü oluşmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappings, headerRows, file, analyzing, postPreview]);

  const sheetByName = (name: string) => sheets.find((s) => s.sheetName === name);
  const headersOf = (name: string) => sheetByName(name)?.columns.map((c) => c.header) ?? [];

  const updateMapping = (plantId: string, patch: Partial<PlantImportMapping>) => {
    setCommitResult(null);
    setMappings((prev) => {
      const current = prev[plantId];
      if (!current) return prev;
      return { ...prev, [plantId]: { ...current, ...patch } };
    });
  };

  const changeSheet = (plantId: string, sheetName: string) => {
    const sheet = sheetByName(sheetName);
    if (!sheet) return;
    const headers = new Set(sheet.columns.map((c) => c.header));
    const keep = (c: string | null | undefined) => (c && headers.has(c) ? c : "");
    setCommitResult(null);
    setMappings((prev) => {
      const current = prev[plantId];
      return {
        ...prev,
        [plantId]: {
          plantId,
          sheetName,
          headerRow: sheet.headerRow,
          // Aynı düzendeki sayfalarda (santral başına sayfa) kolon adları korunur
          dateColumn: keep(current?.dateColumn),
          hourColumn: current?.hourColumn && headers.has(current.hourColumn) ? current.hourColumn : null,
          forecastColumn: keep(current?.forecastColumn),
          actualColumn: keep(current?.actualColumn),
          unit: current?.unit ?? "MWh",
          hourFormat: current?.hourFormat ?? "auto",
        },
      };
    });
  };

  const toggleSkip = (plantId: string, skip: boolean) => {
    setCommitResult(null);
    if (skip) {
      setMappings((prev) => ({ ...prev, [plantId]: null }));
    } else {
      const first = sheets[0];
      if (first) changeSheet(plantId, first.sheetName);
    }
  };

  const changeHeaderRow = (sheetName: string, rowOneBased: number) => {
    const row = Math.max(0, rowOneBased - 1);
    setHeaderRows((prev) => ({ ...prev, [sheetName]: row }));
    setMappings((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([id, m]) => [
          id,
          m && m.sheetName === sheetName
            ? { ...m, headerRow: row, dateColumn: "", hourColumn: null, forecastColumn: "", actualColumn: "" }
            : m,
        ])
      )
    );
  };

  const activeMappings = Object.values(mappings).filter((m): m is PlantImportMapping => m !== null);
  const skippedPlants = plants.filter((p) => !mappings[p.id]);
  const canCommit =
    !!file &&
    !validating &&
    !analyzing &&
    !committing &&
    activeMappings.length > 0 &&
    !hasErrors &&
    (unusedSheets.length === 0 || confirmSheets) &&
    (skippedPlants.length === 0 || confirmPlants);

  const handleCommit = async () => {
    if (!file || !canCommit) return;
    setCommitting(true);
    setRequestError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mappings", JSON.stringify(activeMappings));
      fd.append("confirmSkippedSheets", confirmSheets ? "true" : "false");
      fd.append("confirmSkippedPlants", confirmPlants ? "true" : "false");
      fd.append("saveTemplate", saveTemplate ? "true" : "false");
      const res = await fetch(`/api/projects/${projectId}/import/commit`, { method: "POST", body: fd });
      const json: CommitResponse = await res.json();
      setCommitResult(json);
      if (json.success) {
        const refreshed = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
        if (refreshed.success) setPlants(refreshed.project.plants);
      }
    } catch (err) {
      setCommitResult({ success: false, error: err instanceof Error ? err.message : "Kayıt başarısız." });
    } finally {
      setCommitting(false);
    }
  };

  if (loadError) {
    return <div className="p-10 text-sm text-rose-700">{loadError}</div>;
  }

  const active = activeSheet ? sheetByName(activeSheet) : undefined;

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs">
            <Link href="/projects" className="flex items-center gap-1 text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-3 w-3" /> Projelerim
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-slate-700">{projectName}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Üretim Verisi İçe Aktar
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Dosyayı seçin, her santral için hangi sayfa ve kolonların kullanılacağını eşleştirin. Siz
            kaydedene kadar hiçbir veri yazılmaz.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        {/* 1. Dosya */}
        <Card className="shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{file ? file.name : "Dosya seçilmedi"}</p>
                <p className="text-xs text-slate-500">
                  {plants.length} santral tanımlı · .xlsx veya .csv
                  {analyzing && " · dosya okunuyor..."}
                </p>
              </div>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700">
              <Upload className="h-3.5 w-3.5" />
              {file ? "Başka Dosya Seç" : "Dosya Seç"}
              <input
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </CardContent>
        </Card>

        {plants.length === 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Bu projede santral tanımlı değil. Önce proje kartından santral ekleyin.
          </p>
        )}

        {requestError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{requestError}</p>
        )}

        {sheets.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Sol: Dosya önizlemesi */}
            <Card className="shadow-sm lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Dosya Önizlemesi</CardTitle>
                <CardDescription className="text-xs">
                  Başlık satırı yanlış algılandıysa düzeltin; kolon listeleri buna göre yenilenir.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {sheets.map((s) => {
                    const used = activeMappings.some((m) => m.sheetName === s.sheetName);
                    return (
                      <button
                        key={s.sheetName}
                        type="button"
                        onClick={() => setActiveSheet(s.sheetName)}
                        className={`rounded-md border px-2 py-1 text-xs ${
                          activeSheet === s.sheetName
                            ? "border-sky-500 bg-sky-50 font-semibold text-sky-800"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {s.sheetName}
                        <span className={`ml-1 ${used ? "text-emerald-600" : "text-slate-400"}`}>
                          {used ? "●" : "○"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {active && (
                  <>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>{active.rowCount.toLocaleString("tr-TR")} veri satırı</span>
                      <label className="flex items-center gap-1.5">
                        Başlık satırı:
                        <input
                          type="number"
                          min={1}
                          value={active.headerRow + 1}
                          onChange={(e) => changeHeaderRow(active.sheetName, Number(e.target.value) || 1)}
                          className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                        />
                      </label>
                    </div>
                    <div className="overflow-x-auto rounded-md border border-slate-200">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-100">
                          <tr>
                            {active.columns.map((c) => (
                              <th key={c.index} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-slate-700">
                                {c.header}
                                <span className="ml-1 font-normal text-slate-400">
                                  {c.type === "date" ? "tarih" : c.type === "number" ? "sayı" : c.type === "empty" ? "boş" : "metin"}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {active.sampleRows.map((row, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              {row.map((cell, j) => (
                                <td key={j} className="whitespace-nowrap px-2 py-1 font-mono text-slate-700">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Sağ: Santral eşleştirme kartları */}
            <div className="space-y-3 lg:col-span-3">
              {plants.map((plant) => {
                const m = mappings[plant.id] ?? null;
                const result = m ? results[plant.id] : undefined;
                const errors = result?.issues.filter((i) => i.level === "error") ?? [];
                const warnings = result?.issues.filter((i) => i.level === "warning") ?? [];
                const suggestion = suggestions[plant.id];
                const headers = m ? headersOf(m.sheetName) : [];

                const columnSelect = (
                  label: string,
                  value: string | null,
                  onChange: (v: string) => void,
                  optional = false
                ) => (
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-600">{label}</span>
                    <select
                      value={value ?? ""}
                      onChange={(e) => onChange(e.target.value)}
                      className={`${selectClass} ${!optional && !value ? "border-rose-400" : ""}`}
                    >
                      <option value="">{optional ? "— Yok (saat tarih kolonunda) —" : "— Seçiniz —"}</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                );

                return (
                  <Card
                    key={plant.id}
                    className={`shadow-sm ${
                      !m ? "border-slate-200 bg-slate-50" : errors.length > 0 ? "border-rose-300" : "border-emerald-300"
                    }`}
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{plant.name}</p>
                          <p className="text-xs text-slate-500">
                            {plant.type} · {plant.capacityMw} MW · mevcut {plant.recordCount.toLocaleString("tr-TR")} kayıt
                          </p>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input type="checkbox" checked={!m} onChange={(e) => toggleSkip(plant.id, e.target.checked)} />
                          Bu dosyada yok (atla)
                        </label>
                      </div>

                      {suggestion && suggestion.source !== "none" && m && (
                        <p className="text-[11px] text-slate-500">Öneri: {suggestion.reason}</p>
                      )}
                      {!m && suggestion?.source === "none" && (
                        <p className="text-[11px] text-amber-700">{suggestion.reason}</p>
                      )}

                      {m && (
                        <>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <label className="space-y-1">
                              <span className="text-[11px] font-medium text-slate-600">Sayfa</span>
                              <select
                                value={m.sheetName}
                                onChange={(e) => changeSheet(plant.id, e.target.value)}
                                className={selectClass}
                              >
                                {sheets.map((s) => (
                                  <option key={s.sheetName} value={s.sheetName}>
                                    {s.sheetName}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {columnSelect("Tarih kolonu", m.dateColumn, (v) => updateMapping(plant.id, { dateColumn: v }))}
                            {columnSelect(
                              "Saat kolonu",
                              m.hourColumn,
                              (v) => updateMapping(plant.id, { hourColumn: v || null }),
                              true
                            )}
                            {columnSelect("Tahmin (KGÖP)", m.forecastColumn, (v) =>
                              updateMapping(plant.id, { forecastColumn: v })
                            )}
                            {columnSelect("Gerçekleşen", m.actualColumn, (v) =>
                              updateMapping(plant.id, { actualColumn: v })
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="text-[11px] font-medium text-slate-600">Birim</span>
                                <select
                                  value={m.unit}
                                  onChange={(e) => updateMapping(plant.id, { unit: e.target.value as "MWh" | "kWh" })}
                                  className={selectClass}
                                >
                                  <option value="MWh">MWh</option>
                                  <option value="kWh">kWh</option>
                                </select>
                              </label>
                              <label className="space-y-1">
                                <span className="text-[11px] font-medium text-slate-600">Saat</span>
                                <select
                                  value={m.hourFormat}
                                  onChange={(e) =>
                                    updateMapping(plant.id, { hourFormat: e.target.value as PlantImportMapping["hourFormat"] })
                                  }
                                  className={selectClass}
                                >
                                  <option value="auto">Otomatik</option>
                                  <option value="0-23">0-23</option>
                                  <option value="1-24">1-24</option>
                                </select>
                              </label>
                            </div>
                          </div>

                          {result && errors.length === 0 && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{result.stats.rows.toLocaleString("tr-TR")} saat</span>
                              <span>
                                {day(result.stats.startDate)} – {day(result.stats.endDate)}
                              </span>
                              <span>Tahmin {num(result.stats.totalForecastMwh, 0)} MWh</span>
                              <span>Gerçekleşen {num(result.stats.totalActualMwh, 0)} MWh</span>
                              <span>Tepe {num(result.stats.peakActualMwh, 2)} MWh</span>
                            </div>
                          )}
                          {result && errors.length === 0 && result.preview.length > 0 && (
                            <p className="font-mono text-[11px] text-slate-500">
                              İlk satır: {result.preview[0].timestamp.slice(0, 16).replace("T", " ")} · tahmin{" "}
                              {num(result.preview[0].forecastMwh, 3)} · gerçekleşen {num(result.preview[0].actualMwh, 3)}
                            </p>
                          )}
                          {errors.map((i, k) => (
                            <p key={`e${k}`} className="flex items-start gap-1.5 text-xs text-rose-700">
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.message}
                            </p>
                          ))}
                          {warnings.map((i, k) => (
                            <p key={`w${k}`} className="flex items-start gap-1.5 text-xs text-amber-700">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.message}
                            </p>
                          ))}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Onaylar ve kaydet */}
        {sheets.length > 0 && (
          <Card className="shadow-sm">
            <CardContent className="space-y-3 p-4">
              {setIssues.map((i, k) => (
                <p key={k} className="flex items-start gap-1.5 text-xs text-rose-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.message}
                </p>
              ))}

              {unusedSheets.length > 0 && (
                <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <input type="checkbox" checked={confirmSheets} onChange={(e) => setConfirmSheets(e.target.checked)} />
                  <span>
                    Şu sayfalar hiçbir santrale eşlenmedi ve <strong>yüklenmeyecek</strong>: {unusedSheets.join(", ")}.
                    Bu sayfaları atlamayı onaylıyorum.
                  </span>
                </label>
              )}
              {skippedPlants.length > 0 && (
                <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <input type="checkbox" checked={confirmPlants} onChange={(e) => setConfirmPlants(e.target.checked)} />
                  <span>
                    Şu santrallere bu dosyadan <strong>veri yazılmayacak</strong>:{" "}
                    {skippedPlants.map((p) => p.name).join(", ")}. Mevcut kayıtları değişmez. Onaylıyorum.
                  </span>
                </label>
              )}

              <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} />
                  Bu eşleştirmeyi şablon olarak kaydet (sonraki yüklemelerde otomatik uygulanır)
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {validating
                      ? "Doğrulanıyor..."
                      : hasErrors
                        ? "Hataları düzeltin"
                        : `${activeMappings.length} santral yazılacak`}
                  </span>
                  <Button
                    onClick={handleCommit}
                    disabled={!canCommit}
                    className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {committing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {committing ? "Yazılıyor..." : "Eşleştirmeyi Onayla ve Kaydet"}
                  </Button>
                </div>
              </div>

              {commitResult && (
                <div
                  className={`space-y-1.5 rounded-md border px-3 py-2 text-xs ${
                    commitResult.success
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-rose-200 bg-rose-50 text-rose-900"
                  }`}
                >
                  <p className="font-semibold">{commitResult.success ? commitResult.message : commitResult.error}</p>
                  {commitResult.plants?.map((p) => (
                    <p key={p.plantName}>
                      {p.plantName}: {p.written.toLocaleString("tr-TR")} saat yazıldı
                      {p.replaced > 0 && ` (${p.replaced.toLocaleString("tr-TR")} eski kayıt değiştirildi)`}
                    </p>
                  ))}
                  {commitResult.success && (commitResult.missingMarketHours ?? 0) > 0 && (
                    <p className="text-amber-800">
                      {commitResult.missingMarketHours!.toLocaleString("tr-TR")} saat için piyasa fiyatı yok. Sonuç
                      sayfasından EPİAŞ fiyatlarını çekin veya piyasa verisi yükleyin.
                    </p>
                  )}
                  {commitResult.success && (
                    <Button asChild size="sm" className="mt-1 bg-sky-600 hover:bg-sky-700">
                      <Link href={`/projects/${projectId}/results`}>Sonuç Raporuna Git</Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
