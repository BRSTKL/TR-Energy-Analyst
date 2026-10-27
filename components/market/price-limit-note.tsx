import React from "react";
import { AlertTriangle, Info } from "lucide-react";
import { nf } from "@/lib/format";
import type { PriceLimit } from "@/lib/analysis/price-limit";

const day = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/**
 * Fiyat limiti notu. Limit verideki platodan çıkarılır (lib/analysis/price-limit.ts), resmî değer gibi sunulmaz. Son 7 günde
 * tavanda saat varsa uyarı tonu.
 */
export function PriceLimitNote({ limit }: { limit: PriceLimit | null }) {
  if (!limit) return null;
  const hot = limit.hoursLast7 > 0;
  const Icon = hot ? AlertTriangle : Info;
  return (
    <div
      className={`flex gap-2 rounded-md border p-3 text-sm ${hot ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`}
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
