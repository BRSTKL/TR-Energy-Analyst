/**
 * TR-Energy Analyst - Dayanıklı Excel yükleme
 *
 * exceljs bazı geçerli .xlsx dosyalarını açarken çöküyor. Bilinen durumlar (Python/openpyxl gibi araçların ürettiği
 * dosyalarda görülür; Excel bu dosyaları sorunsuz açar):
 *   - Çizim XML'i ön eksiz varsayılan ad alanıyla yazılır (<wsDr xmlns="...spreadsheetDrawing">). exceljs yalnızca
 *     "xdr:wsDr" biçimini tanır, çizimi boş bırakır ve "Cannot read properties of undefined (reading 'anchors')"
 *     hatasıyla çöker.
 *   - İlişki (.rels) hedefleri mutlak yolla yazılır (Target="/xl/drawings/drawing1.xml").
 *
 * Bu modül önce dosyayı olduğu gibi açmayı dener; olmazsa bellekte onarır:
 *   1. Mutlak ilişki hedeflerini göreli yola çevirir.
 *   2. Yine olmazsa çizimleri (grafik, resim) paketten tamamen çıkarır: veri okumak için gerekmezler.
 * Diskteki dosya değişmez.
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";
import path from "node:path";

/** "xl/worksheets/_rels/sheet1.xml.rels" → ilişkinin kaynağının klasörü "xl/worksheets" */
function sourceDirOfRels(relsPath: string): string {
  const dir = path.posix.dirname(relsPath); // xl/worksheets/_rels
  return path.posix.dirname(dir); // xl/worksheets
}

/** Mutlak ilişki hedeflerini (Target="/xl/...") ilişkinin kaynağına göre göreli yola çevirir. */
export async function relativizeRelationshipTargets(buffer: Buffer): Promise<{ buffer: Buffer; changed: number }> {
  const zip = await JSZip.loadAsync(buffer);
  let changed = 0;
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith(".rels") || name === "_rels/.rels") continue;
    const xml = await zip.file(name)!.async("string");
    const base = sourceDirOfRels(name);
    const fixed = xml.replace(/Target="\/([^"]+)"/g, (_m, abs: string) => {
      changed++;
      return `Target="${path.posix.relative(base, abs)}"`;
    });
    if (fixed !== xml) zip.file(name, fixed);
  }
  return { buffer: await zip.generateAsync({ type: "nodebuffer" }), changed };
}

/**
 * Çizimleri paketten tamamen çıkarır: xl/drawings ve xl/charts altındaki parçalar, sayfalardaki <drawing> etiketleri,
 * sayfa ilişkileri ve [Content_Types].xml kayıtları. Hücre verisi ve biçimler korunur.
 */
export async function stripDrawings(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (/^xl\/(drawings|charts)\//.test(name)) {
      zip.remove(name);
    } else if (/^xl\/worksheets\/sheet[^/]*\.xml$/.test(name)) {
      const xml = await zip.file(name)!.async("string");
      zip.file(name, xml.replace(/<(legacyDrawing|drawing)\b[^>]*\/>/g, ""));
    } else if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(name)) {
      const xml = await zip.file(name)!.async("string");
      zip.file(name, xml.replace(/<Relationship\b[^>]*relationships\/(drawing|vmlDrawing)"[^>]*\/>/g, ""));
    }
  }
  const ct = zip.file("[Content_Types].xml");
  if (ct) {
    const xml = await ct.async("string");
    zip.file("[Content_Types].xml", xml.replace(/<Override\b[^>]*PartName="\/xl\/(drawings|charts)\/[^"]*"[^>]*\/>/g, ""));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * .xlsx dosyasını exceljs ile açar; açılamazsa önce ilişki yollarını düzeltip, sonra çizimleri atıp tekrar dener.
 * Üç deneme de başarısızsa ilk hatayı anlaşılır bir mesajla fırlatır.
 */
export async function loadWorkbookResilient(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const tryLoad = async (b: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(b as any);
    return wb;
  };

  let firstError: unknown;
  try {
    return await tryLoad(buffer);
  } catch (err) {
    firstError = err;
  }

  let repaired: Buffer | null = null;
  try {
    const { buffer: relFixed, changed } = await relativizeRelationshipTargets(buffer);
    repaired = relFixed;
    if (changed > 0) return await tryLoad(relFixed);
  } catch {
    // zip okunamadıysa aşağıdaki deneme de başarısız olacak; ilk hata raporlanır
  }

  try {
    return await tryLoad(await stripDrawings(repaired ?? buffer));
  } catch {
    const detail = firstError instanceof Error ? firstError.message : String(firstError);
    throw new Error(
      `Excel dosyası açılamadı (${detail}). Dosyayı Excel'de açıp "Farklı Kaydet → Excel Çalışma Kitabı (.xlsx)" ile yeniden kaydetmeyi deneyin.`
    );
  }
}
