import { NextResponse } from "next/server";
import { displayDescription } from "@/lib/projects/description";
import { prisma } from "@/lib/prisma";
import { plantHourSummaries } from "@/lib/services/project-records";
import { plantNameKey, validatePlantInput } from "@/lib/plants/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      include: {
        pricingProfiles: true,
        plants: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const counts = await plantHourSummaries(projects);
    const enriched = projects.map((p) => {
      const totalCapacityMw = p.plants.reduce(
        (sum, plant) => sum + plant.capacityMw,
        0
      );
      const totalRecords = p.plants.reduce(
        (sum, plant) => sum + (counts.get(plant.id)?.count ?? 0),
        0
      );
      const plantTypes = Array.from(new Set(p.plants.map((pl) => pl.type)));

      return {
        id: p.id,
        name: p.name,
        description: displayDescription(p.description),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        plantCount: p.plants.length,
        totalCapacityMw: Number(totalCapacityMw.toFixed(1)),
        totalRecords,
        plantTypes,
        pricingProfile: p.pricingProfiles?.[0] || null,
        plants: p.plants.map((pl) => ({
          id: pl.id,
          name: pl.name,
          type: pl.type,
          capacityMw: pl.capacityMw,
          recordCount: counts.get(pl.id)?.count ?? 0,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      projects: enriched,
    });
  } catch (error) {
    console.error("Projects GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Projeler listelenirken bir hata oluştu.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "İstek gövdesi geçerli bir JSON değil." }, { status: 400 });
    }
    const { name, description, plants } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Proje adı zorunludur.",
        },
        { status: 400 }
      );
    }

    // Santral tanımları: ad zorunlu ve proje içinde benzersiz, tür RES/HES/GES, kurulu güç > 0
    const plantList: Array<{ name: string; type: string; capacityMw: number }> = [];
    if (plants !== undefined) {
      if (!Array.isArray(plants)) {
        return NextResponse.json({ success: false, error: "Santral listesi geçersiz." }, { status: 400 });
      }
      const seen = new Set<string>();
      for (const [i, pl] of plants.entries()) {
        const result = validatePlantInput(pl, seen);
        if (!result.ok) {
          return NextResponse.json({ success: false, error: `${i + 1}. santral: ${result.error}.` }, { status: 400 });
        }
        seen.add(plantNameKey(result.value.name));
        plantList.push(result.value);
      }
    }

    const created = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        pricingProfiles: {
          create: {
            name: "EPİAŞ Standart Profil",
            positiveSurplusCoef: 0.94,
            positiveOtherCoef: 0.97,
            negativeDeficitCoef: 1.06,
            negativeOtherCoef: 1.03,
          },
        },
        plants: plantList.length > 0 ? { create: plantList } : undefined,
      },
      include: {
        plants: true,
        pricingProfiles: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        project: created,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Projects POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Yeni proje oluşturulurken bir hata oluştu.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
