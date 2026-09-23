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
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface DeleteProjectDialogProps {
  projectId: string;
  projectName: string;
  plantCount: number;
  recordCount: number;
  onDeleted?: () => void;
  trigger?: React.ReactNode;
}

/**
 * Projeyi, santrallerini ve saatlik üretim kayıtlarını kalıcı olarak silmeden önce onay isteyen diyalog.
 * Silme, proje adı aynen yazıldığında etkinleşir.
 */
export function DeleteProjectDialog({
  projectId,
  projectName,
  plantCount,
  recordCount,
  onDeleted,
  trigger,
}: DeleteProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State güncellemesi yeniden çizimden önce ikinci tıklamayı engelleyemediği için senkron kilit
  const inFlight = useRef(false);

  const confirmed = confirmText.trim() === projectName.trim();

  const handleDelete = async () => {
    if (!confirmed || inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      // 404: proje zaten silinmiş (örn. başka bir sekmeden); hedef durum sağlandığı için başarı sayılır
      if (res.status !== 404) {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Proje silinemedi.");
        }
      }
      setOpen(false);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proje silinemedi.");
    } finally {
      inFlight.current = false;
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        setOpen(next);
        if (!next) {
          setConfirmText("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Projeyi Sil
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <DialogTitle className="text-lg">Projeyi Sil</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-600">
            Bu işlem geri alınamaz.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-slate-700">
          <p>
            <strong className="text-slate-900">{projectName}</strong> projesi ile birlikte şunlar
            kalıcı olarak silinecek:
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            <li>{plantCount.toLocaleString("tr-TR")} santral</li>
            <li>{recordCount.toLocaleString("tr-TR")} saatlik üretim kaydı</li>
            <li>Projeye özel piyasa profili (dengesizlik katsayıları)</li>
          </ul>
          <p className="text-xs text-slate-500">
            EPİAŞ piyasa verileri (PTF, SMF, sistem yönü, GİP) diğer projelerle ortak olduğu için
            silinmez.
          </p>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">
              Onaylamak için proje adını yazın:
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={projectName}
              autoComplete="off"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </label>

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
            Vazgeç
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
          >
            {deleting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Siliniyor...
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                Kalıcı Olarak Sil
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
