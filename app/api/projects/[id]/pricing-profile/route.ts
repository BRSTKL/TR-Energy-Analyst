import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_IMBALANCE_PROFILE } from "@/lib/calculations/types";
import { recalculateProjectImbalances } from "@/lib/services/epias-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        pricingProfiles: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          error: `ID'si '${projectId}' olan proje bulunamadı.`,
        },
        { status: 404 }
      );
    }

    let profile = project.pricingProfiles?.[0];

    // Profil henüz yoksa otomatik oluştur
    if (!profile) {
      profile = await prisma.imbalancePricingProfile.create({
        data: {
          projectId,
          name: "EPİAŞ Standart Profil",
          positiveSurplusCoef: DEFAULT_IMBALANCE_PROFILE.positiveSurplusCoef,
          positiveOtherCoef: DEFAULT_IMBALANCE_PROFILE.positiveOtherCoef,
          negativeDeficitCoef: DEFAULT_IMBALANCE_PROFILE.negativeDeficitCoef,
          negativeOtherCoef: DEFAULT_IMBALANCE_PROFILE.negativeOtherCoef,
        },
      });
    }

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("Pricing profile GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Fiyatlandırma profili getirilirken hata oluştu.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = await request.json();

    const {
      name,
      positiveSurplusCoef,
      positiveOtherCoef,
      negativeDeficitCoef,
      negativeOtherCoef,
      mode: rawMode,
    } = body;
    const mode = rawMode === "CUSTOM" ? "CUSTOM" : "REGULATORY";

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { pricingProfiles: true },
    });

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          error: `ID'si '${projectId}' olan proje bulunamadı.`,
        },
        { status: 404 }
      );
    }

    // Doğrulama
    const posSurplus = Number(positiveSurplusCoef);
    const posOther = Number(positiveOtherCoef);
    const negDeficit = Number(negativeDeficitCoef);
    const negOther = Number(negativeOtherCoef);

    const all = [posSurplus, posOther, negDeficit, negOther];
    if (all.every((v) => Number.isFinite(v) && v > 0) && all.some((v) => v < 0.5 || v > 2)) {
      return NextResponse.json(
        { success: false, error: "Katsayılar 0,5 ile 2 arasında olmalıdır (ör. 0,94 ya da 1,06)." },
        { status: 400 }
      );
    }

    if (
      isNaN(posSurplus) ||
      posSurplus <= 0 ||
      isNaN(posOther) ||
      posOther <= 0 ||
      isNaN(negDeficit) ||
      negDeficit <= 0 ||
      isNaN(negOther) ||
      negOther <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Katsayılar pozitif geçerli sayılar olmalıdır.",
        },
        { status: 400 }
      );
    }

    const existingProfile = project.pricingProfiles?.[0];

    let updated;
    if (existingProfile) {
      updated = await prisma.imbalancePricingProfile.update({
        where: { id: existingProfile.id },
        data: {
          name: typeof name === "string" && name.trim() ? name.trim() : existingProfile.name,
          positiveSurplusCoef: posSurplus,
          positiveOtherCoef: posOther,
          negativeDeficitCoef: negDeficit,
          negativeOtherCoef: negOther,
          mode,
        },
      });
    } else {
      updated = await prisma.imbalancePricingProfile.create({
        data: {
          projectId,
          name: typeof name === "string" && name.trim() ? name.trim() : "Özel Piyasa Profili",
          positiveSurplusCoef: posSurplus,
          positiveOtherCoef: posOther,
          negativeDeficitCoef: negDeficit,
          negativeOtherCoef: negOther,
          mode,
        },
      });
    }

    // Kayıtlı saatlik maliyetleri yeni profile göre güncelle (analiz ekranları zaten profilden yeniden hesaplar)
    await recalculateProjectImbalances(projectId, new Date("2000-01-01T00:00:00Z"), new Date("2100-01-01T00:00:00Z"), true);

    return NextResponse.json({
      success: true,
      profile: updated,
      message: "Fiyatlandırma profili başarıyla güncellendi.",
    });
  } catch (error) {
    console.error("Pricing profile PUT error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Fiyatlandırma profili güncellenirken hata oluştu.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
