import { NextResponse } from "next/server";
import { loadPlantCard } from "@/lib/services/plant-card";

export const dynamic = "force-dynamic";

/** GET /api/plants/<EPİAŞ santral kimliği>?year= : Santral kartı (lib/services/plant-card.ts) */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "Geçersiz santral kimliği" }, { status: 400 });
  const year = Number(new URL(request.url).searchParams.get("year")) || null;
  try {
    const card = await loadPlantCard(id, year);
    if (!card) return NextResponse.json({ success: false, error: "Bu kimlikte analiz edilen bir santral yok" }, { status: 404 });
    return NextResponse.json({ success: true, card });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Santral kartı okunamadı" }, { status: 500 });
  }
}
