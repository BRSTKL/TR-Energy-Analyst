import { NextResponse } from "next/server";
import { loadSystemDrivers } from "@/lib/services/system-drivers";

export const dynamic = "force-dynamic";

/**
 * GET /api/sector/system-drivers
 * Sistem yönünü ne belirledi: kaynak türüne göre plan sapması (UEVM − KGÜP) ve tüketim tahmini hatası, açık ve fazla
 * saatlerde; ay ay, günün saatine göre ve önceki yılın aynı aylarıyla (lib/analysis/system-drivers.ts).
 */
export async function GET() {
  const data = await loadSystemDrivers();
  if (!data.years.length)
    return NextResponse.json(
      { success: false, error: "Sistem geneli veri havuzda yok. Çekmek için: npx tsx --env-file=.env --tsconfig tsconfig.json scripts/system-sync.mts" },
      { status: 422 }
    );
  return NextResponse.json({ success: true, ...data });
}
