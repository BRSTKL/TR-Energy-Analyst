import { NextResponse } from "next/server";
import type { ReportAuthor } from "@/lib/export/plant-report-pptx";
import { buildReportExport } from "@/lib/services/report-export";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/export/report?name=&title=&email=&phone=&linkedin=&anon=1&summary=1&force=1
 * Santral sahibine gönderilecek "Dengesizlik Karnesi" sunumu (PPTX). İletişim alanları kapakta ve kapanışta görünür;
 * hepsi isteğe bağlıdır (eski preparedBy parametresi ad olarak kabul edilir). Aynı santrallerin bir önceki yıl projesi
 * varsa "Ne değişti?" slaytı eklenir. Toplayıcı projelerinde aynı yılın sektör karnesinden "Büyüme" (hedef santraller) slaytı eklenir.
 *
 * Rapor üretildikten sonra tutarlılık denetiminden geçer (lib/report/report-checks.ts): köprü, tablo toplamları, aylık
 * dağılım, netleşme, bozuk değer, anonim sürümde ad sızıntısı. Hata varsa rapor verilmez (422, bulgularla); force=1 ile
 * yine de indirilebilir. İndirme penceresi aynı denetimi önceden çalıştırıp sonucu gösterir.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const q = new URL(request.url).searchParams;
    const field = (key: string) => (q.get(key) ?? "").trim().slice(0, 120) || undefined;
    const author: ReportAuthor = {
      name: field("name") ?? field("preparedBy"),
      title: field("title"),
      email: field("email"),
      phone: field("phone"),
      linkedin: field("linkedin"),
    };
    // Anonim sürüm (?anon=1): herkese açık örnek analiz için santral, üretici ve toplayıcı adları takma adla (PLAN 8.10)
    const res = await buildReportExport(params.id, { anon: q.get("anon") === "1", summaryOnly: q.get("summary") === "1" }, author);
    if (!res) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });

    const errors = res.issues.filter((i) => i.level === "error");
    if (errors.length) {
      console.error(`Rapor denetimi (${params.id}): ${errors.length} hata`, errors);
      if (q.get("force") !== "1")
        return NextResponse.json(
          { success: false, error: "Rapor tutarlılık denetiminden geçmedi; indirme durduruldu.", issues: res.issues },
          { status: 422 }
        );
    }
    const filename = encodeURIComponent(res.filename);
    return new NextResponse(res.buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
        "X-Report-Check": errors.length ? `errors=${errors.length}` : "ok",
      },
    });
  } catch (error) {
    console.error("Plant report export error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Rapor oluşturulamadı." },
      { status: 500 }
    );
  }
}
