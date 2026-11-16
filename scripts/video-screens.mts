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
 * Çıktı: .cache/video-screens/<proje-id>/NN-<sayfa>.png (git dışı); uzun sayfalar ayrıca NN-<sayfa>-parcaK.png (1440×900). Takma adlar: seçilen projenin santralleri
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
// büyük-küçük harf farkı gözetmeden (bazı başlıklar CSS ile büyük harfe çevriliyor; "Geriye dönük test çalıştırılıyor…")
const BUSY_TEXT = /yükleniyor|hesaplanıyor|çalıştırılıyor|model kuruluyor/;

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
// Tür kodu, durum gibi kısa büyük harfli değerler ad sayılmaz ("RES" → "Santral S001" olmasın)
const isCode = (x: unknown) => typeof x === "string" && /^[A-Z0-9_]{1,6}$/.test(x.trim());
const addName = (x: unknown, kind: Kind) => { if (!isCode(x)) add(x, kind); };
const addList = (x: unknown, kind: Kind, depth: number) => {
  if (Array.isArray(x)) x.forEach((y) => (typeof y === "string" ? addName(y, kind) : harvest(y, depth + 1)));
};
// Bir API yanıtını gezer, ad taşıyan alanları toplar. "name" yalnız santral, şirket ya da toplayıcı satırında ad sayılır
// (strateji, sekme gibi başka "name" alanları maskelenmez).
function harvest(v: unknown, depth = 0): void {
  if (depth > 12 || v === null || typeof v !== "object") return;
  if (Array.isArray(v)) return v.forEach((x) => harvest(x, depth + 1));
  const o = v as Record<string, unknown>;
  const isCompany = "slug" in o && "name" in o;   // şirket listesi ve profili
  const isAggregator = "listedPlants" in o || "portfolioCostTl" in o;
  // santral satırı: EPİAŞ kimliği, ya da tür kodu + sahip / kimlik / güç (santral rehberi, kart, şirket profili)
  const isPlant = !isCompany && ("epiasPlantId" in o || (typeof o.type === "string" && "name" in o &&
    (TECH.has(o.type) || "owner" in o || "organizationId" in o || "uevcbId" in o)));
  if (isCompany) addName(o.name, "company");
  else if (isAggregator) addName(o.name, "aggregator");
  else if (isPlant) addName(o.name, "plant");
  for (const k of ["plantName", "uevcbName", "powerPlantName", "facilityName", "plant"]) if (typeof o[k] === "string") addName(o[k], "plant");
  for (const k of ["organizationName", "owner", "ownerName", "company", "orgName", "org"]) if (typeof o[k] === "string") addName(o[k], "company");
  for (const k of ["aggregatorName", "aggregator"]) if (typeof o[k] === "string") addName(o[k], "aggregator");
  for (const k of ["companies", "owners"]) addList(o[k], "company", depth);
  for (const k of ["plantNames", "excludedYeka"]) addList(o[k], "plant", depth);
  addList(o.aggregators, "aggregator", depth);
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
for (const path of ["/api/sector", "/api/sector/aggregators", "/api/companies?limit=500", "/api/plants?limit=500"]) harvest(await getJson(path));
console.log(`${alias.size} ad toplandı (sayfa yüklendikçe artar).`);

// --- Gezilecek sayfalar ---
// click: diyaloğu açan düğme (yalnız görünen alan alınır); emptyTab: sayfa boş türle açılırsa basılacak sekme
type Shot = { file: string; url: string; label: string; click?: string; emptyTab?: string };
const P = `/projects/${projectId}`;
// Sıra menüyü izler: Günlük iş → Portföyüm → proje sayfaları → Piyasa → Sektör → Metodoloji
const shots: Shot[] = [
  { file: "01-bugun", url: "/", label: "Bugün" },
  { file: "02-teklif-oncesi", url: "/market/teklif", label: "Teklif öncesi" },
  { file: "03-gunluk-pano", url: "/market/gunluk", label: "Günlük pano" },
  { file: "04-ariza-izleme", url: "/ariza", label: "Arıza izleme" },
  { file: "05-projelerim", url: "/projects", label: "Projelerim" },
  { file: "06-epias-santral-ekle", url: "/projects/epias", label: "EPİAŞ'tan santral ekle" },
  { file: "07-proje-karsilastirma", url: "/compare", label: "Proje karşılaştırma" },
  { file: "08-donem-ozeti", url: "/ozet", label: "Dönem özeti" },
  { file: "09-sonuclar", url: `${P}/results`, label: "Sonuçlar" },
  { file: "10-powerpoint-diyalogu", url: `${P}/results`, label: "PowerPoint diyaloğu", click: "PowerPoint" },
  { file: "11-stratejik-icgoruler", url: `${P}/insights`, label: "Stratejik İçgörüler" },
  { file: "12-dsg-senaryolari", url: `${P}/dsg`, label: "DSG Senaryoları" },
  { file: "13-planlama-verimlilik", url: `${P}/planning?tab=efficiency`, label: "Planlama · Verimlilik" },
  { file: "14-planlama-gip", url: `${P}/planning?tab=arbitrage`, label: "Planlama · GİP" },
  { file: "15-planlama-butce", url: `${P}/planning?tab=budget`, label: "Planlama · Bütçe" },
  { file: "16-aday-santraller", url: `${P}/candidates`, label: "Aday santraller" },
  { file: "17-geriye-donuk-test", url: `${P}/backtest`, label: "Geriye dönük test" },
  { file: "18-dogrulama-paketi", url: `${P}/validation`, label: "Doğrulama paketi" },
  { file: "19-kayip-uretim", url: `${P}/losses`, label: "Kayıp üretim" },
  { file: "20-uretim-tahmini", url: `${P}/forecast`, label: "Üretim tahmini", emptyTab: "Rüzgâr" },
  { file: "21-santraller", url: `${P}/plants`, label: "Santraller" },
  { file: "22-uretim-verisi-yukle", url: `${P}/import`, label: "Üretim verisi yükle" },
  { file: "23-piyasa-ozeti", url: "/market", label: "Piyasa özeti" },
  { file: "24-yeni-santral-radari", url: "/yeni-santraller", label: "Yeni santral radarı" },
  { file: "25-yekdem-cikislari", url: "/yekdem", label: "YEKDEM çıkışları" },
  { file: "26-sektor-karnesi", url: "/sector", label: "Sektör karnesi" },
  { file: "28-sirketler", url: "/sirketler", label: "Şirketler" },
  { file: "30-santral-rehberi", url: "/santraller", label: "Santral rehberi" },
  { file: "32-metodoloji", url: "/methodology", label: "Metodoloji" },
];
const ag = await getJson<{ rows?: Array<{ id?: number }>; aggregators?: Array<{ id?: number }> }>("/api/sector/aggregators");
const agId = (ag?.rows ?? ag?.aggregators ?? [])[0]?.id;
if (agId !== undefined) shots.push({ file: "27-toplayici-ayrintisi", url: `/sector/aggregators/${agId}`, label: "Toplayıcı ayrıntısı" });
// Santral kartı ve şirket profili: seçilen projenin ilk santrali ve onun sahibi (ikisi de takma adla görünür)
const firstPlant = detail.project.plants[0]?.name;
const found = firstPlant ? await getJson<{ items?: Array<{ id: number; name: string; owner: string | null }> }>(`/api/plants?q=${encodeURIComponent(firstPlant)}`) : null;
const card = found?.items?.find((x) => x.name === firstPlant) ?? found?.items?.[0];
if (card) {
  shots.push({ file: "31-santral-karti", url: `/santraller/${card.id}`, label: "Santral kartı" });
  if (card.owner) {
    const { companySlug } = await import("@/lib/analysis/company-profile");
    shots.push({ file: "29-sirket-profili", url: `/sirketler/${encodeURIComponent(companySlug(card.owner))}`, label: "Şirket profili" });
  }
}
shots.sort((a, b) => a.file.localeCompare(b.file));

async function waitLoaded(page: Page): Promise<boolean> {
  const t0 = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - t0 < LOAD_TIMEOUT_MS) {
    const { busy, len } = await page.evaluate((busyRe) => {
      const t = document.body?.innerText ?? "";
      return { busy: document.querySelectorAll(".animate-spin").length > 0 || new RegExp(busyRe).test(t.toLocaleLowerCase("tr-TR")), len: t.length };
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
    // kurulu güç / konum notlarındaki kayıt adları: YEKDEM ve EPDK adı ("Arpa HES", "KOCATEPE RES", "Çermikler Barajı ve HES"),
    // GEM adı ("Atik wind farm, Hatay"), il / ilçe, GEM kimliği, koordinat; toplayıcı sayfasında kısaltılmış büyük harfli şirket adları
    // yalnız ": " ya da "(" sonrası (notlardaki kayıt adı); "Toplam RES" gibi ekran metni kalır
    [/(?<=: |\\()(?:[A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜçğıöşüâî.'-]*\\s){1,4}(?:Barajı ve |BARAJI VE |REG\\. VE |Regülatörü ve |REGÜLATÖRÜ VE )?(?:RES|HES|GES)\\b/g, "Santral"],
    [/(?:[A-Z][A-Za-z'.-]*\\s){1,4}(?:wind farm|solar (?:power )?(?:plant|farm|project)|hydroelectric (?:plant|power station|power plant)|power station)(?:, [A-ZÇĞİÖŞÜ][a-zçğıöşü]+)?/g, "Santral"],
    [/\\bGEM [A-Z]\\d{6,}/g, "GEM ••••"],
    [/\\(([A-ZÇĞİÖŞÜ]{3,}) \\/ [A-ZÇĞİÖŞÜ ]{3,}\\)/g, "(il / ilçe)"],
    [/\\b[A-ZÇĞİÖŞÜ]{3,} (Santral S?\\d+)/g, "$1"],
    [/\\d{1,3},\\d{3,}°/g, "••,••••°"],
    [/[A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜ0-9.&'\\- ]{2,80}\\b(?:ENERJİ|ELEKTRİK|ÜRETİM)(?=[\\s.…]|$)[A-ZÇĞİÖŞÜ0-9.&'\\- ]*(?:\\.\\.\\.|…)?/g, "Şirket"],
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
    if (s.emptyTab && (await page.getByText("seçilen türde santral yok").count())) {
      await page.getByRole("button", { name: s.emptyTab, exact: true }).first().click();
      ok = (await waitLoaded(page)) && ok;
    }
    if (s.click) {
      await page.getByRole("button", { name: s.click }).first().click();
      await page.waitForTimeout(1500);
      ok = (await waitLoaded(page)) && ok;
    }
    const left = await anonymize(page);
    await page.waitForTimeout(150);
    // diyalog açıksa yalnız görünen alan, değilse tam sayfa
    await page.screenshot({ path: `${OUT}/${s.file}.png`, fullPage: !s.click });
    // Uzun sayfa ayrıca ekran boyunda parçalar hâlinde: sohbete yüklenen tam boy görüntü küçültülüyor, rakamlar okunmuyor
    let parts = 0;
    if (!s.click) {
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      const step = 900;
      if (height > step * 1.5)
        for (let y = 0, i = 1; y < height; y += step, i++, parts++)
          await page.screenshot({ path: `${OUT}/${s.file}-parca${i}.png`, fullPage: true, clip: { x: 0, y, width: 1440, height: Math.min(step, height - y) } });
    }
    // ekran görüntüsünden sonra React yeniden çizmiş olabilir: bir kez daha denetle
    const after = await anonymize(page);
    const warn = [...new Set([...left, ...after])];
    if (warn.length) problems++;
    console.log(`${ok && !warn.length ? "✓" : "!"} ${s.label.padEnd(30)} ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} sn  ${s.file}.png${parts ? ` + ${parts} parça` : ""}${ok ? "" : "  (yükleme süresi aşıldı)"}`);
    if (warn.length) console.log(`    ! sayfada maskelenmemiş ad kalmış olabilir: ${warn.length} adet; görüntüyü kontrol edin`);
    index.push(`${s.file}.png\t${s.label}\t${s.url.replace(projectId, "<proje>").replace(/^\/sirketler\/.+/, "/sirketler/<sirket>")}`);
  } catch (e) {
    problems++;
    console.log(`✗ ${s.label.padEnd(30)} ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}
await browser.close();
writeFileSync(`${OUT}/INDEX.txt`, index.join("\n") + "\n");
console.log(`\n${shots.length - problems}/${shots.length} sayfa sorunsuz. Görüntüler: ${OUT}/ (paylaşmadan önce göz atın)`);
process.exit(problems ? 1 : 0);
