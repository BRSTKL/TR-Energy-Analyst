import { NextResponse } from "next/server";
import { loadPortfolioForecast } from "@/lib/services/portfolio-forecast";
import { trTomorrow } from "@/lib/services/ops-status";

export const dynamic = "force-dynamic";

/**
 * GET /api/ops/portfolio-forecast[?date=YYYY-AA-GG]
 *
 * Projelerin santrallerinin güneş ve rüzgâr üretim tahmini, sunucunun sabah yazdığı değişmeyen kayıtlardan (tarih verilmezse yarın).
 * Yalnız dosya ve veritabanı okur; hava servisine istek atmaz (lib/services/portfolio-forecast.ts).
 */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? trTomorrow(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ success: false, error: "Tarih YYYY-AA-GG olmalı." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, ...(await loadPortfolioForecast(date)) });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Portföy tahmini okunamadı." },
      { status: 500 }
    );
  }
}
