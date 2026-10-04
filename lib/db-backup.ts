/**
 * TR-Energy Analyst - SQLite Veritabanı Yedekleme
 *
 * Veri silen veya üzerine yazan işlemlerden (proje/santral silme, üretim verisi içe aktarma,
 * piyasa verisi yükleme/senkronu) önce ve her `npm run dev` başlangıcında veritabanının
 * tutarlı bir kopyasını `prisma/backups/` altına alır.
 *
 * Kopya SQLite'ın `VACUUM INTO` komutuyla alınır: sunucu çalışırken bile tutarlıdır (dosya kopyalamanın
 * aksine yarım yazılmış bir işlemi yakalamaz). Yalnızca en yeni MAX_BACKUPS kopya tutulur.
 *
 * Geri yükleme: sunucuyu durdurun, istediğiniz yedeği `prisma/dev.db` üzerine kopyalayın, yeniden başlatın.
 */

import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

export const BACKUP_DIR = path.join(process.cwd(), "prisma", "backups");
/**
 * Tutulan en fazla yedek (her biri veritabanının tam kopyası). Yedek yalnız veri silen ya da kullanıcı verisini değiştiren
 * işlemlerden önce alınır (proje/santral silme, dosya yükleme) ve geliştirme sunucusu açılışında; EPİAŞ'tan yeniden
 * çekilebilen piyasa verisi senkronizasyonunda alınmaz (20 yedek ≈ 600 MB'a çıkmıştı, PLAN 7.6).
 */
export const MAX_BACKUPS = 5;
/** Silme öncesi alınan yedeklerden ayrıca tutulan sayı */
export const MAX_DELETE_BACKUPS = 5;

/** Yalnızca SQLite dosya veritabanında yedek alınır (PostgreSQL'e geçilirse no-op). */
function isSqlite(): boolean {
  const url = process.env.DATABASE_URL;
  return !url || url.startsWith("file:"); // şema sağlayıcısı sqlite; URL yüklenmemişse de SQLite
}

/** Yerel saatle "2026-09-23_21-18-44" (dosya adları sıralanınca kronolojik olur) */
function timestampSlug(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function reasonSlug(reason: string): string {
  return (
    reason
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "manual"
  );
}

/** Yedek dosyalarını en yeniden en eskiye sıralı döndürür. */
export function listBackups(dir = BACKUP_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  // Dosya tarihine göre (elle adlandırılmış "dev-before-…" yedekleri ada göre sıralamada en yeni görünüyordu); eşitlikte ad
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".db"));
  const mtime = new Map(files.map((f) => [f, fs.statSync(path.join(dir, f)).mtimeMs]));
  return files.sort((a, b) => mtime.get(b)! - mtime.get(a)! || b.localeCompare(a));
}

/** En yeni `keep` yedek dışındakileri siler; silinen dosya adlarını döndürür. */
export function pruneBackups(keep = MAX_BACKUPS, dir = BACKUP_DIR): string[] {
  // Silme öncesi yedekler ("delete-*") ayrı sayılır: her açılışta alınan yedekler onları itmesin
  const all = listBackups(dir);
  const isDelete = (f: string) => /-delete-/.test(f);
  const stale = [...all.filter((f) => !isDelete(f)).slice(keep), ...all.filter(isDelete).slice(MAX_DELETE_BACKUPS)];
  for (const f of stale) fs.rmSync(path.join(dir, f), { force: true });
  return stale;
}

/**
 * Veritabanının yedeğini alır ve dosya yolunu döndürür (SQLite değilse veya atlandıysa null).
 * Hata fırlatırsa çağıran taraf veri değiştiren işlemi YAPMAMALIDIR.
 *
 * `minIntervalMs`: son yedek bundan yeniyse yeni yedek alınmaz. Ay ay yapılan EPİAŞ senkronu gibi
 * art arda gelen işlemlerin, yedek sınırını doldurup silme öncesi yedekleri itmesini önler.
 */
export async function backupDatabase(
  client: PrismaClient,
  reason: string,
  { minIntervalMs = 0 }: { minIntervalMs?: number } = {}
): Promise<string | null> {
  if (!isSqlite()) return null;

  if (minIntervalMs > 0) {
    const latest = listBackups()[0];
    if (latest && Date.now() - fs.statSync(path.join(BACKUP_DIR, latest)).mtimeMs < minIntervalMs) return null;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target = path.join(BACKUP_DIR, `dev-${timestampSlug()}-${reasonSlug(reason)}.db`);
  // Aynı saniyede iki yedek çakışmasın: VACUUM INTO var olan dosyanın üzerine yazmaz
  const finalTarget = fs.existsSync(target) ? target.replace(/\.db$/, `-${Date.now() % 1000}.db`) : target;

  await client.$executeRawUnsafe(`VACUUM INTO '${finalTarget.replace(/'/g, "''")}'`);
  pruneBackups();
  return finalTarget;
}
