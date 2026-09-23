"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  PlusCircle,
  RefreshCw,
  Sun,
  UploadCloud,
  Wind,
  Zap,
} from "lucide-react";

interface PlantOption {
  id: string;
  name: string;
  type: string;
  capacityMw: number;
}

interface GenerationUploadDialogProps {
  projectId: string;
  projectName?: string;
  plants?: PlantOption[];
  onUploadSuccess?: () => void;
  triggerButton?: React.ReactNode;
}

export function GenerationUploadDialog({
  projectId,
  projectName,
  plants = [],
  onUploadSuccess,
  triggerButton,
}: GenerationUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Santral Seçimi
  const [selectedPlantId, setSelectedPlantId] = useState<string>("");
  const [newPlantName, setNewPlantName] = useState("");
  const [newPlantType, setNewPlantType] = useState<"RES" | "GES" | "HES">("RES");
  const [newPlantCapacity, setNewPlantCapacity] = useState("30");
  const [autoSyncEpias, setAutoSyncEpias] = useState(true);

  // İşlem Durumu
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (plants.length > 0) {
      setSelectedPlantId(plants[0].id);
    } else {
      setSelectedPlantId("new");
    }
  }, [plants]);

  const handleReset = () => {
    setFile(null);
    setError(null);
    setSuccessResult(null);
    setLoading(false);
    setProgressMsg("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      handleReset();
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = e.dataTransfer.files[0];
      validateAndSetFile(dropped);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls" && ext !== "csv") {
      setError("Lütfen geçerli bir Excel (.xlsx, .xls) veya CSV (.csv) dosyası seçin.");
      return;
    }
    setError(null);
    setFile(f);
  };

  const downloadSampleCsv = () => {
    const csvContent =
      "Tarih;Saat;KGÖP (MWh);Gerçekleşen (MWh)\n" +
      "01.01.2025;00:00;35,0;32,5\n" +
      "01.01.2025;01:00;38,0;41,2\n" +
      "01.01.2025;02:00;40,0;39,0\n" +
      "01.01.2025;03:00;42,0;45,0\n" +
      "01.01.2025;04:00;40,5;38,0\n";

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "ornek_uretim_sablonu.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Lütfen bir dosya seçin.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgressMsg("Dosya ayrıştırılıyor ve piyasa verileri eşleştiriliyor...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("plantId", selectedPlantId);
      if (selectedPlantId === "new") {
        formData.append("newPlantName", newPlantName.trim());
        formData.append("newPlantType", newPlantType);
        formData.append("newPlantCapacity", newPlantCapacity);
      }
      formData.append("autoSyncEpias", autoSyncEpias ? "true" : "false");

      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Yükleme sırasında hata oluştu.");
      }

      setSuccessResult(data);
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen hata meydana geldi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">
            <UploadCloud className="h-4 w-4" />
            Üretim Verisi Yükle
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900">
                Santral Üretim Verisi Yükle (.xlsx / .csv)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                {projectName ? `${projectName} portföyüne` : "Projeye"} ait KGÖP tahmin ve gerçekleşen üretim dosyasını yükleyin.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* BAŞARI EKRANI */}
        {successResult ? (
          <div className="space-y-5 py-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-emerald-950">
                Veriler Başarıyla Yüklendi ve İşlendi!
              </h3>
              <p className="mt-1 text-sm text-emerald-800">
                {successResult.message}
              </p>
            </div>

            {/* İstatistik Kutuları */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm">
                <span className="text-xs text-slate-500">Santral</span>
                <p className="text-sm font-bold text-slate-900 truncate">
                  {successResult.plant?.name}
                </p>
                <span className="text-2xs font-semibold text-emerald-600 uppercase">
                  {successResult.plant?.type} · {successResult.plant?.capacityMw} MW
                </span>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm">
                <span className="text-xs text-slate-500">Kayıt Sayısı</span>
                <p className="text-lg font-bold text-slate-900">
                  {successResult.stats?.validRecords.toLocaleString("tr-TR")}
                </p>
                <span className="text-2xs text-slate-400">Saat</span>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm">
                <span className="text-xs text-slate-500">Dönem</span>
                <p className="text-xs font-semibold text-slate-900">
                  {successResult.stats?.dateRange?.startStr}
                </p>
                <p className="text-xs font-semibold text-slate-900">
                  {successResult.stats?.dateRange?.endStr}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm">
                <span className="text-xs text-slate-500">Piyasa Eşleşmesi</span>
                <p className="text-lg font-bold text-emerald-700">
                  {successResult.stats?.matchedMarketCount.toLocaleString("tr-TR")}
                </p>
                <span className="text-2xs text-emerald-600">Saat PTF/SMF</span>
              </div>
            </div>

            {/* Çoklu Santral Dosyası */}
            {successResult.plants && successResult.plants.length > 1 && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
                <span className="font-semibold text-slate-700">Yüklenen Santraller</span>
                <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                  {successResult.plants.map((pl: any) => (
                    <li key={pl.id} className="flex justify-between text-slate-600">
                      <span className="font-medium text-slate-900">{pl.name}</span>
                      <span>
                        {pl.type} · {pl.capacityMw} MW · {pl.records.toLocaleString("tr-TR")} saat
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Uyarılar Varsa */}
            {successResult.warnings && successResult.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 space-y-1">
                <span className="font-semibold flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> İşlem Notları:
                </span>
                <ul className="list-disc pl-5 space-y-0.5 text-2xs">
                  {successResult.warnings.map((w: string, idx: number) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  handleReset();
                }}
              >
                Yeni Dosya Yükle
              </Button>
              <Button
                className="gap-2 bg-primary"
                onClick={() => {
                  setOpen(false);
                  router.push(`/projects/${projectId}/results`);
                }}
              >
                Sonuç Dashboard&apos;ına Git
                <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* YÜKLEME FORMU */
          <div className="space-y-5 py-2">
            {/* Hata Uyarısı */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Hata: </span>
                  {error}
                </div>
              </div>
            )}

            {/* 1. Adım: Hedef Santral Seçimi */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                1. Hedef Santral
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <select
                    value={selectedPlantId}
                    onChange={(e) => setSelectedPlantId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {plants.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name} ({pl.type} - {pl.capacityMw} MW)
                      </option>
                    ))}
                    <option value="new">➕ Yeni Santral Tanımla...</option>
                  </select>
                </div>

                {selectedPlantId === "new" && (
                  <div className="space-y-2 sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                    <span className="text-xs font-semibold text-emerald-800">
                      Yeni Santral Bilgileri
                    </span>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        type="text"
                        placeholder="Santral Adı (boşsa dosyadan alınır)"
                        value={newPlantName}
                        onChange={(e) => setNewPlantName(e.target.value)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <select
                        value={newPlantType}
                        onChange={(e) => setNewPlantType(e.target.value as any)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="RES">RES (Rüzgar)</option>
                        <option value="GES">GES (Güneş)</option>
                        <option value="HES">HES (Hidroelektrik)</option>
                      </select>
                      <input
                        type="number"
                        placeholder="Kapasite (MW)"
                        value={newPlantCapacity}
                        onChange={(e) => setNewPlantCapacity(e.target.value)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>
              <p className="text-2xs text-slate-500">
                Dosyada birden fazla santral varsa (santral sütunu veya santral başına ayrı Excel
                sayfası, örn. RES_1, HES_1) her biri adına göre ayrı santral olarak eşleştirilir veya
                oluşturulur; bu seçim yok sayılır.
              </p>
            </div>

            {/* 2. Adım: Dosya Seçimi / Sürükle Bırak */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  2. Üretim Dosyası (.xlsx, .xls, .csv)
                </label>
                <button
                  type="button"
                  onClick={downloadSampleCsv}
                  className="flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
                >
                  <Download className="h-3 w-3" /> Örnek Şablonu İndir
                </button>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                  dragOver
                    ? "border-emerald-500 bg-emerald-50/50"
                    : file
                    ? "border-emerald-300 bg-emerald-50/20"
                    : "border-slate-300 hover:border-slate-400 bg-white"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {file ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <FileSpreadsheet className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-bold text-slate-900 mt-2">
                      {file.name}
                    </p>
                    <span className="text-xs text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB · Değiştirmek için tıklayın
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <UploadCloud className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-semibold text-slate-800 mt-2">
                      Dosyayı buraya sürükleyin veya <span className="text-primary underline">seçmek için tıklayın</span>
                    </p>
                    <span className="text-2xs text-slate-400">
                      1 yıllık 8.760 saat veya dönemsel Excel / CSV dosyaları desteklenir
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Adım: EPİAŞ Entegrasyon Onayı */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-start gap-3">
              <input
                type="checkbox"
                id="autoSyncEpias"
                checked={autoSyncEpias}
                onChange={(e) => setAutoSyncEpias(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="autoSyncEpias" className="cursor-pointer">
                <span className="text-xs font-semibold text-slate-900 block">
                  Eksik saatlerin piyasa fiyatlarını (PTF / SMF) EPİAŞ Şeffaflık Platformu&apos;ndan otomatik tamamla
                </span>
                <span className="text-2xs text-slate-500 block mt-0.5">
                  Yüklediğiniz dönem veritabanında yoksa, EPİAŞ web servislerinden canlı piyasa fiyatları arka planda çekilerek anında eşleştirilir.
                </span>
              </label>
            </div>

            {/* Desteklenen Sütunlar Bilgilendirme */}
            <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-3 text-2xs text-blue-900 space-y-1">
              <span className="font-bold flex items-center gap-1">
                <HelpCircle className="h-3 w-3" /> Desteklenen Sütun Başlıkları:
              </span>
              <p className="text-slate-600 leading-relaxed">
                • <strong>Tarih:</strong> <code>Tarih</code>, <code>Date</code>, <code>Zaman</code> (Örn: 01.01.2025 veya 2025-01-01)<br />
                • <strong>Saat:</strong> <code>Saat</code>, <code>Hour</code> (Örn: <code>00:00</code> veya <code>1-24</code>)<br />
                • <strong>Tahmin:</strong> <code>KGÖP</code>, <code>Tahmin</code>, <code>Forecast</code>, <code>Planlanan</code> (MWh)<br />
                • <strong>Gerçekleşen:</strong> <code>Gerçekleşen</code>, <code>Üretim</code>, <code>Actual</code>, <code>UEV</code> (MWh)
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                İptal
              </Button>
              <Button
                onClick={handleUpload}
                disabled={loading || !file}
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 min-w-[140px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {progressMsg || "Yükleniyor..."}
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    Yükle ve Analiz Et
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
