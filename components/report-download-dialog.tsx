"use client";

import React, { useEffect, useState } from "react";
import { Presentation } from "lucide-react";
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

const STORAGE_KEY = "trEnergy.report.author";
const LEGACY_KEY = "trEnergy.report.preparedBy";

interface Author {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
}

const EMPTY: Author = { name: "", title: "", email: "", phone: "", linkedin: "" };

const FIELDS: Array<{ key: keyof Author; label: string; placeholder: string; type?: string }> = [
  { key: "name", label: "Ad soyad", placeholder: "Ad Soyad" },
  { key: "title", label: "Unvan", placeholder: "Enerji Piyasası Analisti" },
  { key: "email", label: "E-posta", placeholder: "ad@ornek.com", type: "email" },
  { key: "phone", label: "Telefon", placeholder: "+90 5xx xxx xx xx", type: "tel" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/…" },
];

/**
 * Uygulamanın PowerPoint çıktısı: santral sahibine gönderilecek "Dengesizlik Karnesi" sunumunu indirir. Tüm PPT
 * düğmeleri bu bileşeni kullanır. Hazırlayanın adı ve iletişim bilgileri kapakta
 * ve kapanış slaytında yer alır; bu tarayıcıda hatırlanır (yalnızca kolaylık; saklanamazsa her seferinde yazılır).
 */
export function ReportDownloadDialog({
  projectId,
  label = "PowerPoint Raporu (.pptx)",
  compact = false,
  className = "",
}: {
  projectId: string;
  label?: string;
  /** Proje kartlarındaki küçük düğme görünümü */
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState<Author>(EMPTY);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setAuthor({ ...EMPTY, ...JSON.parse(saved) });
      else setAuthor({ ...EMPTY, name: localStorage.getItem(LEGACY_KEY) ?? "" });
    } catch {
      // depolama kapalıysa alanlar boş başlar
    }
  }, []);

  const params = new URLSearchParams();
  for (const f of FIELDS) {
    const v = author[f.key].trim();
    if (v) params.set(f.key, v);
  }
  const query = params.toString();
  const href = `/api/projects/${projectId}/export/report${query ? `?${query}` : ""}`;

  const remember = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(author));
    } catch {
      // hatırlanamazsa sorun değil
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 border-amber-600 text-amber-700 hover:bg-amber-50 ${compact ? "text-xs" : ""} ${className}`}
        >
          <Presentation className={compact ? "h-3 w-3 text-amber-600" : "h-3.5 w-3.5 text-amber-600"} />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>PowerPoint raporu: Dengesizlik Karnesi</DialogTitle>
          <DialogDescription>
            Santral sahibine gönderilecek PowerPoint raporu: yönetici özeti, maliyet köprüsü, santral karnesi, saatlik
            ısı haritası, 2026 riski, fırsatlar ve sonraki adım. Kesin hesaplar ve senaryolar ayrı etiketlenir.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-slate-700">Hazırlayan (kapakta ve kapanışta görünür, isteğe bağlı)</p>
          {FIELDS.map((f) => (
            <label key={f.key} className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs text-slate-600">
              {f.label}
              <input
                type={f.type ?? "text"}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={author[f.key]}
                maxLength={120}
                placeholder={f.placeholder}
                onChange={(e) => setAuthor((a) => ({ ...a, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
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
