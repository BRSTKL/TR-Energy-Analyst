import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backupDatabase } from "@/lib/db-backup";
import { writePlantImports } from "@/lib/import/persist";
import { syncEpiasToDatabase } from "@/lib/services/epias-service";
import { DEFAULT_IMBALANCE_PROFILE } from "@/lib/calculations/types";
import { validatePlantInput } from "@/lib/plants/validation";
import { monthChunks } from "@/lib/date-chunks";
import type { ParsedGenerationRow } from "@/lib/parsers/generation-parser";

export const dynamic = "force-dynamic";

/**
 * POST /api/epias/plants/project
 * { projectName, plantName, type, capacityMw, source: { powerPlantId, uevcbIds }, rows: [[t, kgup, uevm], ...] }
 * EPİAŞ'tan çekilip birleştirilmiş saatlik veriyle yeni proje ve santral oluşturur. Aralıktaki piyasa fiyatı
 * eksik aylar önce EPİAŞ'tan senkronlanır (başarısız olursa kayıtlar yine yazılır, eksik saatler raporlanır).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
    if (!projectName) return NextResponse.json({ success: false, error: "Proje adı gerekli." }, { status: 400 });

    const plant = validatePlantInput({ name: body.plantName, type: body.type, capacityMw: body.capacityMw }, new Set());
    if (!plant.ok) return NextResponse.json({ success: false, error: `Santral: ${plant.error}.` }, { status: 400 });

    const rows: ParsedGenerationRow[] = (Array.isArray(body.rows) ? body.rows : [])
      .filter((r: unknown) => Array.isArray(r) && r.length === 3 && r.every((x) => Number.isFinite(Number(x))))
      .map(([t, f, a]: number[]) => ({ timestamp: new Date(Number(t)), forecastMwh: Number(f), actualMwh: Number(a), imbalanceMwh: Number(a) - Number(f) }));
    if (rows.length === 0) return NextResponse.json({ success: false, error: "Yazılacak saatlik veri yok." }, { status: 400 });

    // 1. Piyasa fiyatı eksik ayları senkronla
    const times = rows.map((r) => r.timestamp.getTime());
    const startDay = new Date(Math.min(...times)).toISOString().slice(0, 10);
    const endDay = new Date(Math.max(...times)).toISOString().slice(0, 10);
    const syncErrors: string[] = [];
    for (const chunk of monthChunks(startDay, endDay)) {
      const from = new Date(`${chunk.start}T00:00:00Z`);
      const to = new Date(`${chunk.end}T23:00:00Z`);
      const expected = Math.round((to.getTime() - from.getTime()) / 3_600_000) + 1;
      const have = await prisma.marketData.count({
        where: { timestamp: { gte: from, lte: to }, source: { in: ["EPIAS", "FILE"] } },
      });
      if (have >= expected * 0.99) continue;
      try {
        await syncEpiasToDatabase({ startDate: chunk.start, endDate: chunk.end, recalculateCosts: false });
      } catch (err) {
        syncErrors.push(`${chunk.label}: ${err instanceof Error ? err.message : "hata"}`);
      }
    }

    // 2. Proje, fiyat profili ve santral; 3. saatlik kayıtlar (öncesinde yedek)
    await backupDatabase(prisma, "epias-plant-import");
    const project = await prisma.project.create({
      data: {
        name: projectName,
        description: `EPİAŞ açık verisi: KGÜP (plan) ve UEVM (gerçekleşen). Santral kimliği ${body.source?.powerPlantId ?? "?"}, UEVÇB ${
          Array.isArray(body.source?.uevcbIds) ? body.source.uevcbIds.join(", ") : "?"
        }.`,
        pricingProfiles: {
          create: {
            name: "EPİAŞ Standart Profil",
            mode: "REGULATORY",
            positiveSurplusCoef: DEFAULT_IMBALANCE_PROFILE.positiveSurplusCoef,
            positiveOtherCoef: DEFAULT_IMBALANCE_PROFILE.positiveOtherCoef,
            negativeDeficitCoef: DEFAULT_IMBALANCE_PROFILE.negativeDeficitCoef,
            negativeOtherCoef: DEFAULT_IMBALANCE_PROFILE.negativeOtherCoef,
          },
        },
        plants: { create: [plant.value] },
      },
      include: { plants: true },
    });
    const [written] = await writePlantImports([{ plantId: project.plants[0].id, rows }], DEFAULT_IMBALANCE_PROFILE);

    return NextResponse.json({
      success: true,
      projectId: project.id,
      written: written?.written ?? 0,
      missingMarketHours: written?.missingMarketHours ?? 0,
      syncErrors,
    });
  } catch (error) {
    console.error("EPİAŞ plant project error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Proje oluşturulamadı." },
      { status: 500 }
    );
  }
}
