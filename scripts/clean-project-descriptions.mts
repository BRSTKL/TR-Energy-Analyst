/**
 * Proje açıklamalarındaki eski EPİAŞ kaynak notlarını santral kayıtlarına taşır ve açıklamayı kullanıcı metnine indirir.
 * (Eski sürümler "EPİAŞ: <santral>: KGÜP ... Santral kimliği N, UEVÇB ..." notlarını açıklamaya ekliyordu.)
 * Çalıştırmadan önce veritabanı yedeklenir. Tekrar çalıştırmak zararsızdır.
 *
 *   npx tsx scripts/clean-project-descriptions.mts
 */
import { PrismaClient } from "@prisma/client";
import { backupDatabase } from "../lib/db-backup";
import { splitProjectDescription } from "../lib/projects/description";
import { plantNameKey } from "../lib/plants/validation";

const prisma = new PrismaClient();
const projects = await prisma.project.findMany({ include: { plants: true } });
const dirty = projects.filter((p) => splitProjectDescription(p.description).notes.length > 0);
if (dirty.length === 0) {
  console.log("Temizlenecek açıklama yok.");
  process.exit(0);
}
console.log(await backupDatabase(prisma, "clean-descriptions"));

for (const project of dirty) {
  const { text, notes } = splitProjectDescription(project.description);
  let moved = 0;
  for (const note of notes) {
    // Çok santralli notta ad eşleşir; tek santralli eski notta santral kimliği ya da projenin tek santrali
    const plant =
      (note.plantName && project.plants.find((p) => plantNameKey(p.name) === plantNameKey(note.plantName!))) ||
      (note.powerPlantId !== null && project.plants.find((p) => p.epiasPlantId === note.powerPlantId)) ||
      (!note.plantName && project.plants.length === 1 ? project.plants[0] : undefined);
    if (!plant) continue;
    await prisma.powerPlant.update({
      where: { id: plant.id },
      data: {
        epiasPlantId: plant.epiasPlantId ?? note.powerPlantId,
        kgupVersion: plant.kgupVersion ?? note.kgupVersion ?? "FIRST",
        uevcbIds: plant.uevcbIds ?? (note.uevcbIds.length ? note.uevcbIds.join(",") : null),
      },
    });
    moved++;
  }
  await prisma.project.update({ where: { id: project.id }, data: { description: text || null } });
  console.log(`${project.name}: ${moved}/${notes.length} not santrallere taşındı; açıklama: "${text}"`);
}
await prisma.$disconnect();
