/**
 * PTF motoru: yarının saatlik PTF tahmini, değişmeyen kayıt (data/pool/forecast-log/ptf/<ay>/<gün>.json.gz).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/forecast-daily.mts [--date YYYY-AA-GG] [--dry] [--auto]
 *
 * Hedef gün varsayılan yarın (Türkiye). Kayıt zaten varsa dokunmaz. Kesimden (hedeften önceki gün 12:05) sonra yazılan kayıt
 * `onTime: false` taşır ve ileriye dönük skora girmez. `--dry`: hesaplar ve gösterir, yazmaz. Geçmiş ya da bugün için kayıt
 * yazılmaz (yalnız `--dry`).
 * `--at SS:DD` (deneme): --auto kararlarını o Türkiye saatiymiş gibi verir.
 * `--auto` (sunucuda 12:03, 12:15 ve 12:25; lib/ptf/auto.ts): EPİAŞ yarının yük tahminini yayımladıysa hemen yazar, yoksa
 * kesime kadar yoklar; kesimde de yoksa çıkar, sonraki çalışma dener. Yazınca telefona özet bildirim gider ve sayfanın
 * önbelleğine (`.cache/ptf/preview`) aynı sonuç konur. 12:30'dan sonra kayıt yazılmaz. Son denemede (12:20'den sonra) başarısızlık
 * da bildirilir.
 */

import { readPtfLog, writePtfLog } from "@/lib/ptf/forecast-log-store";
import {
  failureNotification,
  FINAL_ATTEMPT_MINUTES,
  forecastNotification,
  planAuto,
} from "@/lib/ptf/auto";
import { notify } from "@/lib/notify";
import { liveDay } from "@/lib/services/pre-bid";
import { forecastPtf, PtfForecastError } from "@/lib/services/ptf-engine";
import { savePtfPreview } from "@/lib/services/ptf-forecast-page";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dry = process.argv.includes("--dry");
const auto = process.argv.includes("--auto");
const trNow = () => new Date(Date.now() + 3 * 3_600_000);
// `--at SS:DD`: --auto kararlarını o Türkiye saatiymiş gibi dener (yalnız deneme; tahmin gerçek anla yapılır)
const at = /^(\d{1,2}):(\d{2})$/.exec(arg("at") ?? "");
const nowMinutes = () => {
  if (at) return Number(at[1]) * 60 + Number(at[2]);
  const w = trNow();
  return w.getUTCHours() * 60 + w.getUTCMinutes() + w.getUTCSeconds() / 60;
};
const today = trNow().toISOString().slice(0, 10);
const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
  .toISOString()
  .slice(0, 10);
const target = arg("date") ?? tomorrow;
if (!dry && target <= today) {
  console.error(`Geçmiş ya da bugün için kayıt yazılmaz (${target}); --dry ile deneyin.`);
  process.exit(1);
}
if (!dry && (await readPtfLog(target))) {
  console.log(`PTF tahmin kaydı ${target} zaten var; dokunulmadı.`);
  process.exit(0);
}

/** Otomatik çalışmada başarısızlık: son denemedeyse telefona da bildirilir; çıkış 0 (sonraki çalışma dener) */
const giveUp = (reason: string): never => {
  console.log(`${reason} Kayıt yazılmadı.`);
  if (nowMinutes() >= FINAL_ATTEMPT_MINUTES) {
    const n = failureNotification(target, reason);
    notify(n.title, n.text);
  }
  process.exit(0);
};

if (auto) {
  const hasLep = async () => {
    const l = await liveDay(target).catch(() => null);
    return !!l && l.lep.length === 24 && l.lep.every((v) => v !== null);
  };
  for (;;) {
    const plan = planAuto({ nowMinutes: nowMinutes(), hasLep: await hasLep() });
    if (plan === "write") break;
    if (plan === "early") {
      console.log(`Kesime daha var (yük tahmini yok); ${target} için bekleniyor.`);
      process.exit(0);
    }
    if (plan === "closed") {
      console.log(`GÖP kapanışı (12:30) geçti; ${target} için kayıt yazılmadı.`);
      process.exit(0);
    }
    if (plan === "retry") giveUp(`EPİAŞ ${target} için yük tahminini henüz yayımlamadı.`);
    if (at) {
      console.log(
        "(deneme) kesime kadar yoklanırdı; --at ile saat ilerlemez, çıkılıyor."
      );
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 10_000)); // "wait": kesime kadar yokla
  }
}

const t0 = Date.now();
let result;
try {
  result = await forecastPtf(target);
} catch (e) {
  if (auto && e instanceof PtfForecastError) giveUp(e.message);
  throw e;
}
const { log, notes } = result;
const nf = (v: number | null) =>
  v === null ? "—" : Math.round(v).toLocaleString("tr-TR");
console.log(
  `${target} PTF tahmini (${log.modelId}, ${((Date.now() - t0) / 1000).toFixed(0)} sn; kesimden önce: ${log.onTime ? "evet" : "HAYIR"}; rüzgâr: ${log.inputs.windKind === 1 ? "EPİAŞ tahmini" : "kalıcılık ya da kendi tahmin"}; güneş: ${log.inputs.sunKind === 1 ? "kendi tahmin" : "vekil"}; gölge: ${Object.keys(log.shadow ?? {}).join(", ") || "—"}; canlı: ${log.inputs.live.join(", ") || "—"}; yedek: ${log.inputs.fallbacks.join(", ") || "—"})`
);
console.log(
  `ortalama ${nf(log.hours.reduce((s, h) => s + h.p50, 0) / 24)} TL/MWh; son ${log.band.days} gün birleşim hatası ${nf(log.band.recentMae)} TL/MWh; tavan ${nf(log.cap)}`
);
for (const h of log.hours)
  if (h.hour % 3 === 0)
    console.log(
      `  ${String(h.hour).padStart(2, "0")}:00  ${nf(h.p50).padStart(6)}  (${nf(h.q10)} – ${nf(h.q90)})`
    );
for (const n of notes) console.log(`not: ${n}`);
if (dry) console.log("(kuru çalışma; yazılmadı)");
else {
  const wrote = await writePtfLog(log);
  console.log(
    wrote ? `yazıldı (${target})` : `kayıt başka bir çalışmayla yazılmış; dokunulmadı`
  );
  if (wrote && auto) {
    const n = forecastNotification(log, notes);
    notify(n.title, n.text);
    try {
      savePtfPreview(target, {
        ok: true,
        computedAt: new Date().toISOString(),
        ...result,
      });
    } catch (e) {
      console.log(`Sayfa önbelleği yazılamadı: ${e instanceof Error ? e.message : e}`);
    }
  }
}
process.exit(0);
