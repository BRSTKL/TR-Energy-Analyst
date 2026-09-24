"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateChunk, formatDay, monthChunks } from "@/lib/date-chunks";
import {
  CloudDownload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Database,
  Calendar,
  Zap,
  Activity,
  Layers,
} from "lucide-react";

interface EpiasSyncDialogProps {
  projectId?: string;
  onSyncSuccess?: () => void;
  trigger?: React.ReactNode;
}

export function EpiasSyncDialog({
  projectId,
  onSyncSuccess,
  trigger,
}: EpiasSyncDialogProps) {
  const [open, setOpen] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Bağlantı durumu
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [dbTotalRecords, setDbTotalRecords] = useState<number | null>(null);

  // Tarih aralığı (Varsayılan: Son 7 gün)
  const defaultEnd = new Date().toISOString().split("T")[0];
  const defaultStartObj = new Date();
  defaultStartObj.setDate(defaultStartObj.getDate() - 7);
  const defaultStart = defaultStartObj.toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [recalculateCosts, setRecalculateCosts] = useState(true);

  // Projenin üretim verisinin tarih aralığı: diyalog açılınca varsayılan olarak bu aralık seçilir
  const [projectRange, setProjectRange] = useState<{ start: string; end: string } | null>(null);

  // Ay ay senkron ilerlemesi ve başarısız aylar (tekrar denemek için)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [failedChunks, setFailedChunks] = useState<DateChunk[]>([]);

  // Sonuç / Bildirim
  const [resultMessage, setResultMessage] = useState<{
    type: "success" | "error";
    title: string;
    details: string;
    stats?: {
      totalMarketRecords: number;
      totalGenUpdated: number;
      avgPtf?: number;
      avgSmf?: number;
    };
  } | null>(null);

  // Diyalog açıldığında bağlantıyı ve mevcut veritabanı durumunu sorgula
  const checkStatus = async () => {
    setCheckingStatus(true);
    setResultMessage(null);
    try {
      const res = await fetch("/api/epias/sync");
      const json = await res.json();
      if (json.success && json.connected) {
        setIsConnected(true);
        setUsername(json.username);
        setConnectionError(null);
        if (json.dbStats) {
          setDbTotalRecords(json.dbStats.totalRecords);
        }
      } else {
        setIsConnected(false);
        setConnectionError(json.connectionError || json.error || "Bağlantı kurulamadı.");
      }
    } catch (err) {
      setIsConnected(false);
      setConnectionError("EPİAŞ servis kontrolü sırasında ağ hatası oluştu.");
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    if (open) {
      checkStatus();
      setFailedChunks([]);
      setProgress(null);
    }
  }, [open]);

  // Proje verisinin aralığını al ve tarihleri ona ayarla
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        const range = json?.project?.dataRange;
        if (cancelled || !range?.start || !range?.end) return;
        setProjectRange(range);
        setStartDate(range.start);
        setEndDate(range.end);
      })
      .catch(() => {
        // Aralık alınamazsa varsayılan tarihler kalır
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  // Hızlı Tarih Seçiciler
  const setPreset = (preset: "today" | "last7" | "last30" | "currentMonth" | "project") => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    if (preset === "today") {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "last7") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().split("T")[0]);
      setEndDate(todayStr);
    } else if (preset === "last30") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().split("T")[0]);
      setEndDate(todayStr);
    } else if (preset === "currentMonth") {
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      setStartDate(`${y}-${m}-01`);
      setEndDate(todayStr);
    } else if (preset === "project" && projectRange) {
      setStartDate(projectRange.start);
      setEndDate(projectRange.end);
    }
  };

  // Senkronizasyonu Başlat: uzun aralıklar ay ay çekilir (VPN bağlantısı kopsa bile yalnızca o ay tekrarlanır)
  const runSync = async (chunks: DateChunk[]) => {
    if (chunks.length === 0) return;

    setSyncing(true);
    setResultMessage(null);
    setFailedChunks([]);

    let totalMarket = 0;
    let totalGen = 0;
    let ptfWeighted = 0;
    let smfWeighted = 0;
    const failed: DateChunk[] = [];
    const errors: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      setProgress({ done: i, total: chunks.length, label: chunk.label });
      try {
        const res = await fetch("/api/epias/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate: chunk.start,
            endDate: chunk.end,
            projectId,
            recalculateCosts,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "EPİAŞ senkronizasyonu başarısız oldu.");
        }
        totalMarket += json.totalMarketRecords ?? 0;
        totalGen += json.totalGenerationRecordsUpdated ?? 0;
        if (json.sample?.avgPtf !== undefined) ptfWeighted += json.sample.avgPtf * (json.totalMarketRecords ?? 0);
        if (json.sample?.avgSmf !== undefined) smfWeighted += json.sample.avgSmf * (json.totalMarketRecords ?? 0);
      } catch (err) {
        failed.push(chunk);
        errors.push(`${chunk.label}: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`);
      }
    }
    setProgress(null);
    setFailedChunks(failed);

    const round2 = (v: number) => Number(v.toFixed(2));
    const stats =
      totalMarket > 0
        ? {
            totalMarketRecords: totalMarket,
            totalGenUpdated: totalGen,
            avgPtf: ptfWeighted ? round2(ptfWeighted / totalMarket) : undefined,
            avgSmf: smfWeighted ? round2(smfWeighted / totalMarket) : undefined,
          }
        : undefined;
    const summary = `${totalMarket.toLocaleString("tr-TR")} saatlik piyasa verisi (PTF, SMF, Sistem Yönü, GİP AÖF) yerel veritabanına aktarıldı.${
      totalGen > 0 ? ` Projenin ${totalGen.toLocaleString("tr-TR")} santral üretim kaydı yeni piyasa fiyatlarıyla güncellendi.` : ""
    }`;

    if (failed.length === 0) {
      setResultMessage({ type: "success", title: "EPİAŞ Verileri Başarıyla Güncellendi", details: summary, stats });
    } else {
      setResultMessage({
        type: "error",
        title:
          failed.length === chunks.length
            ? "Senkronizasyon Hatası"
            : `${chunks.length - failed.length} / ${chunks.length} dönem aktarıldı, ${failed.length} dönem başarısız`,
        details: `${totalMarket > 0 ? summary + " " : ""}Başarısız: ${errors.join(" · ")}`,
        stats,
      });
    }

    // Veritabanındaki toplam kayıt sayısını yeniden oku (upsert olduğu için toplama eklemek yanlış olur)
    fetch("/api/epias/sync")
      .then((r) => r.json())
      .then((json) => json?.dbStats && setDbTotalRecords(json.dbStats.totalRecords))
      .catch(() => {});

    if (totalMarket > 0 && onSyncSuccess) onSyncSuccess();
    setSyncing(false);
  };

  const handleSync = () => {
    if (!startDate || !endDate) return;
    runSync(monthChunks(startDate, endDate));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-sky-300 text-sky-800 hover:bg-sky-50 shadow-sm"
          >
            <CloudDownload className="h-4 w-4 text-sky-600" />
            EPİAŞ Canlı Veri Çek
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Zap className="h-4 w-4" />
            </span>
            <DialogTitle className="text-lg">
              EPİAŞ Şeffaflık Platformu 2.0 Senkronizasyonu
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-600">
            Resmi EPİAŞ REST servisleri üzerinden saatlik Piyasa Takas Fiyatı (PTF), Sistem
            Marjinal Fiyatı (SMF), Sistem Yönü ve Gün İçi Piyasası AÖF verilerini doğrudan
            çekin.
          </DialogDescription>
        </DialogHeader>

        {/* Bağlantı Durumu Kartı */}
        <div className="rounded-lg border bg-slate-50/70 p-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {checkingStatus ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-500" />
              ) : isConnected ? (
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500" />
              )}
              <span className="font-semibold text-slate-800">
                {checkingStatus
                  ? "EPİAŞ CAS bağlantısı kontrol ediliyor..."
                  : isConnected
                    ? "EPİAŞ CAS Bağlantısı: Aktif"
                    : "EPİAŞ CAS Bağlantısı: Başarısız"}
              </span>
            </div>

            {username && (
              <span className="font-mono text-slate-600 bg-white border px-2 py-0.5 rounded">
                {username}
              </span>
            )}
          </div>

          {connectionError && (
            <div className="mt-2 text-rose-600 font-medium">{connectionError}</div>
          )}

          {dbTotalRecords !== null && (
            <div className="mt-2 flex items-center gap-1.5 text-slate-500 border-t pt-2">
              <Database className="h-3 w-3" />
              <span>Veritabanında kayıtlı piyasa verisi: </span>
              <strong className="text-slate-700 font-mono">
                {dbTotalRecords.toLocaleString("tr-TR")} saat
              </strong>
            </div>
          )}
        </div>

        {/* Tarih Seçimi Formu */}
        <div className="space-y-4 py-2">
          {/* Hızlı Seçim Butonları */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Hızlı Tarih Seçimi:
            </label>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreset("today")}
                className="h-7 text-xs px-2.5"
              >
                Bugün
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreset("last7")}
                className="h-7 text-xs px-2.5"
              >
                Son 7 Gün
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreset("last30")}
                className="h-7 text-xs px-2.5"
              >
                Son 30 Gün
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreset("currentMonth")}
                className="h-7 text-xs px-2.5"
              >
                Bu Ay
              </Button>
              {projectRange && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreset("project")}
                  className="h-7 text-xs px-2.5 border-sky-300 text-sky-800"
                >
                  Proje verisi ({formatDay(projectRange.start)} – {formatDay(projectRange.end)})
                </Button>
              )}
            </div>
          </div>

          {/* Tarih Girdileri */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                Başlangıç Tarihi
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                Bitiş Tarihi
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
              />
            </div>
          </div>

          {/* Otomatik Santral Eşleştirme Checkbox */}
          {projectId && (
            <label className="flex items-start gap-2 cursor-pointer rounded-md border border-slate-200 bg-white p-2.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={recalculateCosts}
                onChange={(e) => setRecalculateCosts(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <div className="text-xs text-slate-700">
                <strong className="text-slate-900 block font-medium">
                  Santral Üretim Kayıtlarını Otomatik Eşleştir
                </strong>
                Çekilen saatlik piyasa verilerini projedeki mevcut üretimlerle eşleştir ve
                dengesizlik maliyetlerini resmi EPİAŞ katsayılarıyla yeniden hesapla.
              </div>
            </label>
          )}
        </div>

        {/* Başarı / Hata Bildirim Kutusu */}
        {resultMessage && (
          <div
            className={`rounded-lg border p-3 text-xs ${
              resultMessage.type === "success"
                ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                : "border-rose-200 bg-rose-50/70 text-rose-900"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {resultMessage.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600" />
              )}
              {resultMessage.title}
            </div>
            <p className="mt-1 text-slate-700">{resultMessage.details}</p>

            {resultMessage.stats && (
              <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-emerald-200 pt-2 text-slate-800">
                {resultMessage.stats.avgPtf !== undefined && (
                  <div>
                    Ort. PTF:{" "}
                    <strong className="font-mono">{resultMessage.stats.avgPtf} ₺</strong>
                  </div>
                )}
                {resultMessage.stats.avgSmf !== undefined && (
                  <div>
                    Ort. SMF:{" "}
                    <strong className="font-mono">{resultMessage.stats.avgSmf} ₺</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={syncing}
          >
            Kapat
          </Button>

          {failedChunks.length > 0 && !syncing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => runSync(failedChunks)}
              className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Başarısız {failedChunks.length} dönemi tekrar dene
            </Button>
          )}

          <Button
            type="button"
            onClick={handleSync}
            disabled={syncing || !startDate || !endDate || isConnected === false}
            className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white"
          >
            {syncing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {progress && progress.total > 1
                  ? `${progress.label} çekiliyor (${progress.done + 1}/${progress.total})`
                  : "EPİAŞ'tan Çekiliyor..."}
              </>
            ) : (
              <>
                <CloudDownload className="h-3.5 w-3.5" />
                Verileri Çek ve Senkronize Et
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
