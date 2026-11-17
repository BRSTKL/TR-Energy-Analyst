import { NextResponse } from "next/server";
import { loadCountryProduction } from "@/lib/services/country-production";
import { trClock } from "@/lib/services/live-day";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/production?day=today|tomorrow|YYYY-AA-GG
 *
 * Türkiye geneli rüzgâr ve güneş üretim tahmini, KGÜP, gerçekleşen ve yük tahmini (lib/services/country-production.ts).
 * EPİAŞ'tan istek anında, 5 dakika bellekte.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("day") ?? "today";
  const { today, tomorrow } = trClock();
  const date = q === "today" ? today : q === "tomorrow" ? tomorrow : q;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))
    return NextResponse.json({ success: false, error: "day today, tomorrow ya da YYYY-AA-GG olmalı." }, { status: 400 });
  if (date > tomorrow) return NextResponse.json({ success: false, error: "Yalnız yarına kadar olan günler sorulabilir." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, ...(await loadCountryProduction(date)) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Üretim verisi alınamadı." }, { status: 502 });
  }
}
