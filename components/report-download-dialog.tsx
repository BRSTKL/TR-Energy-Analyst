"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Presentation, RefreshCw } from "lucide-react";
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

/** Tutarlılık denetimi bulgusu (lib/report/report-checks.ts) */
interface AuditIssue {
  level: "error" | "warning";
  rule: string;
  message: string;
}

interface ReportCheck {
  unknownOwner: string[];
  yekdemNextUnknown: string[];
  missing: Array<{ company: string; plants: string[] }>;
}

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
  /** Tam rapor, anonim örnek (herkese açık paylaşım) ya da tek sayfalık özet (ilk mesaj için) */
  const [variant, setVariant] = useState<"full" | "anon" | "summary" | "summaryAnon">("full");
  const [check, setCheck] = useState<ReportCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  /** Seçilen sürümün tutarlılık denetimi: rapor üretilip köprü, tablo toplamları, aylar, netleşme ve ad sızıntısı sınanır */
  const [audit, setAudit] = useState<{ variant: string; issues: AuditIssue[] | null; error: string | null } | null>(null);

  // Pencere açılınca raporun dayandığı EPİAŞ bilgilerini kontrol et
  const runCheck = () => {
    setChecking(true);
    fetch(`/api/projects/${projectId}/report-check`)
      .then((r) => r.json())
      .then((d) => d.success && setCheck({ unknownOwner: d.unknownOwner, yekdemNextUnknown: d.yekdemNextUnknown, missing: d.missing }))
      .catch(() => {})
      .finally(() => setChecking(false));
  };
  useEffect(() => {
    if (open) runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  // Sürüm değişince o sürümü denetle (rapor sunucuda üretilir: birkaç saniye)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const q = new URLSearchParams({ full: "1" });
    if (variant === "anon" || variant === "summaryAnon") q.set("anon", "1");
    if (variant === "summary" || variant === "summaryAnon") q.set("summary", "1");
    setAudit({ variant, issues: null, error: null });
    fetch(`/api/projects/${projectId}/report-check?${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setAudit(d.success ? { variant, issues: d.issues as AuditIssue[], error: null } : { variant, issues: null, error: d.error ?? "Denetim yapılamadı." });
      })
      .catch(() => !cancelled && setAudit({ variant, issues: null, error: "Denetim yapılamadı." }));
    return () => {
      cancelled = true;
    };
  }, [open, projectId, variant]);

  const updateEpias = async () => {
    setUpdating(true);
    setUpdateError(null);
    try {
      const d = await fetch(`/api/projects/${projectId}/epias-meta`, { method: "POST" }).then((r) => r.json());
      if (!d.success) throw new Error(d.error);
      if (d.errors?.length) setUpdateError(d.errors.join(" "));
      runCheck();
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : "EPİAŞ bilgileri güncellenemedi.");
    } finally {
      setUpdating(false);
    }
  };

  const warnings: string[] = [];
  if (check) {
    for (const m of check.missing) warnings.push(`${m.company} şirketinin ${m.plants.length} santrali projede yok: ${m.plants.join(", ")}.`);
    if (check.unknownOwner.length)
      warnings.push(`Sahibi bilinmeyen santral: ${check.unknownOwner.join(", ")}. Rapor bunları ayrı şirket sayar; aynı şirketin santralleriyse risk olduğundan yüksek görünür.`);
    if (check.yekdemNextUnknown.length)
      warnings.push(`YEKDEM'den çıkış yılı bilinmeyen santral: ${check.yekdemNextUnknown.join(", ")}.`);
  }
  const nameWords = author.name.trim().split(/\s+/).filter(Boolean).length;
  const preview = [author.name, author.title, author.email, author.phone, author.linkedin].map((v) => v.trim()).filter(Boolean);

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
  if (variant === "anon") params.set("anon", "1");
  if (variant === "summary") params.set("summary", "1");
  if (variant === "summaryAnon") {
    params.set("summary", "1");
    params.set("anon", "1");
  }
  const query = params.toString();
  const href = `/api/projects/${projectId}/export/report${query ? `?${query}` : ""}`;
  const forceHref = `/api/projects/${projectId}/export/report?${query ? `${query}&` : ""}force=1`;
  const auditing = !audit || audit.variant !== variant || (audit.issues === null && audit.error === null);
  const auditErrors = audit?.issues?.filter((i) => i.level === "error") ?? [];
  const auditWarnings = audit?.issues?.filter((i) => i.level === "warning") ?? [];

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
        {author.name.trim() && nameWords < 2 && (
          <p className="text-xs text-amber-700">Ad soyad alanına adınızı ve soyadınızı birlikte yazın (ör. Barış Yılmaz); unvanı ayrı alana.</p>
        )}
        {preview.length > 0 && (
          <div className="rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-200">
            <span className="font-semibold text-teal-300">Kapakta: </span>
            <span className="font-semibold text-white">{author.name.trim() || "—"}</span>
            {preview.length > 1 && <span> · {preview.slice(1).join(" · ")}</span>}
          </div>
        )}

        <div className="space-y-1.5 rounded-md border border-slate-200 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">Rapor kontrolü</p>
            <Button type="button" size="sm" variant="outline" onClick={updateEpias} disabled={updating} className="h-7 gap-1 px-2 text-xs">
              {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              EPİAŞ bilgilerini güncelle
            </Button>
          </div>
          {checking && !check && <p className="text-xs text-slate-500">Kontrol ediliyor…</p>}
          {check && warnings.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Santral sahipleri ve YEKDEM durumu tamam; şirketin eksik santrali yok.
            </p>
          )}
          {warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
            </p>
          ))}
          {updateError && <p className="text-xs text-rose-700">{updateError}</p>}
          <p className="text-2xs text-slate-500">
            Güncelleme santral sahiplerini ve YEKDEM durumunu EPİAŞ&apos;tan alır (VPN açık olmalı). Eksik santralleri Santraller
            sayfasındaki &ldquo;EPİAŞ&apos;tan santral ekle&rdquo; ile ekleyebilirsiniz.
          </p>
        </div>

        <fieldset className="space-y-1.5 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-700">Sürüm</legend>
          {(
            [
              ["full", "Tam rapor", "Santral, üretici ve toplayıcı adlarıyla (şirketin kendisine)"],
              ["anon", "Anonim örnek", "Adlar takma adla: herkese açık örnek analiz (LinkedIn, özgeçmiş)"],
              ["summary", "Tek sayfa özet", "İlk mesaja eklenecek tek slayt"],
              ["summaryAnon", "Tek sayfa özet, anonim", "Herkese açık tek slayt"],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className="flex cursor-pointer items-start gap-2 text-xs">
              <input type="radio" name="report-variant" className="mt-0.5" checked={variant === id} onChange={() => setVariant(id)} />
              <span>
                <span className="font-semibold text-slate-800">{label}</span>
                <span className="text-slate-500"> · {hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5 rounded-md border border-slate-200 p-2.5">
          <p className="text-xs font-semibold text-slate-700">Tutarlılık denetimi</p>
          {auditing && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rapor üretilip denetleniyor…
            </p>
          )}
          {!auditing && audit?.error && <p className="text-xs text-rose-700">{audit.error}</p>}
          {!auditing && audit?.issues && auditErrors.length === 0 && (
            <p className="flex items-start gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Köprü, tablo toplamları, aylık dağılım, netleşme ve bozuk değer denetimi tamam
              {variant === "anon" || variant === "summaryAnon" ? "; gerçek ad geçmiyor" : ""}.
            </p>
          )}
          {!auditing &&
            auditErrors.map((i, k) => (
              <p key={`e${k}`} className="flex items-start gap-1.5 text-xs text-rose-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.message}
              </p>
            ))}
          {!auditing &&
            auditWarnings.map((i, k) => (
              <p key={`w${k}`} className="flex items-start gap-1.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.message}
              </p>
            ))}
          {!auditing && auditErrors.length > 0 && (
            <p className="text-2xs text-slate-500">
              Rapor bu haliyle çelişkili rakam içerir; indirme durduruldu. Hata uygulamadadır, lütfen bildirin.{" "}
              <a href={forceHref} download onClick={remember} className="font-medium text-rose-700 underline">
                Yine de indir
              </a>
            </p>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Göndermeden önce rakamları gözden geçirin: rapor, şirketin gün içi işlemlerini ve ikili anlaşmalarını içermeyen
          açık veriye dayanır.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            İptal
          </Button>
          {auditing || auditErrors.length > 0 ? (
            <Button disabled>{auditing ? "Denetleniyor…" : "İndir (.pptx)"}</Button>
          ) : (
            <Button asChild onClick={remember}>
              <a href={href} download>
                İndir (.pptx)
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
