import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  syncEpiasToDatabase,
  testEpiasConnection,
} from "@/lib/services/epias-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/epias/sync
 * EPİAŞ bağlantı durumunu ve veritabanındaki piyasa verisi kapsamını sorgular.
 */
export async function GET() {
  try {
    const connectionTest = await testEpiasConnection();

    // Veritabanındaki mevcut market data istatistikleri
    const stats = await prisma.marketData.aggregate({
      _count: { id: true },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });

    return NextResponse.json({
      success: true,
      connected: connectionTest.ok,
      username: connectionTest.username || null,
      connectionError: connectionTest.error || null,
      dbStats: {
        totalRecords: stats._count.id,
        minDate: stats._min.timestamp,
        maxDate: stats._max.timestamp,
      },
    });
  } catch (error) {
    console.error("EPİAŞ GET /api/epias/sync error:", error);
    return NextResponse.json(
      {
        success: false,
        connected: false,
        error: error instanceof Error ? error.message : "EPİAŞ durumu kontrol edilirken hata oluştu.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/epias/sync
 * Belirtilen tarih aralığı için EPİAŞ'tan piyasa verilerini çeker,
 * MarketData tablosuna yazar ve opsiyonel olarak projedeki santrallerin kayıtlarını günceller.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { startDate, endDate, projectId, recalculateCosts = true } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        {
          success: false,
          error: "Başlangıç (startDate) ve Bitiş (endDate) tarihleri zorunludur.",
        },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçersiz tarih formatı. Lütfen 'YYYY-MM-DD' biçiminde tarih giriniz.",
        },
        { status: 400 }
      );
    }

    if (start.getTime() > end.getTime()) {
      return NextResponse.json(
        {
          success: false,
          error: "Başlangıç tarihi bitiş tarihinden sonra olamaz.",
        },
        { status: 400 }
      );
    }

    // EPİAŞ senkronizasyonunu çalıştır
    const syncResult = await syncEpiasToDatabase({
      startDate,
      endDate,
      projectId,
      recalculateCosts,
    });

    return NextResponse.json(syncResult);
  } catch (error) {
    console.error("EPİAŞ POST /api/epias/sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "EPİAŞ senkronizasyonu sırasında hata oluştu.",
      },
      { status: 500 }
    );
  }
}
