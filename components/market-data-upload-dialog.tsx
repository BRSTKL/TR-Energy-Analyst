"use client";

import React, { useRef, useState } from "react";
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
import { FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Upload, X } from "lucide-react";

interface MarketDataUploadDialogProps {
  projectId?: string;
  onUploadSuccess?: () => void;
  trigger?: React.ReactNode;
}

const COLUMN_LABELS: Record<string, string> = {
  ptf: "PTF",
  smf: "SMF",
  systemDirection: "Sistem Yönü",
  gipPrice: "GİP AÖF",
};

interface UploadResult {
  success: boolean;
  message?: string;
  error?: string;
  totalGenerationRecordsUpdated?: number;
  files?: Array<{ name: string; rows: number; columns: string[] }>;
  warnings?: string[];
}

/**
 * EPİAŞ web servislerine erişilemediğinde (örn. yurt dışı IP engeli), Şeffaflık Platformu'ndan
 * indirilen PTF / SMF / Sistem Yönü / GİP AÖF raporlarını dosya olarak yükleme diyaloğu.
 */
export function MarketDataUploadDialog({
  projectId,
  onUploadSuccess,
  trigger,
}: MarketDataUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => [
      ...prev.filter((p) => !incoming.some((f) => f.name === p.name)),
      ...incoming,
    ]);
    setResult(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      if (projectId) formData.append("projectId", projectId);

      const res = await fetch("/api/market-data/upload", { method: "POST", body: formData });
      const json: UploadResult = await res.json();
      setResult(json);

      if (json.success) {
        setFiles([]);
        onUploadSuccess?.();
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Dosyalar yüklenirken bir hata oluştu.",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-violet-300 text-violet-800 hover:bg-violet-50 shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4 text-violet-600" />
            Piyasa Verisi Yükle
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <DialogTitle className="text-lg">Piyasa Verisini Dosyadan Yükle</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-600">
            EPİAŞ Şeffaflık Platformu&apos;ndan indirdiğiniz saatlik raporları (.xlsx veya .csv)
            seçin. Her metrik ayrı dosyada olabilir; dosyalar saat bazında birleştirilir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border bg-slate-50/70 p-3 text-xs text-slate-700">
          <p>
            <strong>Zorunlu:</strong> PTF ve SMF (TL/MWh). <strong>Opsiyonel:</strong> Sistem Yönü
            (yoksa SMF ile PTF kıyaslanarak belirlenir) ve GİP AÖF (yoksa arbitraj analizi eksik
            kalır).
          </p>
          <p className="text-slate-500">
            Saatler Türkiye saati kabul edilir; 0-23 ve 1-24 formatları otomatik tanınır. Aynı saat
            için mevcut fiyat varsa dosyadaki değerle değiştirilir.
          </p>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-center text-xs text-slate-600 hover:border-violet-400 hover:bg-violet-50/40"
        >
          <Upload className="h-5 w-5 text-violet-500" />
          <span className="font-medium text-slate-800">Dosyaları sürükleyin veya seçin</span>
          <span className="text-slate-400">Birden fazla dosya seçebilirsiniz</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="space-y-1 text-xs">
            {files.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1.5"
              >
                <span className="truncate font-medium text-slate-800">{f.name}</span>
                <button
                  type="button"
                  aria-label={`${f.name} dosyasını kaldır`}
                  onClick={() => setFiles((prev) => prev.filter((p) => p.name !== f.name))}
                  className="ml-2 text-slate-400 hover:text-rose-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {result && (
          <div
            className={`space-y-1.5 rounded-lg border p-3 text-xs ${
              result.success
                ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                : "border-rose-200 bg-rose-50/70 text-rose-900"
            }`}
          >
            <div className="flex items-start gap-2 font-semibold">
              {result.success ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span>{result.success ? result.message : result.error}</span>
            </div>
            {result.files && result.files.length > 0 && (
              <ul className="space-y-0.5 pl-6">
                {result.files.map((f) => (
                  <li key={f.name}>
                    {f.name}: {f.rows.toLocaleString("tr-TR")} satır ·{" "}
                    {f.columns.map((c) => COLUMN_LABELS[c] || c).join(", ")}
                  </li>
                ))}
              </ul>
            )}
            {result.success && projectId && (
              <p className="pl-6">
                Projede {(result.totalGenerationRecordsUpdated ?? 0).toLocaleString("tr-TR")} saatlik
                üretim kaydı yeni fiyatlarla yeniden hesaplandı.
              </p>
            )}
            {result.warnings && result.warnings.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-10 text-amber-800">
                {result.warnings.slice(0, 6).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
            Kapat
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          >
            {uploading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Yükleniyor...
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                Yükle ve Hesapla
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
