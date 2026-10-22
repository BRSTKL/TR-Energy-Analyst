import { NextResponse } from "next/server";
import { loadSystemAttribution, type AttrLevel } from "@/lib/services/system-attribution";
import type { AttrSource, Side } from "@/lib/analysis/system-attribution";

export const dynamic = "force-dynamic";

const pick = <T extends string>(v: string | null, allowed: readonly T[]): T | undefined => (allowed.includes(v as T) ? (v as T) : undefined);

/**
 * GET /api/sector/system-attribution?year=2026&month=01..12&side=deficit|surplus&source=wind|sun|river&level=company|aggregator|region|plant
 * (month verilmezse bütün dönem)
 * Sistem yönü "Kimden geldi?": seçilen kaynağın o yöne itmesinin şirket, toplayıcı ya da santral düzeyinde paylaşımı.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const data = loadSystemAttribution({
    year: Number(q.get("year")) || undefined,
    month: /^(0[1-9]|1[0-2])$/.test(q.get("month") ?? "") ? q.get("month") : null,
    side: pick<Side>(q.get("side"), ["deficit", "surplus"]),
    source: pick<AttrSource>(q.get("source"), ["wind", "sun", "river"]),
    level: pick<AttrLevel>(q.get("level"), ["company", "aggregator", "region", "plant"]),
  });
  if (!data)
    return NextResponse.json(
      { success: false, error: "Santral paylaşım dosyası yok. Üretmek için: npx tsx --env-file=.env --tsconfig tsconfig.json scripts/system-attribution.mts" },
      { status: 422 }
    );
  return NextResponse.json({ success: true, ...data });
}
