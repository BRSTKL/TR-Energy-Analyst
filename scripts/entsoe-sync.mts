/**
 * ENTSO-E komşu ülke fiyatlarını (Bulgaristan, Yunanistan; gün öncesi, EUR/MWh) ve Türkiye sınır akışlarını (MW) havuza çeker:
 * `data/pool/entsoe/neighbors.json.gz`. Ayrıca ECB EUR/TRY kuru.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/entsoe-sync.mts [--dry]
 *
 * `ENTSOE_TOKEN` .env'de olmalı (sunucuda /srv/tr-energy/.env). Sunucuda scripts/epias-monthly-sync.mts her saat çağırır; havuz son
 * 45 dakikada çekildiyse bir okumayla çıkar. `--dry`: çeker ve özetler, yazmaz. Hata durumunda çıkış kodu 1; bildirim günde en çok
 * bir (ntfy). Durum: .cache/entsoe/state.json.
 */

import fs from "node:fs";
import path from "node:path";
import { notify } from "@/lib/notify";
import { syncEntsoe } from "@/lib/services/entsoe";

const dry = process.argv.includes("--dry");
const STATE = path.join(process.cwd(), ".cache", "entsoe", "state.json");
const readState = (): { lastAlertAt?: string } => {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
};

try {
  const r = await syncEntsoe({ write: dry ? async () => undefined : undefined });
  if (r.status === "partial")
    console.log(
      `ENTSO-E ilk doldurma sürüyor: ${r.requests} istek, ${r.merge?.added} yeni saat; Bulgaristan fiyatı en son ${r.latestBgDay}. Sonraki saatlik çalışma kaldığı yerden sürer.`
    );
  else if (r.status === "fresh")
    console.log(
      `ENTSO-E güncel (Bulgaristan fiyatı en son ${r.latestBgDay}, akış en son ${r.latestFlowDay}).`
    );
  else
    console.log(
      `ENTSO-E ${dry ? "(kuru çalışma, yazılmadı) " : ""}${r.from} – ${r.to}: ${r.requests} istek (${r.noData} boş), ${r.merge?.added} yeni, ${r.merge?.changed} değişen saat, ${r.fxDays} kur günü; ` +
        `Bulgaristan fiyatı en son ${r.latestBgDay}, akış en son ${r.latestFlowDay}.`
    );
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ENTSO-E çekilemedi: ${message}`);
  const st = readState();
  if (
    !dry &&
    (!st.lastAlertAt || Date.now() - Date.parse(st.lastAlertAt) > 24 * 3_600_000)
  ) {
    notify("ENTSO-E çekilemedi", message.slice(0, 200));
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify({ lastAlertAt: new Date().toISOString() }));
  }
  process.exit(1);
}
