"use client";

import React, { useEffect, useState } from "react";
import { FileText } from "lucide-react";
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

const STORAGE_KEY = "trEnergy.report.preparedBy";

/**
 * Santral sahibine gönderilecek "Dengesizlik Karnesi" sunumunu indirir. Hazırlayan adı kapakta yer alır ve bu
 * tarayıcıda hatırlanır (yalnızca kolaylık; saklanamazsa her seferinde yazılır).
 */
export function ReportDownloadDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");

  useEffect(() => {
    try {
      setPreparedBy(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
      // depolama kapalıysa ad boş başlar
    }
  }, []);

  const href = `/api/projects/${projectId}/export/report${
    preparedBy.trim() ? `?preparedBy=${encodeURIComponent(preparedBy.trim())}` : ""
  }`;

  const remember = () => {
    try {
      localStorage.setItem(STORAGE_KEY, preparedBy.trim());
    } catch {
      // hatırlanamazsa sorun değil
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800">
          <FileText className="h-3.5 w-3.5" />
          Dengesizlik Karnesi
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dengesizlik Karnesi</DialogTitle>
          <DialogDescription>
            Santral sahibine gönderilecek 7 slaytlık kısa rapor: özet, santral tablosu, aylık maliyet, 2026 katsayılarının
            etkisi, fırsatlar ve yöntem. Kesin hesaplar ve senaryolar ayrı etiketlenir.
          </DialogDescription>
        </DialogHeader>
        <label className="block text-xs font-semibold text-slate-700">
          Hazırlayan (kapakta görünür, isteğe bağlı)
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={preparedBy}
            maxLength={80}
            placeholder="Ad Soyad"
            onChange={(e) => setPreparedBy(e.target.value)}
          />
        </label>
        <p className="text-xs text-slate-500">
          Göndermeden önce rakamları gözden geçirin: rapor, santralin gün içi işlemlerini ve ikili anlaşmalarını
          içermeyen açık veriye dayanır.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            İptal
          </Button>
          <Button asChild onClick={remember}>
            <a href={href} download>
              İndir (.pptx)
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
