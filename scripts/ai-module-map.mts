/**
 * Yapay zekâ ajanları için modül haritası: `ai/MODULE_MAP.md` dosyasını koddan üretir (elle düzenlenmez).
 * Her dosyanın ilk JSDoc bloğunun ilk cümlesi alınır; sayfalar adres yoluyla, API'ler adres ve yöntemle yazılır.
 * Dosya eklenince, silinince ya da baş açıklaması değişince yeniden çalıştırılır:
 *
 *   npm run ai:map
 *
 * İzlenen ve gitignore dışında kalan yeni kaynak dosyaları okunur; veri/önbellek dizinleri taranmaz.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "ai", "MODULE_MAP.md");

const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "lib", "app", "components", "scripts", "middleware.ts", "prisma"], { cwd: ROOT, encoding: "utf8" })
  .split("\0")
  .filter((f) => /\.(ts|tsx|mts|prisma|sh|py)$/.test(f) && fs.existsSync(path.join(ROOT, f))))].sort();

/** İlk JSDoc (ya da # yorum) bloğunun ilk cümlesi, en çok 220 karakter */
function summaryOf(file: string): string {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n").slice(0, 120).join("\n");
  let body = "";
  const js = text.match(/\/\*\*([\s\S]*?)\*\//);
  if (js) body = js[1];
  else if (/\.(sh|py)$/.test(file)) {
    const lines = text.split("\n").filter((l) => /^#(?!!)/.test(l)).slice(0, 4);
    body = lines.map((l) => l.replace(/^#\s?/, "")).join(" ");
  } else if (file.endsWith(".prisma")) body = "Veritabanı şeması (Prisma, SQLite).";
  const lines = body
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => !l.startsWith("@"));
  // Başlık satırı (ilk paragrafın ilk satırı, noktasız) ayrı tutulur: "Başlık: ilk cümle"
  const paragraphs = lines.join("\n").replace(/^\n+/, "").split(/\n\s*\n/);
  const clean = (s: string) => s.replace(/^TR-Energy Analyst\s*[-–]?\s*/i, "").replace(/\s+/g, " ").trim();
  const [head = "", ...rest] = (paragraphs[0] ?? "").split("\n");
  const title = clean(head);
  const isTitle = title.length > 0 && title.length <= 90 && !/[.:]$/.test(title) && (rest.length > 0 || paragraphs.length > 1);
  const textPart = clean(isTitle ? [rest.join(" "), rest.length ? "" : paragraphs[1] ?? ""].join(" ") : paragraphs[0] ?? "");
  // İlk cümle; kısaltmalarda (ör., vb., md., bkz., no.) bölünmez
  const sentence = textPart.match(/^(.+?(?<!(?:^|[\s(])(?:ör|örn|vb|vs|md|bkz|no|yak|bk|e\.g|i\.e))[.!?])(\s|$)/)?.[1] ?? textPart;
  const out = isTitle ? (sentence ? `${title}: ${sentence}` : title) : sentence;
  return out.length > 240 ? `${out.slice(0, 239)}…` : out;
}

/** app/(dashboard)/projects/[id]/planning/page.tsx → /projects/[id]/planning */
const routeOf = (file: string) =>
  "/" +
  path
    .dirname(file)
    .replace(/^app\/?/, "")
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .join("/");

function methodsOf(file: string): string {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => new RegExp(`export (const|async function|function) ${m}\\b`).test(text)).join(", ");
}

const groups = new Map<string, string[]>();
const add = (group: string, line: string) => groups.set(group, [...(groups.get(group) ?? []), line]);

for (const f of files) {
  const s = summaryOf(f);
  const note = s ? ` — ${s}` : "";
  if (f.startsWith("app/") && f.endsWith("/page.tsx")) add("Sayfalar (app/**/page.tsx)", `- \`${routeOf(f)}\` (\`${f}\`)${note}`);
  else if (f.startsWith("app/api/") && f.endsWith("route.ts")) add("API (app/api/**/route.ts)", `- \`${methodsOf(f) || "?"} ${routeOf(f)}\`${note}`);
  else if (f.startsWith("app/")) add("app/ (diğer: düzen, yükleniyor, hata)", `- \`${f}\`${note}`);
  else if (f.startsWith("lib/")) add(`lib/${f.split("/")[1]}`, `- \`${f}\`${note}`);
  else if (f.startsWith("scripts/")) add(f.split("/").length > 2 ? `scripts/${f.split("/")[1]}` : "scripts (kök)", `- \`${f}\`${note}`);
  else add(f.split("/")[0], `- \`${f}\`${note}`);
}

const order = (g: string) => (g.startsWith("Sayfa") ? 0 : g.startsWith("API") ? 1 : g.startsWith("app/") ? 2 : g.startsWith("lib/") ? 3 : g.startsWith("comp") ? 4 : g.startsWith("scripts") ? 5 : 6);
const sorted = Array.from(groups.keys()).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
const missing = files.filter((f) => !summaryOf(f) && !f.endsWith("page.tsx")).length;

const out = [
  "# Modül haritası (otomatik)",
  "",
  "> Bu dosya `npm run ai:map` (`scripts/ai-module-map.mts`) ile koddan üretilir; elle düzenlemeyin. Açıklamalar her",
  "> dosyanın ilk JSDoc bloğunun ilk cümlesidir. Açıklaması boş satır, dosyada baş açıklaması olmadığı anlamına gelir:",
  "> ayrıntı için dosyanın kendisine bakın. Bağlam ve kurallar için önce `ai/README.md`.",
  "",
  `${files.length} dosya, ${sorted.length} grup; baş açıklaması olmayan (sayfalar hariç): ${missing}.`,
  "",
  ...sorted.flatMap((g) => [`## ${g} (${groups.get(g)!.length})`, "", ...groups.get(g)!, ""]),
].join("\n");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`ai/MODULE_MAP.md: ${files.length} dosya, ${sorted.length} grup`);
