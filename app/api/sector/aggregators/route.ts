import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * GET /api/sector/aggregators?year=2026 → toplayıcılar arası kıyas (scripts/aggregator-benchmark.mts ile üretilen
 * .cache/epias/aggregator-benchmark-<yıl>.json). Yıl verilmezse en güncel; yoksa 404 ve üretme komutu.
 */
export async function GET(request: Request) {
  const dir = path.join(process.cwd(), ".cache", "epias");
  const years = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .map((f) => /^aggregator-benchmark-(\d{4})\.json$/.exec(f)?.[1])
    .filter((y): y is string => !!y)
    .map(Number)
    .sort((a, b) => b - a);
  if (years.length === 0) {
    return NextResponse.json(
      { success: false, error: "Toplayıcı kıyası henüz üretilmedi: npx tsx --tsconfig tsconfig.json scripts/aggregator-benchmark.mts 2026" },
      { status: 404 }
    );
  }
  const requested = Number(new URL(request.url).searchParams.get("year"));
  const year = years.includes(requested) ? requested : years[0];
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, `aggregator-benchmark-${year}.json`), "utf8"));
    return NextResponse.json({ success: true, years, ...data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Kıyas okunamadı." }, { status: 500 });
  }
}
