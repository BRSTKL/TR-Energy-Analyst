/**
 * DSİ baraj doluluğunu (yagisbarajdoluluk.dsi.gov.tr) havuza çeker: `data/pool/dsi/dam-occupancy.json.gz`.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/dsi-dam-sync.mts [--dry]
 *
 * Site yalnız Türkiye IP'sinden açılır; sunucuda çalışır (scripts/epias-monthly-sync.mts her saat çağırır; havuz taze ise bir
 * istekle çıkar). `--dry`: çeker ve özetler, yazmaz. Hata durumunda çıkış kodu 1; ardışık hata bildirimi günde bir (ntfy).
 * Durum: .cache/dsi/state.json.
 */

import fs from "node:fs";
import path from "node:path";
import { notify } from "@/lib/notify";
import { dsiGet, syncDsiDam } from "@/lib/services/dsi-dam";
import { readDsiDam } from "@/lib/pool/dsi-dam-store";

const dry = process.argv.includes("--dry");
const STATE = path.join(process.cwd(), ".cache", "dsi", "state.json");
const readState = (): { lastAlertAt?: string } => {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
};

try {
  const r = await syncDsiDam({
    get: dsiGet,
    write: dry ? async () => undefined : undefined,
  });
  if (r.status === "fresh")
    console.log(
      `DSİ baraj doluluğu güncel (yayım ${r.publishedDate}, havuzda en son ${r.latestEnergy}).`
    );
  else
    console.log(
      `DSİ baraj doluluğu ${dry ? "(kuru çalışma, yazılmadı) " : ""}${r.from} – ${r.publishedDate}: ${r.nationalDays} gün çekildi, ${r.merge?.added} yeni, ${r.merge?.changed} değişen kayıt` +
        `${r.skipped ? `, ${r.skipped} geçersiz satır atlandı` : ""}; havuzda enerji amaçlı en son ${r.latestEnergy}.`
    );
  const doc = await readDsiDam();
  const e = doc?.national.Energy[r.latestEnergy ?? ""];
  if (e)
    console.log(
      `Enerji amaçlı barajlar ${r.latestEnergy}: doluluk %${e.occupancyPct}, aktif hacim ${e.activeVolumeMm3} milyon m³.`
    );
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`DSİ baraj doluluğu çekilemedi: ${message}`);
  const st = readState();
  if (
    !dry &&
    (!st.lastAlertAt || Date.now() - Date.parse(st.lastAlertAt) > 24 * 3_600_000)
  ) {
    notify("DSİ baraj doluluğu çekilemedi", message.slice(0, 200));
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify({ lastAlertAt: new Date().toISOString() }));
  }
  process.exit(1);
}
