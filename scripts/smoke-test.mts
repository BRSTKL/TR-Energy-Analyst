/**
 * Duman testi (hata ayıklama testi 16.10.2026'nın otomatik hâli): çalışan geliştirme sunucusunda bütün sayfaları gezer.
 * Yalnız okur: silme, senkron, içe aktarma, kaydetme gibi yazan hiçbir düğmeye basılmaz; EPİAŞ'a gidilmez.
 *
 *   npm run test:smoke                       # sunucu http://localhost:3000'de açık olmalı
 *   SMOKE_BASE=http://localhost:3001 npm run test:smoke
 *   npm run test:smoke -- --all              # bütün projeler (varsayılan: en büyük, en küçük, güneşsiz)
 *   npm run test:smoke -- --only forecast    # yalnız adresinde ya da adında "forecast" geçen sayfalar, masaüstü ve 375 px
 *                                            # (virgülle birden çok: --only forecast,losses)
 *
 * Her sayfada: konsol hatası, yakalanmamış sayfa hatası, 400 ve üstü yanıt (beklenen 404 sayfaları hariç), ekranda
 * NaN / undefined / Infinity / [object Object] / Invalid Date, yatay taşma (masaüstü ve 375 px), 10 sn'den uzun API (uyarı).
 * Yükleme bitişi: dönen simge ve "Yükleniyor…" yazıları kaybolup metin 2 sn değişmeyince (en çok 120 sn; önbelleksiz
 * geriye dönük test 60 sn'yi geçebiliyor). Tarayıcı: sistemdeki Google Chrome (playwright-core; ek indirme yok).
 * Çıkış kodu: hata varsa 1 (uyarılar düşürmez).
 *
 * Giriş (22.10.2026'dan beri her sayfa oturum ister): SMOKE_COOKIE verilirse o kullanılır (sunucuya karşı:
 * scripts/auth-token.mts, scripts/server/README.md). Verilmezse yereldeki .env'nin AUTH_SECRET'i ve ilk hesapla 30
 * dakikalık bir oturum üretilir.
 */

import { chromium, type Page } from "playwright-core";

const BASE = (process.env.SMOKE_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const SESSION_COOKIE = "tre_session";

async function sessionCookie(): Promise<string> {
  if (process.env.SMOKE_COOKIE) return process.env.SMOKE_COOKIE.trim();
  try {
    process.loadEnvFile(".env");
  } catch {
    /* .env yok */
  }
  const { prisma } = await import("@/lib/prisma");
  const { signSession } = await import("@/lib/auth/session");
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  await prisma.$disconnect();
  if (!user || !process.env.AUTH_SECRET) {
    console.error("Oturum yok: SMOKE_COOKIE verin ya da yerelde hesap açın ve .env'ye AUTH_SECRET ekleyin.");
    process.exit(1);
  }
  return signSession({ userId: user.id, expiresAt: Date.now() + 30 * 60_000 });
}
const COOKIE = await sessionCookie();
const ALL = process.argv.includes("--all");
// Yalnız etkilenen sayfalar (kullanıcı kararı 19.10.2026): tek sayfa değişikliğinde tam tur yerine
const ONLY = process.argv.includes("--only")
  ? (process.argv[process.argv.indexOf("--only") + 1] ?? "")
      .split(",")
      .map((x) => x.trim().toLocaleLowerCase("tr-TR"))
      .filter(Boolean)
  : null;
const LOAD_TIMEOUT_MS = 120_000;
const SLOW_API_MS = 10_000;
const BAD_TEXT = /.{0,40}(NaN|undefined|Infinity|\[object Object\]|Invalid Date).{0,40}/g;
const BUSY_TEXT = /Yükleniyor…|Yükleniyor\.\.\.|Hesaplanıyor\.\.\.|Test çalıştırılıyor|Model kuruluyor/;

type Check = { url: string; label: string; mobile?: boolean; expect404?: boolean; expectText?: RegExp };
type Result = { label: string; url: string; ms: number; errors: string[]; warnings: string[] };

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path, { headers: { cookie: `${SESSION_COOKIE}=${COOKIE}` } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

async function waitLoaded(page: Page): Promise<boolean> {
  const t0 = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - t0 < LOAD_TIMEOUT_MS) {
    const { busy, len } = await page.evaluate((busyRe) => {
      const t = document.body?.innerText ?? "";
      return { busy: document.querySelectorAll(".animate-spin").length > 0 || new RegExp(busyRe).test(t), len: t.length };
    }, BUSY_TEXT.source);
    stable = !busy && len === last ? stable + 1 : 0;
    last = len;
    if (stable >= 4) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function run(page: Page, c: Check): Promise<Result> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const started = new Map<string, number>();
  const onConsole = (m: { type: () => string; text: () => string; location: () => { url: string } }) => {
    if (m.type() !== "error") return;
    // Kaynak yükleme hatasında adres de yazılır (ileti tek başına hangi dosya olduğunu söylemiyor)
    const where = m.location()?.url ? ` [${m.location().url.replace(BASE, "")}]` : "";
    const t = m.text() + where;
    // Beklenen 404 sayfalarında tarayıcının kendi "Failed to load resource: 404" iletisi hata değildir
    if (c.expect404 && /404|Not Found/.test(t)) return;
    errors.push(`konsol: ${t.replace(/\s+/g, " ").slice(0, 160)}`);
  };
  const onPageError = (e: Error) => errors.push(`sayfa hatası: ${e.message.slice(0, 160)}`);
  const onRequest = (r: { url: () => string }) => started.set(r.url(), Date.now());
  const onResponse = (r: { url: () => string; status: () => number }) => {
    const url = r.url();
    if (!url.startsWith(BASE)) return;
    const ms = Date.now() - (started.get(url) ?? Date.now());
    if (r.status() >= 400 && !(c.expect404 && r.status() === 404)) errors.push(`HTTP ${r.status()} ${url.replace(BASE, "").slice(0, 100)}`);
    if (url.includes("/api/") && ms > SLOW_API_MS) warnings.push(`yavaş API ${Math.round(ms / 1000)} sn ${url.replace(BASE, "").slice(0, 90)}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("request", onRequest);
  page.on("response", onResponse);
  const t0 = Date.now();
  try {
    await page.setViewportSize(c.mobile ? { width: 375, height: 812 } : { width: 1280, height: 900 });
    const resp = await page.goto(BASE + c.url, { waitUntil: "domcontentloaded", timeout: LOAD_TIMEOUT_MS });
    if (resp && resp.status() >= 400 && !c.expect404) errors.push(`sayfa HTTP ${resp.status()}`);
    if (!(await waitLoaded(page))) errors.push(`${LOAD_TIMEOUT_MS / 1000} sn içinde yüklenmedi`);
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    for (const m of text.matchAll(BAD_TEXT)) errors.push(`ekranda "${m[1]}": …${m[0].replace(/\s+/g, " ")}…`);
    if (c.expectText && !c.expectText.test(text)) errors.push(`beklenen metin yok: ${c.expectText}`);
    if (!c.expectText && text.trim().length < 50) errors.push("sayfa neredeyse boş");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 2) errors.push(`yatay taşma ${overflow} px`);
  } catch (e) {
    errors.push(`gezinti hatası: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
  return { label: c.label, url: c.url, ms: Date.now() - t0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// --- Gezilecek sayfalar ---
const projects = await getJson<{ projects?: Array<{ id: string; name: string; plants?: Array<{ type: string }> }> } | Array<{ id: string; name: string; plants?: Array<{ type: string }> }>>("/api/projects");
const list = (Array.isArray(projects) ? projects : projects.projects ?? []).map((p) => ({ ...p, n: p.plants?.length ?? 0, ges: (p.plants ?? []).some((x) => x.type === "GES") }));
if (!list.length) throw new Error("Proje yok: /api/projects boş döndü");
const bySize = [...list].sort((a, b) => b.n - a.n);
const chosen = ALL
  ? list
  : [...new Map([bySize[0], bySize[bySize.length - 1], list.find((p) => !p.ges)].filter((p): p is (typeof list)[number] => !!p).map((p) => [p.id, p])).values()];

const checks: Check[] = [
  { url: "/", label: "Ana sayfa" },
  { url: "/projects", label: "Projeler" },
  { url: "/projects/epias", label: "EPİAŞ'tan proje" },
  { url: "/market", label: "Piyasa" },
  { url: "/sector", label: "Sektör karnesi" },
  { url: "/compare", label: "Karşılaştırma" },
  { url: "/methodology", label: "Metodoloji" },
];
try {
  const ag = await getJson<{ rows?: Array<{ id?: string | number; organizationId?: string | number }>; aggregators?: Array<{ id?: string | number; organizationId?: string | number }> }>("/api/sector/aggregators");
  const first = (ag.rows ?? ag.aggregators ?? [])[0];
  const id = first?.id ?? first?.organizationId;
  if (id !== undefined) checks.push({ url: `/sector/aggregators/${id}`, label: "Toplayıcı ayrıntısı" });
} catch {
  // toplayıcı kıyası toplanmamışsa atlanır
}
const PROJECT_PAGES = ["results", "plants", "backtest", "validation", "losses", "forecast", "candidates", "dsg", "insights", "planning", "import"];
for (const p of chosen) for (const pg of PROJECT_PAGES) checks.push({ url: `/projects/${p.id}/${pg}`, label: `${p.name.slice(0, 24)} · ${pg}` });
// Uç durumlar: düzgün hata mesajı, çökme yok
checks.push({ url: "/projects/yok-boyle-bir-proje/results", label: "Olmayan proje · results", expect404: true, expectText: /bulunamad/ });
checks.push({ url: "/projects/yok-boyle-bir-proje/plants", label: "Olmayan proje · plants", expect404: true, expectText: /bulunamad/ });
checks.push({ url: "/olmayan-sayfa", label: "404 sayfası", expect404: true, expectText: /Sayfa bulunamadı/ });
// Telefon genişliği
for (const [url, label] of [
  ["/projects", "Projeler"],
  ["/sector", "Sektör karnesi"],
  ["/market", "Piyasa"],
  [`/projects/${bySize[0].id}/results`, "Sonuçlar"],
  [`/projects/${bySize[0].id}/forecast`, "Üretim tahmini"],
] as const)
  checks.push({ url, label: `📱 ${label}`, mobile: true });

if (ONLY) {
  const hit = (c: Check) => ONLY.some((o) => c.url.toLocaleLowerCase("tr-TR").includes(o) || c.label.toLocaleLowerCase("tr-TR").includes(o));
  const kept = checks.filter(hit);
  // Seçilen her sayfanın telefon genişliği de denenir
  for (const c of kept.filter((c) => !c.mobile && !c.expect404)) if (!kept.some((k) => k.mobile && k.url === c.url)) kept.push({ ...c, label: `📱 ${c.label}`, mobile: true });
  if (!kept.length) {
    console.error(`--only ${ONLY.join(",")}: eşleşen sayfa yok`);
    process.exit(2);
  }
  checks.splice(0, checks.length, ...kept);
}

// --- Çalıştır ---
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
await context.addCookies([{ name: SESSION_COOKIE, value: COOKIE, url: BASE }]);
const page = await context.newPage();
console.log(`Duman testi: ${BASE}, ${checks.length} sayfa (${chosen.length} proje: ${chosen.map((p) => p.name.slice(0, 20)).join(", ")})\n`);
const results: Result[] = [];
for (const c of checks) {
  const r = await run(page, c);
  results.push(r);
  console.log(`${r.errors.length ? "✗" : r.warnings.length ? "!" : "✓"} ${r.label.padEnd(42)} ${(r.ms / 1000).toFixed(1).padStart(5)} sn`);
  for (const e of r.errors) console.log(`    ✗ ${e}`);
  for (const w of r.warnings) console.log(`    ! ${w}`);
}
await browser.close();
const failed = results.filter((r) => r.errors.length);
const warned = results.filter((r) => !r.errors.length && r.warnings.length);
console.log(`\n${results.length} sayfa: ${results.length - failed.length} geçti, ${failed.length} hatalı, ${warned.length} uyarılı.`);
process.exit(failed.length ? 1 : 0);
