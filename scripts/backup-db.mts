/**
 * Veritabanı yedeği alır: `npm run db:backup [-- sebep]`.
 * `npm run dev` öncesinde otomatik çalışır (predev).
 */
import { PrismaClient } from "@prisma/client";
import { backupDatabase, listBackups, BACKUP_DIR } from "../lib/db-backup";

const prisma = new PrismaClient();
try {
  const file = await backupDatabase(prisma, process.argv[2] ?? "manual");
  console.log(file ? `Yedek alındı: ${file}` : "SQLite değil, yedek atlandı.");
  console.log(`${BACKUP_DIR} altında ${listBackups().length} yedek var.`);
} catch (error) {
  // Başlangıç yedeği başarısız olsa bile sunucunun açılmasını engelleme
  console.error("Yedek alınamadı:", error instanceof Error ? error.message : error);
} finally {
  await prisma.$disconnect();
}
