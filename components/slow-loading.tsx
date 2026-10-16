import React from "react";
import { Loader2 } from "lucide-react";

/**
 * Ağır hesap sayfalarının yükleme göstergesi (hata ayıklama testi, 16.10.2026: geriye dönük test önbelleksiz 11–67 sn,
 * DSG 14–17 sn sürüyordu ve yalnız düz yazı vardı). Hesap önbelleğe alınır (lib/services/response-cache.ts); proje,
 * havuz ya da piyasa verisi değişince ilk açılış yeniden hesaplar.
 */
export function SlowLoading({ label, hint = "Veri değiştikten sonraki ilk açılışta bir dakikaya kadar sürebilir; sonraki açılışlar anında gelir." }: { label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600" role="status" aria-live="polite">
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-400" />
      <div>
        <p>{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
    </div>
  );
}
