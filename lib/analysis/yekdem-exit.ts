/**
 * TR-Energy Analyst - YEKDEM çıkışları: hangi santraller serbest piyasaya çıktı ya da çıkacak?
 *
 * Kural: YEKDEM fiyatları tesisin işletmeye giriş tarihinden itibaren 10 yıl uygulanır (5346 s. Kanun md. 6, 2013/5625
 * s. BKK; 2021 sonrası TL mekanizması da 10 yıl). Kısmen işletmeye girmiş tesiste süre ilk YEKDEM katılımından başlar.
 * Katılım her yıl ayrı başvuruyla olur; süresi dolan ya da çıkmayı seçen santral üretimini serbest piyasada satar ve
 * dengesizliğini kendisi taşır: toplayıcının en doğal hedefi.
 *
 * İşletmeye giriş tarihi açık veride yok. Vekil: santralin EPİAŞ YEKDEM listelerinde ilk görüldüğü yıl. Bu dönemde
 * yenilenebilir santrallerin neredeyse hepsi devreye girdiği yıl ya da ertesi yıl YEKDEM'e katıldığı için işletmeye
 * giriş yılı [ilk yıl − 1, ilk yıl] aralığındadır; süre [ilk yıl + 9, ilk yıl + 10] içinde dolar. Listelerin kapsadığı
 * ilk yılda görülen santral daha önce de olabilir (sansürlü): o zaman yalnız üst sınır bilinir, ama santral bu yıl
 * hâlâ listedeyse süresi bu yıldan önce dolmuş olamaz; ikisi birlikte aralığı daraltır.
 *
 * Kaynaklar (lib/services/yekdem-exit.ts):
 *   - Santral kimlikli liste (renewables/data/licensed-powerplant-list), 2014'ten bugüne; varlık kesin, 2017'den önce
 *     kapsamı dar (2016: 233 santral, katılımcı listesinde 556).
 *   - Ad, şirket ve kurulu güçlü katılımcı listesi (renewables/data/renewables-participant), 2016–2025; santrale ad
 *     eşleşmesiyle bağlanır, erken yılları tamamlar.
 * SAF: I/O yok.
 */

import { yearAblative, yearLocative } from "@/lib/format";

export const YEKDEM_TERM_YEARS = 10;
/** Kimlikli listenin tam kapsadığı ilk yıl (öncesinde liste eksik: ilk görülme yılı sansürlü) */
export const ID_LIST_FULL_FROM = 2017;
/** Katılımcı listesinin ilk yılı */
export const NAME_LIST_FROM = 2016;

export type YekdemExitStatus =
  /** Geçen yıl YEKDEM'deydi, bu yıl değil: bu yılın başından beri serbest piyasada */
  | "EXITED"
  /** Bu yıl YEKDEM'de ve 10 yıllık süresi bu yıl doluyor: gelecek yıl serbest piyasada (kesin) */
  | "ENDS_THIS_YEAR"
  /** Bu yıl YEKDEM'de, süresi en erken gelecek yıl dolabilir (tahmini, ±1 yıl) */
  | "ENDS_SOON"
  /** Bu yıl YEKDEM'de, süresi daha sonra doluyor */
  | "LATER"
  /** Geçmişte YEKDEM'deydi, geçen yıldan önce çıktı */
  | "LEFT_EARLIER"
  /** Listelerde hiç görülmedi */
  | "NEVER";

export const YEKDEM_EXIT_LABEL: Record<YekdemExitStatus, string> = {
  EXITED: "Bu yıl çıktı",
  ENDS_THIS_YEAR: "Süresi bu yıl doluyor",
  ENDS_SOON: "Süresi yakında doluyor",
  LATER: "YEKDEM'de, süresi sonra doluyor",
  LEFT_EARLIER: "Daha önce çıktı",
  NEVER: "YEKDEM'de değil",
};

export interface YekdemHistoryInput {
  /** Kimlikli listede bulunduğu yıllar */
  idYears: number[];
  /** Katılımcı listesinde (ad eşleşmesiyle) bulunduğu yıllar */
  nameYears: number[];
}

export interface YekdemExit {
  status: YekdemExitStatus;
  /** İki listede ilk görüldüğü yıl; hiç görülmediyse null */
  firstYear: number | null;
  /** İlk yıl listelerin kapsamının başında: santral daha önce de YEKDEM'de olabilir */
  censored: boolean;
  /** YEKDEM'de bulunduğu son yıl */
  lastYear: number | null;
  /** 10 yıllık sürenin dolduğu yıl aralığı (tahmini); hiç görülmediyse null */
  termEnds: { earliest: number; latest: number } | null;
  /** Serbest piyasadaki ilk tam yıl; YEKDEM'de değilse lastYear + 1 */
  marketFrom: { earliest: number; latest: number } | null;
  /** Bu yıl çıkan santralde: süresi dolmuş mu, yoksa süresi sürerken mi çıktı (geri dönebilir) */
  exitReason: "term" | "voluntary" | "unclear" | null;
  /** Okunur açıklama */
  note: string;
}

/**
 * @param currentYear kimlikli listenin en son yayımlanan yılı (ör. 2026)
 */
export function classifyYekdemExit(input: YekdemHistoryInput, currentYear: number): YekdemExit {
  const ids = new Set(input.idYears);
  const all = Array.from(new Set([...input.idYears, ...input.nameYears])).sort((a, b) => a - b);
  if (all.length === 0) {
    return { status: "NEVER", firstYear: null, censored: false, lastYear: null, termEnds: null, marketFrom: null, exitReason: null, note: "YEKDEM listelerinde görülmedi." };
  }
  const firstYear = all[0];
  const lastYear = all[all.length - 1];
  const idFirst = input.idYears.length ? Math.min(...input.idYears) : Infinity;
  const nameFirst = input.nameYears.length ? Math.min(...input.nameYears) : Infinity;
  // Hangi liste ilk yılı verdiyse onun kapsam başlangıcına göre sansür
  const censored = nameFirst <= idFirst ? nameFirst <= NAME_LIST_FROM : idFirst <= ID_LIST_FULL_FROM;

  // İşletmeye giriş [ilk yıl − 1, ilk yıl] (sansürlüyse ≤ ilk yıl); süre son katılım yılından önce dolmuş olamaz
  let earliest = censored ? lastYear : Math.max(firstYear - 1 + YEKDEM_TERM_YEARS, lastYear);
  const latest = Math.max(firstYear + YEKDEM_TERM_YEARS, lastYear);
  if (earliest > latest) earliest = latest;
  const termEnds = { earliest, latest };

  const inCur = ids.has(currentYear);
  const inPrev = ids.has(currentYear - 1);
  const range = (a: number, b: number) => (a === b ? String(a) : `${a}–${b}`);

  if (inCur) {
    const marketFrom = { earliest: earliest + 1, latest: latest + 1 };
    if (latest <= currentYear) {
      return {
        status: "ENDS_THIS_YEAR",
        firstYear,
        censored,
        lastYear,
        termEnds,
        marketFrom,
        exitReason: null,
        note: `${censored ? `${firstYear} ya da önce` : yearLocative(firstYear)} YEKDEM'e girdi; 10 yıllık süre en geç ${currentYear} içinde doluyor, ${yearAblative(currentYear + 1)} itibaren serbest piyasada.`,
      };
    }
    const soon = earliest <= currentYear + 1;
    return {
      status: soon ? "ENDS_SOON" : "LATER",
      firstYear,
      censored,
      lastYear,
      termEnds,
      marketFrom,
      exitReason: null,
      note: `${censored ? `${firstYear} ya da önce` : yearLocative(firstYear)} YEKDEM'e girdi; süre tahminen ${range(earliest, latest)} içinde doluyor (işletmeye giriş tarihi açık veride yok, ±1 yıl).`,
    };
  }

  const marketFrom = { earliest: lastYear + 1, latest: lastYear + 1 };
  if (inPrev) {
    // Süresi dolmuş mu? İşletmeye giriş en geç ilk yıl: süre en geç ilk yıl + 10'da dolar
    const termOver = latest <= currentYear - 1 || (censored && firstYear + YEKDEM_TERM_YEARS <= currentYear);
    const stillInTerm = !censored && firstYear - 1 + YEKDEM_TERM_YEARS >= currentYear;
    const exitReason = termOver ? "term" : stillInTerm ? "voluntary" : "unclear";
    const why =
      exitReason === "term"
        ? "10 yıllık süresi dolmuş görünüyor"
        : exitReason === "voluntary"
          ? `süresi ${range(earliest, latest)} yılına kadar sürüyor: kendi isteğiyle çıktı, gelecek yıl geri dönebilir`
          : "süresinin dolup dolmadığı ayrılamıyor";
    return {
      status: "EXITED",
      firstYear,
      censored,
      lastYear,
      termEnds,
      marketFrom,
      exitReason,
      note: `${yearLocative(currentYear - 1)} YEKDEM'deydi, ${currentYear} listesinde yok; ${why}.`,
    };
  }
  return {
    status: "LEFT_EARLIER",
    firstYear,
    censored,
    lastYear,
    termEnds,
    marketFrom,
    exitReason: null,
    note: `En son ${yearLocative(lastYear)} YEKDEM'deydi; ${yearAblative(lastYear + 1)} beri serbest piyasada.`,
  };
}

/** Toplayıcı hedefi olarak öne çıkan durumlar: bu yıl çıkan, süresi bu yıl ya da yakında dolan */
export const isYekdemExiting = (s: YekdemExitStatus) => s === "EXITED" || s === "ENDS_THIS_YEAR" || s === "ENDS_SOON";
