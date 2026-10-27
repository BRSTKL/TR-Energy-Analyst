/**
 * Sistem geneli saatlik serileri (kaynak türüne göre KGÜP ve UEVM, yük tahmini, uzlaştırma tüketimi (UEÇM), gerçek
 * zamanlı tüketim ve üretim, teslim edilen talimatlar) EPİAŞ'tan veri havuzuna (`data/pool/system/<yıl>.json.gz`) tamamlar. Havuzda kesinleşmiş aylar atlanır,
 * eksik ve geçici aylar çekilir (ay başına yedi istek). Sektör karnesindeki "Sistem yönü" sekmesi bunu okur.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/system-sync.mts [ilk YYYY-AA] [son YYYY-AA]
 *
 * Varsayılan: 2025-01'den içinde bulunulan aya. `--recent`: yalnız geçen ay ve içinde bulunulan ay (günlük eşitleme:
 * epias-monthly-sync.mts her saat çağırır; içinde bulunulan ay her Türkiye günü bir kez yenilenir, yoksa bir saniyede çıkar).
 */

import { epiasRequest } from "@/lib/services/epias-service";
import { ensureSystemCoverage } from "@/lib/pool/system-sync";

const now = new Date();
const thisMonth = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 7);
const recent = process.argv[2] === "--recent";
const lastMonth = new Date(new Date(`${thisMonth}-01T00:00:00Z`).getTime() - 24 * 3_600_000).toISOString().slice(0, 7);
const [from = "2025-01", to = thisMonth] = recent ? [lastMonth, thisMonth] : process.argv.slice(2);
if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
  console.error("Kullanım: system-sync.mts [ilk YYYY-AA] [son YYYY-AA]");
  process.exit(2);
}

const items = async (path: string, body: Record<string, string>) => ((await epiasRequest<{ items?: unknown[] }>(path, body)).items ?? []) as unknown[];

const results = await ensureSystemCoverage(
  from,
  to,
  async (q) => ({
    dpp: await items("/generation/data/dpp", { ...q, region: "TR1" }),
    uevm: await items("/generation/data/injection-quantity", q),
    lep: await items("/consumption/data/load-estimation-plan", q),
    uecm: await items("/consumption/data/uecm", q),
    consumption: await items("/consumption/data/realtime-consumption", q),
    up: await items("/markets/bpm/data/order-summary-up", q),
    down: await items("/markets/bpm/data/order-summary-down", q),
    rt: await items("/generation/data/realtime-generation", q),
  }),
  {
    now,
    onMonth: (r) =>
      (!recent || r.source !== "pool") &&
      console.log(
        `${r.month}: ${r.source === "epias" ? `EPİAŞ'tan ${Object.entries(r.hours ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")} saat` : r.source === "pool" ? "havuzda (kesin ya da yeni çekilmiş)" : r.source === "future" ? "henüz yok" : `HATA: ${r.error}`}`
      ),
  }
);
const failed = results.filter((r) => r.source === "failed");
if (failed.length) {
  console.error(`${failed.length} ay çekilemedi: ${failed.map((r) => r.month).join(", ")}`);
  process.exit(1);
}
