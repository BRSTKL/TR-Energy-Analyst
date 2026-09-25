import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backupDatabase } from "@/lib/db-backup";
import { writePlantImports } from "@/lib/import/persist";
import { syncEpiasToDatabase } from "@/lib/services/epias-service";
import { DEFAULT_IMBALANCE_PROFILE, toPricingProfile } from "@/lib/calculations/types";
import { plantNameKey, validatePlantInput, type PlantInput } from "@/lib/plants/validation";
import { monthChunks } from "@/lib/date-chunks";
import type { ParsedGenerationRow } from "@/lib/parsers/generation-parser";

export const dynamic = "force-dynamic";

interface PlantPayload {
  plantName: unknown;
  type: unknown;
  capacityMw: unknown;
  source?: { powerPlantId?: number; uevcbIds?: number[]; kgupVersion?: string };
  /** EPİAŞ'tan bulunan sahip şirket ve YEKDEM durumu (bulunamadıysa null) */
  meta?: { organizationId?: number | null; organizationName?: string | null; yekdem?: boolean | null };
  rows: unknown;
}

const sourceNote = (s: PlantPayload["source"]) =>
  `KGÜP ${s?.kgupVersion === "FINAL" ? "son" : "ilk"} versiyon (plan) ve UEVM (gerçekleşen). Santral kimliği ${
    s?.powerPlantId ?? "?"
  }, UEVÇB ${Array.isArray(s?.uevcbIds) ? s.uevcbIds.join(", ") : "?"}.`;

const parseRows = (raw: unknown): ParsedGenerationRow[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((r: unknown) => Array.isArray(r) && r.length === 3 && r.every((x) => Number.isFinite(Number(x))))
    .map(([t, f, a]: number[]) => ({
      timestamp: new Date(Number(t)),
      forecastMwh: Number(f),
      actualMwh: Number(a),
      imbalanceMwh: Number(a) - Number(f),
    }));

/**
 * POST /api/epias/plants/project
 * { projectName, description? | targetProjectId,
 *   plants: [{ plantName, type, capacityMw, source: { powerPlantId, uevcbIds, kgupVersion }, rows: [[t, kgup, uevm], ...] }] }
 *
 * EPİAŞ'tan çekilip birleştirilmiş saatlik veriyle bir veya birden çok santral kaydeder: targetProjectId verilirse
 * santraller o projeye eklenir (projenin fiyat profili kullanılır), yoksa yeni proje açılır. Aralıktaki piyasa
 * fiyatı eksik aylar önce EPİAŞ'tan senkronlanır (başarısız olursa kayıtlar yine yazılır, eksik saatler raporlanır).
 * Tüm santraller önce doğrulanır; biri geçersizse hiçbiri yazılmaz.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const targetProjectId = typeof body.targetProjectId === "string" && body.targetProjectId ? body.targetProjectId : null;
    const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!targetProjectId && !projectName) {
      return NextResponse.json({ success: false, error: "Proje adı gerekli." }, { status: 400 });
    }
    const payloads: PlantPayload[] = Array.isArray(body.plants) ? body.plants : [];
    if (payloads.length === 0) return NextResponse.json({ success: false, error: "En az bir santral gerekli." }, { status: 400 });

    const target = targetProjectId
      ? await prisma.project.findUnique({
          where: { id: targetProjectId },
          include: { plants: { select: { id: true, name: true } }, pricingProfiles: true },
        })
      : null;
    if (targetProjectId && !target) {
      return NextResponse.json({ success: false, error: "Seçilen proje bulunamadı." }, { status: 404 });
    }

    // 1. Doğrulama: ad (proje ve istek içinde benzersiz), tür, güç ve saatlik veri
    const taken = new Set((target?.plants ?? []).map((p) => plantNameKey(p.name)));
    type EpiasFields = { epiasPlantId?: number; organizationId?: number; organizationName?: string; yekdem?: boolean };
    const plants: Array<{ input: PlantInput & EpiasFields; rows: ParsedGenerationRow[]; source: PlantPayload["source"] }> = [];
    for (const p of payloads) {
      const v = validatePlantInput({ name: p.plantName, type: p.type, capacityMw: p.capacityMw }, taken);
      if (!v.ok) return NextResponse.json({ success: false, error: `Santral: ${v.error}.` }, { status: 400 });
      const rows = parseRows(p.rows);
      if (rows.length === 0) {
        return NextResponse.json({ success: false, error: `${v.value.name}: yazılacak saatlik veri yok.` }, { status: 400 });
      }
      taken.add(plantNameKey(v.value.name));
      const epias: EpiasFields = {};
      if (Number.isInteger(p.source?.powerPlantId)) epias.epiasPlantId = p.source!.powerPlantId;
      if (Number.isInteger(p.meta?.organizationId)) {
        epias.organizationId = p.meta!.organizationId!;
        epias.organizationName = String(p.meta!.organizationName ?? "");
      }
      if (typeof p.meta?.yekdem === "boolean") epias.yekdem = p.meta.yekdem;
      plants.push({ input: { ...v.value, ...epias }, rows, source: p.source });
    }

    // 2. Piyasa fiyatı eksik ayları senkronla
    let minT = Infinity;
    let maxT = -Infinity;
    for (const p of plants) {
      for (const r of p.rows) {
        const t = r.timestamp.getTime();
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
    }
    const startDay = new Date(minT).toISOString().slice(0, 10);
    const endDay = new Date(maxT).toISOString().slice(0, 10);
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

    // 3. Proje (veya mevcut proje) ve santraller; 4. saatlik kayıtlar (öncesinde yedek)
    await backupDatabase(prisma, "epias-plant-import");
    const notes = plants.map((p) => `EPİAŞ: ${p.input.name}: ${sourceNote(p.source)}`);

    let projectId: string;
    let createdPlants: Array<{ id: string; name: string }>;
    let overlap: number | null = null;
    if (target) {
      // Portföy analizleri (DSG) ortak saatlere bakar: mevcut santrallerle hiç ortak saat yoksa uyar
      overlap =
        target.plants.length === 0
          ? null
          : await prisma.generationRecord.count({
              where: { plantId: { in: target.plants.map((p) => p.id) }, timestamp: { gte: new Date(minT), lte: new Date(maxT) } },
            });
      createdPlants = [];
      for (const p of plants) {
        createdPlants.push(
          await prisma.powerPlant.create({ data: { ...p.input, projectId: target.id }, select: { id: true, name: true } })
        );
      }
      await prisma.project.update({
        where: { id: target.id },
        data: { description: [target.description, ...notes].filter(Boolean).join("\n") },
      });
      projectId = target.id;
    } else {
      const project = await prisma.project.create({
        data: {
          name: projectName,
          description: [description, ...notes].filter(Boolean).join("\n"),
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
          plants: { create: plants.map((p) => p.input) },
        },
        include: { plants: { select: { id: true, name: true } } },
      });
      projectId = project.id;
      createdPlants = project.plants;
    }

    const idByName = new Map(createdPlants.map((p) => [plantNameKey(p.name), p.id]));
    const profile = target ? toPricingProfile(target.pricingProfiles?.[0]) : DEFAULT_IMBALANCE_PROFILE;
    const written = await writePlantImports(
      plants.map((p) => ({ plantId: idByName.get(plantNameKey(p.input.name))!, rows: p.rows })),
      profile
    );

    return NextResponse.json({
      success: true,
      projectId,
      added: Boolean(target),
      plants: written.map((w) => ({
        name: createdPlants.find((p) => p.id === w.plantId)?.name,
        written: w.written,
        missingMarketHours: w.missingMarketHours,
      })),
      noOverlapWithExisting: overlap === 0,
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
