import React from "react";
import { AlertTriangle, Info } from "lucide-react";
import { nf } from "@/lib/format";
import type { PriceLimit } from "@/lib/analysis/price-limit";

const day = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/**
 * Fiyat limiti notu. Limit verideki platodan çıkarılır (lib/analysis/price-limit.ts), resmî değer gibi sunulmaz. Son 7 günde
 * tavanda saat varsa uyarı tonu.
 */
export function PriceLimitNote({
  limit,
  bare = false,
  compact = false,
}: {
  limit: PriceLimit | null;
  bare?: boolean;
  /** Tek satır özet (limit ve tavandaki saat sayısı); ayrıntı satıra tıklayınca açılır */
  compact?: boolean;
}) {
  if (!limit) return null;
  const hot = limit.hoursLast7 > 0;
  const Icon = hot ? AlertTriangle : Info;
  if (compact)
    return (
      <details className="group rounded-md border border-slate-200 bg-white text-sm text-slate-700">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
          <Icon className={`h-4 w-4 shrink-0 ${hot ? "text-amber-600" : "text-slate-400"}`} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <b>PTF fiyat limiti {nf(limit.cap)} TL/MWh</b> · son {limit.windowDays} günde {limit.hoursInWindow} saat tavanda
          </span>
          <span className="shrink-0 text-xs text-slate-500 group-open:hidden">Ayrıntı</span>
        </summary>
        <div className="border-t border-slate-100 px-3 py-2">
          <PriceLimitNote limit={limit} bare />
        </div>
      </details>
    );
  return (
    <div
      className={
        bare
          ? "flex gap-2 text-sm text-slate-700"
          : `flex gap-2 rounded-md border p-3 text-sm ${hot ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`
      }
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <b>PTF fiyat limiti: {nf(limit.cap)} TL/MWh</b> (verideki platodan çıkarıldı; EPDK
        kararıyla doğrulanmadı). Son {limit.windowDays} günde {limit.hoursInWindow} saat,
        son 7 günde {limit.hoursLast7} saat tavanda.{" "}
        {limit.previousCap !== null
          ? `İlk görüldüğü gün ${day(limit.firstSeen)}; öncesinde ${nf(limit.previousCap)} TL/MWh. `
          : ""}
        Tavandaki saatte sistem açığı için dengesizlik fiyatı azami fiyat limiti × 1,05
        kuralına döner (md. 110).
      </p>
    </div>
  );
}
