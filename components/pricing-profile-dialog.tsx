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
import { Sliders, Check, RotateCcw, AlertCircle, Info } from "lucide-react";
import {
  ImbalancePricingProfile,
  ImbalanceProfileMode,
  REGULATORY_IMBALANCE_REGIMES,
} from "@/lib/calculations/types";

interface PricingProfileDialogProps {
  projectId: string;
  initialProfile?: ImbalancePricingProfile | null;
  onProfileUpdated?: (updated: ImbalancePricingProfile) => void;
  trigger?: React.ReactNode;
}

export function PricingProfileDialog({
  projectId,
  initialProfile,
  onProfileUpdated,
  trigger,
}: PricingProfileDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState("EPİAŞ Standart Profil");
  const [positiveSurplus, setPositiveSurplus] = useState("0.94");
  const [positiveOther, setPositiveOther] = useState("0.97");
  const [negativeDeficit, setNegativeDeficit] = useState("1.06");
  const [negativeOther, setNegativeOther] = useState("1.03");
  const [mode, setMode] = useState<ImbalanceProfileMode>("REGULATORY");

  const loadProfile = React.useCallback(async () => {
    if (initialProfile) {
      setName(initialProfile.name || "EPİAŞ Standart Profil");
      setPositiveSurplus(String(initialProfile.positiveSurplusCoef));
      setPositiveOther(String(initialProfile.positiveOtherCoef));
      setNegativeDeficit(String(initialProfile.negativeDeficitCoef));
      setNegativeOther(String(initialProfile.negativeOtherCoef));
      setMode(initialProfile.mode === "CUSTOM" ? "CUSTOM" : "REGULATORY");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pricing-profile`);
      if (!res.ok) throw new Error("Profil yüklenemedi.");
      const data = await res.json();
      if (data.profile) {
        setName(data.profile.name || "EPİAŞ Standart Profil");
        setPositiveSurplus(String(data.profile.positiveSurplusCoef));
        setPositiveOther(String(data.profile.positiveOtherCoef));
        setNegativeDeficit(String(data.profile.negativeDeficitCoef));
        setNegativeOther(String(data.profile.negativeOtherCoef));
        setMode(data.profile.mode === "CUSTOM" ? "CUSTOM" : "REGULATORY");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profil alınırken hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, [projectId, initialProfile]);

  useEffect(() => {
    if (open) {
      loadProfile();
      setSuccess(false);
      setError(null);
    }
  }, [open, loadProfile]);

  const handleApplyPreset = (type: "epias" | "symmetric" | "neutral") => {
    // Mevzuat şablonu dışındaki her seçim, katsayıları tüm tarihlere aynen uygular
    setMode(type === "epias" ? "REGULATORY" : "CUSTOM");
    if (type === "epias") {
      setName("EPİAŞ Standart Profil");
      setPositiveSurplus("0.94");
      setPositiveOther("0.97");
      setNegativeDeficit("1.06");
      setNegativeOther("1.03");
    } else if (type === "symmetric") {
      setName("Eski Simetrik Model (k=0.03)");
      setPositiveSurplus("0.97");
      setPositiveOther("0.97");
      setNegativeDeficit("1.03");
      setNegativeOther("1.03");
    } else if (type === "neutral") {
      setName("Toleransız Model (k=0)");
      setPositiveSurplus("1.00");
      setPositiveOther("1.00");
      setNegativeDeficit("1.00");
      setNegativeOther("1.00");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const posSurplusNum = parseFloat(positiveSurplus);
    const posOtherNum = parseFloat(positiveOther);
    const negDeficitNum = parseFloat(negativeDeficit);
    const negOtherNum = parseFloat(negativeOther);

    if (
      isNaN(posSurplusNum) ||
      posSurplusNum <= 0 ||
      isNaN(posOtherNum) ||
      posOtherNum <= 0 ||
      isNaN(negDeficitNum) ||
      negDeficitNum <= 0 ||
      isNaN(negOtherNum) ||
      negOtherNum <= 0
    ) {
      setError("Tüm katsayılar pozitif geçerli sayılar olmalıdır (örn: 0.94).");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/pricing-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Özel Piyasa Profili",
          positiveSurplusCoef: posSurplusNum,
          positiveOtherCoef: posOtherNum,
          negativeDeficitCoef: negDeficitNum,
          negativeOtherCoef: negOtherNum,
          mode,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Profil güncellenemedi.");
      }

      const data = await res.json();
      setSuccess(true);
      if (onProfileUpdated && data.profile) {
        onProfileUpdated(data.profile);
      }

      setTimeout(() => {
        setOpen(false);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncelleme sırasında hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            <Sliders className="h-3.5 w-3.5 text-slate-600" />
            Piyasa Profili
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-indigo-600">
            <Sliders className="h-5 w-5" />
            <DialogTitle className="text-lg font-bold text-slate-900">
              Dengesizlik Fiyatlama Profili Ayarları
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Projenin saatlik dengesizlik fiyatlama katsayılarını özelleştirin. Bu ayar
            sayesinde platform EPİAŞ DGP kurallarına veya farklı serbest piyasa
            kurallarına uyarlanabilir.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">
            Profil bilgileri yükleniyor...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200">
                <Check className="h-4 w-4 shrink-0" />
                <span>Piyasa profili başarıyla güncellendi! Veriler yenileniyor...</span>
              </div>
            )}

            {/* Hızlı Şablon Butonları */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <span className="text-[11px] font-semibold text-slate-600 block mb-2">
                Hızlı Şablon Seçimi:
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs bg-white text-slate-700 hover:bg-slate-100"
                  onClick={() => handleApplyPreset("epias")}
                >
                  ⚡ EPİAŞ Mevzuatı (tarihe göre)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs bg-white text-slate-700 hover:bg-slate-100"
                  onClick={() => handleApplyPreset("symmetric")}
                >
                  Sabit Simetrik (0.97 / 1.03)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs bg-white text-slate-700 hover:bg-slate-100"
                  onClick={() => handleApplyPreset("neutral")}
                >
                  Ceza Yok (1.00 / 1.00)
                </Button>
              </div>
            </div>

            {/* Profil Adı */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Profil Adı</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: EPİAŞ Standart Profil"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Mevzuat modu açıklaması */}
            {mode === "REGULATORY" ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] text-emerald-900">
                <div className="mb-1 font-semibold">Mevzuat modu: katsayılar her saatin tarihine göre seçilir</div>
                <ul className="space-y-0.5">
                  {REGULATORY_IMBALANCE_REGIMES.map((r) => (
                    <li key={r.from}>
                      <strong>{r.label}:</strong> pozitif {r.coefficients.positiveSurplusCoef} /{" "}
                      {r.coefficients.positiveOtherCoef}, negatif {r.coefficients.negativeDeficitCoef} /{" "}
                      {r.coefficients.negativeOtherCoef}
                    </li>
                  ))}
                </ul>
                <div className="mt-1 text-emerald-800/80">
                  Aşağıdaki alanlar güncel rejimi gösterir. Bir katsayıyı değiştirirseniz profil özel moda geçer ve
                  girdiğiniz değerler tüm tarihlere uygulanır.
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-900">
                <strong>Özel mod:</strong> aşağıdaki katsayılar veri setindeki tüm tarihlere aynen uygulanır (mevzuat
                rejim değişiklikleri dikkate alınmaz).
              </div>
            )}

            {/* Katsayı Alanları Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
              {/* Pozitif Dengesizlik (SURPLUS) */}
              <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-emerald-800">
                    Pozitif Dengesizlik (SURPLUS)
                  </label>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    1 − l (aynı yön)
                  </span>
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0.01"
                  max="2.00"
                  value={positiveSurplus}
                  onChange={(e) => {
                    setPositiveSurplus(e.target.value);
                    setMode("CUSTOM");
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-mono text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
                <p className="text-[10px] text-slate-500">
                  Formül: <code className="text-slate-700 font-mono">min(PTF,SMF) × {positiveSurplus}</code> (Sistem fazlası varken üreticiye az ödenir)
                </p>
              </div>

              {/* Pozitif Dengesizlik (Diğer - DEFICIT/BALANCED) */}
              <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-emerald-800">
                    Pozitif Dengesizlik (Diğer Yönler)
                  </label>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    1 − l
                  </span>
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0.01"
                  max="2.00"
                  value={positiveOther}
                  onChange={(e) => {
                    setPositiveOther(e.target.value);
                    setMode("CUSTOM");
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-mono text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
                <p className="text-[10px] text-slate-500">
                  Formül: <code className="text-slate-700 font-mono">min(PTF,SMF) × {positiveOther}</code> (Sistem açığı/dengedeyken standart iskonto)
                </p>
              </div>

              {/* Negatif Dengesizlik (DEFICIT) */}
              <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-rose-800">
                    Negatif Dengesizlik (DEFICIT)
                  </label>
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                    1 + k (aynı yön)
                  </span>
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0.01"
                  max="2.00"
                  value={negativeDeficit}
                  onChange={(e) => {
                    setNegativeDeficit(e.target.value);
                    setMode("CUSTOM");
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-mono text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
                <p className="text-[10px] text-slate-500">
                  Formül: <code className="text-slate-700 font-mono">max(PTF,SMF) × {negativeDeficit}</code> (Sistem açığı varken üreticiye pahalı satılır)
                </p>
              </div>

              {/* Negatif Dengesizlik (Diğer - SURPLUS/BALANCED) */}
              <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-rose-800">
                    Negatif Dengesizlik (Diğer Yönler)
                  </label>
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                    1 + k
                  </span>
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0.01"
                  max="2.00"
                  value={negativeOther}
                  onChange={(e) => {
                    setNegativeOther(e.target.value);
                    setMode("CUSTOM");
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-mono text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
                <p className="text-[10px] text-slate-500">
                  Formül: <code className="text-slate-700 font-mono">max(PTF,SMF) × {negativeOther}</code> (Sistem fazlası/dengedeyken standart prim)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-indigo-50/70 p-3 text-[11px] text-indigo-900 border border-indigo-100">
              <Info className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                Kaydettiğiniz katsayılar hem tüm saatlik gelir ve maliyet hesaplamalarını hem de indirilen <strong>Excel (.xlsx) formüllerini</strong> ve <strong>PowerPoint sunumlarını</strong> anında güncelleyecektir.
              </span>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                İptal
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {saving ? "Kaydediliyor..." : "Profili Kaydet & Uygula"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
