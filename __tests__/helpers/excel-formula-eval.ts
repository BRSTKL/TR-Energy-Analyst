/**
 * Test yardımcısı: dışa aktarılan Excel'deki formülleri Excel olmadan değerlendirir.
 *
 * Yalnızca uygulamanın ürettiği formül alt kümesini destekler: sayılar, "metin", hücre başvurusu (A1),
 * başka sayfaya sütun aralığı ('Sayfa'!G:G, yalnızca SUMIFS içinde), + − * / > < = <> >= <=,
 * IF, MIN, MAX, SUMIFS. Desteklenmeyen bir şey görürse hata fırlatır; böylece formül şablonu
 * değişirse test sessizce yanlış sonuç vermez.
 *
 * Amaç, formül METNİNİ bağımsız olarak doğrulamaktır (yanlış sütun harfi, yanlış katsayı vb.).
 */

import type ExcelJS from "exceljs";

type Value = number | string | boolean;
type Range = { sheet: string; column: string };

const colIndex = (letters: string) => letters.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

export function createEvaluator(workbook: ExcelJS.Workbook) {
  const cache = new Map<string, Value>();

  function cellValue(sheetName: string, ref: string): Value {
    const key = `${sheetName}!${ref}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) throw new Error(`Sayfa yok: ${sheetName}`);
    const raw = sheet.getCell(ref).value as unknown;
    let v: Value;
    if (raw && typeof raw === "object" && "formula" in (raw as object)) {
      v = evaluate((raw as { formula: string }).formula, sheetName);
    } else if (raw === null || raw === undefined) {
      v = 0;
    } else {
      v = raw as Value;
    }
    cache.set(key, v);
    return v;
  }

  function columnValues(range: Range): Value[] {
    const sheet = workbook.getWorksheet(range.sheet);
    if (!sheet) throw new Error(`Sayfa yok: ${range.sheet}`);
    const out: Value[] = [];
    for (let r = 1; r <= sheet.rowCount; r++) out.push(cellValue(range.sheet, `${range.column}${r}`));
    return out;
  }

  function evaluate(formula: string, sheetName: string): Value {
    const tokens = formula.match(/'[^']+'!\$?[A-Z]+:\$?[A-Z]+|[A-Z]+\d+|\d+(\.\d+)?|"[^"]*"|<>|>=|<=|[A-Z]+(?=\()|[-+*/(),<>=]/g);
    if (!tokens || tokens.join("").replace(/\s/g, "") !== formula.replace(/\s/g, "")) {
      throw new Error(`Desteklenmeyen formül: ${formula}`);
    }
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const expect = (t: string) => {
      if (next() !== t) throw new Error(`'${t}' bekleniyordu: ${formula}`);
    };
    const num = (v: Value) => {
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      throw new Error(`Sayı bekleniyordu, '${v}' geldi: ${formula}`);
    };

    function parseArgs(): (Value | Range)[] {
      expect("(");
      const args: (Value | Range)[] = [];
      if (peek() !== ")") {
        args.push(parseComparison());
        while (peek() === ",") {
          next();
          args.push(parseComparison());
        }
      }
      expect(")");
      return args;
    }

    function parsePrimary(): Value | Range {
      const t = next();
      if (t === undefined) throw new Error(`Beklenmeyen son: ${formula}`);
      if (t === "(") {
        const v = parseComparison();
        expect(")");
        return v;
      }
      if (t === "-") return -num(parsePrimary() as Value);
      if (/^\d/.test(t)) return Number(t);
      if (t.startsWith('"')) return t.slice(1, -1);
      if (t.startsWith("'")) {
        const [, sheet, column] = t.match(/^'([^']+)'!\$?([A-Z]+):/)!;
        return { sheet, column };
      }
      if (/^[A-Z]+\d+$/.test(t)) return cellValue(sheetName, t);
      if (/^[A-Z]+$/.test(t)) {
        const args = parseArgs();
        const vals = args as Value[];
        switch (t) {
          case "IF":
            return vals[0] ? vals[1] : vals[2];
          case "MIN":
            return Math.min(...vals.map(num));
          case "MAX":
            return Math.max(...vals.map(num));
          case "SUMIFS": {
            const [sumRange, ...criteria] = args as [Range, ...(Range | Value)[]];
            const sums = columnValues(sumRange);
            const pairs: [Value[], Value][] = [];
            for (let i = 0; i < criteria.length; i += 2) {
              pairs.push([columnValues(criteria[i] as Range), criteria[i + 1] as Value]);
            }
            let total = 0;
            sums.forEach((v, row) => {
              if (typeof v === "number" && pairs.every(([col, crit]) => col[row] === crit)) total += v;
            });
            return total;
          }
          default:
            throw new Error(`Desteklenmeyen fonksiyon ${t}: ${formula}`);
        }
      }
      throw new Error(`Beklenmeyen simge '${t}': ${formula}`);
    }

    function parseTerm(): Value | Range {
      let left = parsePrimary();
      while (peek() === "*" || peek() === "/") {
        const op = next();
        const right = parsePrimary();
        left = op === "*" ? num(left as Value) * num(right as Value) : num(left as Value) / num(right as Value);
      }
      return left;
    }

    function parseSum(): Value | Range {
      let left = parseTerm();
      while (peek() === "+" || peek() === "-") {
        const op = next();
        const right = parseTerm();
        left = op === "+" ? num(left as Value) + num(right as Value) : num(left as Value) - num(right as Value);
      }
      return left;
    }

    function parseComparison(): Value | Range {
      const left = parseSum();
      const op = peek();
      if (op && ["=", "<>", ">", "<", ">=", "<="].includes(op)) {
        next();
        const right = parseSum() as Value;
        const l = left as Value;
        switch (op) {
          case "=":
            return l === right;
          case "<>":
            return l !== right;
          case ">":
            return num(l) > num(right);
          case "<":
            return num(l) < num(right);
          case ">=":
            return num(l) >= num(right);
          default:
            return num(l) <= num(right);
        }
      }
      return left;
    }

    const result = parseComparison();
    if (pos !== tokens.length) throw new Error(`Formül tam okunamadı: ${formula}`);
    if (typeof result === "object") throw new Error(`Aralık tek başına değer olamaz: ${formula}`);
    return result;
  }

  return {
    /** Sayfadaki bir hücrenin değerini (formülse değerlendirerek) döndürür */
    value: (sheetName: string, ref: string) => cellValue(sheetName, ref),
    colIndex,
  };
}
