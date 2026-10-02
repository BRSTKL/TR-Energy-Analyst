import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { aggregatorDetail } from "@/lib/analysis/aggregator-detail";
import { loadBenchmarkPlants, loadBenchmarkPrices } from "@/lib/services/aggregator-data";

export const dynamic = "force-dynamic";

const CACHE = path.join(process.cwd(), ".cache", "epias");

/**
 * GET /api/sector/aggregators/[id]?year=2026 → toplayıcının ayrıntısı: santraller, aylık netleşme, üretici katkısı
 * (PLAN 9.2). Dönem ve sektör medyanları kıyas dosyasından (aggregator-benchmark-<yıl>.json), üyelik listesinden santraller.
 * Sonuç kıyas dosyası ve havuz değişmedikçe aynıdır; kısa süre bellekte tutulur.
 */
const memo = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 5 * 60_000;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const year = Number(new URL(request.url).searchParams.get("year") ?? 2026);
  if (!Number.isInteger(id) || !Number.isInteger(year)) return NextResponse.json({ success: false, error: "Geçersiz istek." }, { status: 400 });
  try {
    const benchFile = path.join(CACHE, `aggregator-benchmark-${year}.json`);
    if (!fs.existsSync(benchFile)) return NextResponse.json({ success: false, error: "Toplayıcı kıyası bu yıl için üretilmedi." }, { status: 404 });
    const key = `${year}:${id}:${fs.statSync(benchFile).mtimeMs}`;
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body);

    const bench = JSON.parse(fs.readFileSync(benchFile, "utf8")) as {
      period: { start: string; end: string };
      sectorMedians: Record<string, number>;
      membershipAsOf: string;
    };
    const membership = JSON.parse(fs.readFileSync(path.join(CACHE, "aggregator-membership.json"), "utf8")) as {
      aggregators: Array<{ id: number; name: string; plantIds: number[] }>;
    };
    const agg = membership.aggregators.find((a) => a.id === id);
    if (!agg) return NextResponse.json({ success: false, error: "Toplayıcı bulunamadı." }, { status: 404 });

    const [prices, plants] = await Promise.all([
      loadBenchmarkPrices(bench.period.start, bench.period.end),
      loadBenchmarkPlants(agg.plantIds, year, bench.period.start, bench.period.end),
    ]);
    const detail = aggregatorDetail(agg, plants, prices, bench.sectorMedians);
    const body = { success: true, year, id, name: agg.name, period: bench.period, membershipAsOf: bench.membershipAsOf, sectorMedians: bench.sectorMedians, ...detail };
    memo.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Ayrıntı hesaplanamadı." }, { status: 500 });
  }
}
