/**
 * Tanıtım videosu için ekran görüntüleri: bir projenin bütün sayfalarını ve genel sayfaları gezer, şirket / santral /
 * toplayıcı / proje adlarını takma adla değiştirip tam boy ekran görüntüsü alır. Rakamlar olduğu gibi kalır.
 * Yalnız okur (duman testi gibi): yazan hiçbir düğmeye basılmaz, EPİAŞ'a gidilmez.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/video-screens.mts                  # projeleri listeler
 *   npx tsx --tsconfig tsconfig.json scripts/video-screens.mts --project <id>   # görüntüleri alır
 *
 * Sunucuya karşı (oturum çerezi duman testindeki gibi, scripts/server/README.md):
 *   SMOKE_COOKIE=$(ssh … 'cd /srv/tr-energy && sudo -u tre node --env-file=.env node_modules/.bin/tsx --tsconfig tsconfig.json scripts/auth-token.mts') \
 *   SMOKE_BASE=https://<sunucu> npx tsx --tsconfig tsconfig.json scripts/video-screens.mts --project <id>
 *
 * Çıktı: .cache/video-screens/<proje-id>/NN-<sayfa>.png (git dışı). Takma adlar: seçilen projenin santralleri
 * "Santral 01…", projesi "Örnek portföy"; diğer santraller "Santral S001…", şirketler "Şirket A…", toplayıcılar
 * "Toplayıcı 1…". Ad listesi API yanıtlarından toplanır (sektör karnesi, toplayıcılar, proje ve sayfanın yüklediği her
 * /api/ yanıtı); ayrıca EIC kodu, lisans numarası ve "… A.Ş." / "… LTD. ŞTİ." kalıpları maskelenir. Görüntü alındıktan
 * sonra sayfada bilinen bir ad kaldıysa uyarı yazılır. Yine de paylaşmadan önce görüntülere göz atın.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const BASE = (process.env.SMOKE_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const SESSION_COOKIE = "tre_session";
const LOAD_TIMEOUT_MS = 120_000;
const BUSY_TEXT = /Yükleniyor…|Yükleniyor\.\.\.|Hesaplanıyor\.\.\.|Test çalıştırılıyor|Model kuruluyor/;

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
  return signSession({ userId: user.id, expiresAt: Date.now() + 60 * 60_000 });
}
const COOKIE = await sessionCookie();

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(BASE + path, { headers: { cookie: `${SESSION_COOKIE}=${COOKIE}` } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

// --- Takma adlar ---
type Kind = "plant" | "company" | "aggregator" | "project";
const alias = new Map<string, string>(); // gerçek ad → takma ad
const counters = { plant: 0, company: 0, aggregator: 0, project: 0 };
const letters = (n: number) => { let s = ""; n++; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
function add(name: unknown, kind: Kind, fixed?: string) {
  if (typeof name !== "string") return;
  const n = name.trim();
  if (n.length < 3 || alias.has(n)) return;
  if (fixed) return void alias.set(n, fixed);
  const i = counters[kind]++;
  alias.set(n, kind === "plant" ? `Santral S${String(i + 1).padStart(3, "0")}` : kind === "company" ? `Şirket ${letters(i)}` : kind === "aggregator" ? `Toplayıcı ${i + 1}` : `Örnek proje ${i + 1}`);
}
const TECH = new Set(["RES", "GES", "HES"]);
// Bir API yanıtını gezer, ad taşıyan alanları toplar. "name" yalnız santral ya da toplayıcı satırında ad sayılır
// (strateji, sekme gibi başka "name" alanları maskelenmez).
function harvest(v: unknown, depth = 0): void {
  if (depth > 12 || v === null || typeof v !== "object") return;
  if (Array.isArray(v)) return v.forEach((x) => harvest(x, depth + 1));
  const o = v as Record<string, unknown>;
  const isPlant = "epiasPlantId" in o || (typeof o.type === "string" && TECH.has(o.type) && "name" in o);
  const isAggregator = "listedPlants" in o || "portfolioCostTl" in o;
  if (isPlant) add(o.name, "plant");
  else if (isAggregator) add(o.name, "aggregator");
  for (const k of ["plantName", "uevcbName"]) add(o[k], "plant");
  for (const k of ["organizationName", "owner", "ownerName", "company", "orgName"]) add(o[k], "company");
  add(o.aggregatorName, "aggregator");
  for (const k of ["companies", "owners"]) if (Array.isArray(o[k])) (o[k] as unknown[]).forEach((x) => (typeof x === "string" ? add(x, "company") : harvest(x, depth + 1)));
  if (Array.isArray(o.plantNames)) (o.plantNames as unknown[]).forEach((x) => add(x, "plant"));
  for (const x of Object.values(o)) if (x && typeof x === "object") harvest(x, depth + 1);
}

// --- Proje seçimi ---
type ProjectRow = { id: string; name: string; description?: string | null; plants?: Array<{ name: string }> };
const projectsResp = await getJson<{ projects?: ProjectRow[] } | ProjectRow[]>("/api/projects");
const projects = Array.isArray(projectsResp) ? projectsResp : projectsResp?.projects ?? [];
const argIdx = process.argv.indexOf("--project");
const projectId = argIdx > 0 ? process.argv[argIdx + 1] : undefined;
if (!projectId) {
  console.log("Proje seçin: --project <id>\n");
  for (const p of projects) console.log(`  ${p.id}  ${p.name}  (${p.plants?.length ?? "?"} santral)`);
  process.exit(projects.length ? 0 : 1);
}
const detail = await getJson<{ project?: { name: string; description?: string | null; aggregatorName?: string | null; plants: Array<{ name: string }> } }>(`/api/projects/${projectId}`);
if (!detail?.project) {
  console.error(`Proje bulunamadı: ${projectId}`);
  process.exit(1);
}
// Seçilen proje önce: santralleri Santral 01…, adı "Örnek portföy"
detail.project.plants.forEach((p, i) => add(p.name, "plant", `Santral ${String(i + 1).padStart(2, "0")}`));
add(detail.project.name, "project", "Örnek portföy");
if (detail.project.description) add(detail.project.description, "project", "Örnek portföy açıklaması");
add(detail.project.aggregatorName, "aggregator", "Örnek Toplayıcı");
for (const p of projects) add(p.name, "project");
harvest(await getJson(`/api/projects/${projectId}/results`));
for (const path of ["/api/sector", "/api/sector/aggregators"]) harvest(await getJson(path));
console.log(`${alias.size} ad toplandı (sayfa yüklendikçe artar).`);

// --- Gezilecek sayfalar ---
type Shot = { file: string; url: string; label: string; click?: string };
const P = `/projects/${projectId}`;
const shots: Shot[] = [
  { file: "01-ana-sayfa", url: "/", label: "Ana sayfa" },
  { file: "02-piyasa", url: "/market", label: "Piyasa" },
  { file: "03-projelerim", url: "/projects", label: "Projelerim" },
  { file: "04-epias-santral-analizi", url: "/projects/epias", label: "EPİAŞ'tan santral analizi" },
  { file: "05-sonuc-raporu", url: `${P}/results`, label: "Sonuç Raporu" },
  { file: "06-powerpoint-diyalogu", url: `${P}/results`, label: "PowerPoint diyaloğu", click: "PowerPoint Raporu (.pptx)" },
  { file: "07-stratejik-icgoruler", url: `${P}/insights`, label: "Stratejik İçgörüler" },
  { file: "08-planlama-verimlilik", url: `${P}/planning?tab=efficiency`, label: "Planlama · Verimlilik" },
  { file: "09-planlama-gip", url: `${P}/planning?tab=arbitrage`, label: "Planlama · GİP Arbitraj" },
  { file: "10-planlama-butce", url: `${P}/planning?tab=budget`, label: "Planlama · Bütçe" },
  { file: "11-dsg-senaryolari", url: `${P}/dsg`, label: "DSG Senaryoları" },
  { file: "12-aday-santraller", url: `${P}/candidates`, label: "Aday Santraller" },
  { file: "13-geriye-donuk-test", url: `${P}/backtest`, label: "Geriye Dönük Test" },
  { file: "14-dogrulama-paketi", url: `${P}/validation`, label: "Doğrulama paketi" },
  { file: "15-kayip-uretim", url: `${P}/losses`, label: "Kayıp üretim" },
  { file: "16-uretim-tahmini", url: `${P}/forecast`, label: "Üretim tahmini" },
  { file: "17-santraller", url: `${P}/plants`, label: "Santraller" },
  { file: "18-uretim-verisi-yukle", url: `${P}/import`, label: "Üretim verisi yükle" },
  { file: "19-sektor-karnesi", url: "/sector", label: "Sektör karnesi" },
  { file: "21-karsilastir", url: "/compare", label: "Karşılaştır" },
  { file: "22-metodoloji", url: "/methodology", label: "Metodoloji" },
];
const ag = await getJson<{ rows?: Array<{ id?: number }>; aggregators?: Array<{ id?: number }> }>("/api/sector/aggregators");
const agId = (ag?.rows ?? ag?.aggregators ?? [])[0]?.id;
if (agId !== undefined) shots.push({ file: "20-toplayici-ayrintisi", url: `/sector/aggregators/${agId}`, label: "Toplayıcı ayrıntısı" });
shots.sort((a, b) => a.file.localeCompare(b.file));

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

// Sayfadaki metni takma adlarla değiştirir (metin düğümleri, SVG metinleri, input değerleri, title); hâlâ görünen bilinen
// adları döndürür. Tarayıcıda çalışan kısım düz metin: tsx'in eklediği yardımcılar (__name) tarayıcıda tanımlı değil.
const ANONYMIZE_JS = `(pairs) => {
  const esc = (s) => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
  const map = new Map();
  for (const [k, v] of pairs) { map.set(k, v); map.set(k.toLocaleUpperCase("tr-TR"), v); }
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  const chunks = [];
  for (let i = 0; i < keys.length; i += 400) chunks.push(new RegExp(keys.slice(i, i + 400).map(esc).join("|"), "g"));
  const extra = [
    [/\\b\\d{2}[A-Z][A-Z0-9-]{12}[A-Z0-9]\\b/g, "EIC ••••"],
    [/\\bE[ÜU]\\/\\d+[-\\/\\d]*/g, "Lisans ••••"],
    [/[A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜa-zçğıöşü0-9.&'\\- ]{2,90}?\\s(?:A\\.?\\s?Ş\\.?|ANONİM ŞİRKETİ|Anonim Şirketi|LTD\\.?\\s?ŞTİ\\.?|Ltd\\.?\\s?Şti\\.?|LİMİTED ŞİRKETİ)/g, "Şirket"],
  ];
  const fix = (s) => { let t = s; for (const re of chunks) t = t.replace(re, (m) => map.get(m) ?? m); for (const [re, r] of extra) t = t.replace(re, r); return t; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const v = n.nodeValue ?? ""; const f = fix(v); if (f !== v) n.nodeValue = f; }
  document.querySelectorAll("input, textarea").forEach((el) => { if (el.value) el.value = fix(el.value); if (el.placeholder) el.placeholder = fix(el.placeholder); });
  document.querySelectorAll("[title]").forEach((el) => el.setAttribute("title", fix(el.getAttribute("title") ?? "")));
  const text = document.body.innerText;
  const left = new Set();
  for (const re of chunks) for (const m of text.matchAll(new RegExp(re.source, "g"))) left.add(m[0]);
  return [...left];
}`;
async function anonymize(page: Page): Promise<string[]> {
  const pairs = [...alias.entries()];
  return page.evaluate(`(${ANONYMIZE_JS})(${JSON.stringify(pairs)})`) as Promise<string[]>;
}

// --- Çalıştır ---
const OUT = `.cache/video-screens/${projectId}`;
mkdirSync(OUT, { recursive: true });
// Sistemdeki Google Chrome; Chrome olmayan makinede (ör. Linux sunucu) CHROME_PATH ile başka bir Chromium verilebilir
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: "tr-TR" });
await context.addCookies([{ name: SESSION_COOKIE, value: COOKIE, url: BASE }]);
const page = await context.newPage();
// Sayfanın yüklediği her API yanıtından ad topla
page.on("response", async (r) => {
  if (!r.url().startsWith(BASE + "/api/") || !(r.headers()["content-type"] ?? "").includes("json")) return;
  try { harvest(await r.json()); } catch { /* gövde okunamadı */ }
});
console.log(`Ekran görüntüleri: ${BASE}, proje ${projectId}, ${shots.length} sayfa → ${OUT}\n`);
const index: string[] = [];
let problems = 0;
for (const s of shots) {
  const t0 = Date.now();
  try {
    await page.goto(BASE + s.url, { waitUntil: "domcontentloaded", timeout: LOAD_TIMEOUT_MS });
    let ok = await waitLoaded(page);
    if (s.click) {
      await page.getByRole("button", { name: s.click }).first().click();
      await page.waitForTimeout(1500);
      ok = (await waitLoaded(page)) && ok;
    }
    const left = await anonymize(page);
    await page.waitForTimeout(150);
    // diyalog açıksa yalnız görünen alan, değilse tam sayfa
    await page.screenshot({ path: `${OUT}/${s.file}.png`, fullPage: !s.click });
    // ekran görüntüsünden sonra React yeniden çizmiş olabilir: bir kez daha denetle
    const after = await anonymize(page);
    const warn = [...new Set([...left, ...after])];
    if (warn.length) problems++;
    console.log(`${ok && !warn.length ? "✓" : "!"} ${s.label.padEnd(30)} ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} sn  ${s.file}.png${ok ? "" : "  (yükleme süresi aşıldı)"}`);
    if (warn.length) console.log(`    ! sayfada maskelenmemiş ad kalmış olabilir: ${warn.length} adet; görüntüyü kontrol edin`);
    index.push(`${s.file}.png\t${s.label}\t${s.url.replace(projectId, "<proje>")}`);
  } catch (e) {
    problems++;
    console.log(`✗ ${s.label.padEnd(30)} ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}
await browser.close();
writeFileSync(`${OUT}/INDEX.txt`, index.join("\n") + "\n");
console.log(`\n${shots.length - problems}/${shots.length} sayfa sorunsuz. Görüntüler: ${OUT}/ (paylaşmadan önce göz atın)`);
process.exit(problems ? 1 : 0);
