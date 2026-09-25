import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/export/pptx
 * Uygulamanın PowerPoint çıktısı tek formattır: Dengesizlik Karnesi. Eski adres, sorgu parametreleriyle birlikte
 * /export/report'a yönlendirilir (eski yer imleri ve bağlantılar da yeni raporu indirir).
 */
export function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  url.pathname = `/api/projects/${params.id}/export/report`;
  return NextResponse.redirect(url, 307);
}
