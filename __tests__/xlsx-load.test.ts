import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { loadWorkbookResilient, relativizeRelationshipTargets } from "../lib/parsers/xlsx-load";

/**
 * openpyxl'in ürettiği biçimde grafik içeren bir .xlsx: çizim XML'i ön eksiz ad alanıyla, ilişki hedefleri mutlak
 * yolla yazılmış. exceljs bu dosyada "reading 'anchors'" hatasıyla çöker.
 */
async function openpyxlStyleWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Saatlik Üretim");
  ws.addRow(["Tarih_Saat", "RES_1_MWh"]);
  ws.addRow([new Date(Date.UTC(2025, 0, 1, 0)), 15]);
  ws.addRow([new Date(Date.UTC(2025, 0, 1, 1)), 11.04]);
  const zip = await JSZip.loadAsync(Buffer.from(await wb.xlsx.writeBuffer()));

  zip.file(
    "xl/drawings/drawing1.xml",
    '<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><oneCellAnchor><from><col>0</col><colOff>0</colOff><row>8</row><rowOff>0</rowOff></from><ext cx="5400000" cy="2700000"/><graphicFrame><nvGraphicFramePr><cNvPr id="1" name="Chart 1"/><cNvGraphicFramePr/></nvGraphicFramePr><xfrm/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></graphicFrame><clientData/></oneCellAnchor></wsDr>'
  );
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="/xl/charts/chart1.xml" Id="rId1"/></Relationships>'
  );
  zip.file("xl/charts/chart1.xml", '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>');
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="/xl/drawings/drawing1.xml" Id="rIdD1"/></Relationships>'
  );
  const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  zip.file(
    "xl/worksheets/sheet1.xml",
    sheet.replace(
      "</worksheet>",
      '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdD1"/></worksheet>'
    )
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("Dayanıklı Excel yükleme", () => {
  it("exceljs'in çöktüğü openpyxl biçimli grafikli dosyayı açar ve veriyi korur", async () => {
    const buf = await openpyxlStyleWorkbook();
    await expect(new ExcelJS.Workbook().xlsx.load(buf as any)).rejects.toThrow(/anchors/);

    const wb = await loadWorkbookResilient(buf);
    const ws = wb.getWorksheet("Saatlik Üretim")!;
    expect(ws.getCell("A1").value).toBe("Tarih_Saat");
    expect(ws.getCell("B3").value).toBe(11.04);
    expect((ws.getCell("A2").value as Date).toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("Mutlak ilişki hedeflerini ilişkinin kaynağına göre göreli yola çevirir", async () => {
    const { buffer, changed } = await relativizeRelationshipTargets(await openpyxlStyleWorkbook());
    expect(changed).toBe(2);
    const zip = await JSZip.loadAsync(buffer);
    expect(await zip.file("xl/worksheets/_rels/sheet1.xml.rels")!.async("string")).toContain('Target="../drawings/drawing1.xml"');
    expect(await zip.file("xl/drawings/_rels/drawing1.xml.rels")!.async("string")).toContain('Target="../charts/chart1.xml"');
  });

  it("Sağlam dosyayı olduğu gibi açar", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("A").addRow(["x", 1]);
    const opened = await loadWorkbookResilient(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(opened.getWorksheet("A")!.getCell("B1").value).toBe(1);
  });
});
