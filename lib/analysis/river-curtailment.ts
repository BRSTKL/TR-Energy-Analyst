/**
 * TR-Energy Analyst - Akarsu santrallerinde olası kısıntı (sistem yönü sekmesi; 20.10.2026)
 *
 * Akarsuda su ya da hava modeli yok; rüzgâr ve güneşteki gibi "üretebileceği" hesaplanamaz. Kaba kural: plan (son KGÜP) en
 * az RIVER_MIN_PLAN_MW iken üretimin planın RIVER_ZERO_SHARE'inin altında kaldığı ve en az RIVER_MIN_RUN_HOURS saat kesintisiz
 * süren saatler; arıza ya da bakım bildirimiyle çakışan saat sayılmaz (gerçek üretim eksiği). Kayıp = plan − üretim.
 *
 * Gerekçe (veri, 20.10.2026): Nisan–Haziran 2026'da 156–206 akarsu santrali planı varken neredeyse hiç üretmedi (ayda
 * 141–208 GWh; diğer aylarda 11–37 GWh); kaybın %80'i Doğu Karadeniz ve Akdeniz'de, o saatlerde PTF dönem ortalamasından
 * farksız (ekonomik durdurma değil), %43'ü sistem açıktayken (sistem geneli fazla değil, yerel kısıt). Kaynak türüne göre
 * talimat EPİAŞ açık verisinde yok: "olası" kısıntıdır; bildirilmeyen uzun arıza ya da sel / çamur duruşu da bu kurala
 * girebilir. Kısmi kısıntıyı (santralin yarıya düşürülmesi) yakalamaz.
 * SAF: I/O yok.
 */

const HOUR = 3_600_000;
export const RIVER_MIN_PLAN_MW = 1;
export const RIVER_ZERO_SHARE = 0.05;
export const RIVER_MIN_RUN_HOURS = 6;

/**
 * Olası kısıntı saatleri: saat sırası → kayıp (MWh). `outages`: santralin arıza / bakım bildirimleri (duvar saati ms, bitiş
 * hariç); çakışan saat sayılmaz.
 */
export function detectRiverCurtailment(
  series: { start: string; kgup: Array<number | null>; uevm: Array<number | null> },
  outages: Array<{ start: number; end: number }> = []
): Map<number, number> {
  const t0 = Date.parse(series.start);
  const isStop = (i: number) => {
    const k = series.kgup[i];
    const u = series.uevm[i];
    if (k === null || u === null || k < RIVER_MIN_PLAN_MW || u >= RIVER_ZERO_SHARE * k) return false;
    const t = t0 + i * HOUR;
    return !outages.some((o) => o.start <= t && o.end > t);
  };
  const out = new Map<number, number>();
  let runStart = -1;
  const close = (end: number) => {
    if (runStart >= 0 && end - runStart >= RIVER_MIN_RUN_HOURS)
      for (let j = runStart; j < end; j++) out.set(j, Math.max(0, series.kgup[j]! - Math.max(0, series.uevm[j]!)));
    runStart = -1;
  };
  for (let i = 0; i < series.uevm.length; i++) {
    if (isStop(i)) {
      if (runStart < 0) runStart = i;
    } else close(i);
  }
  close(series.uevm.length);
  return out;
}

/** İl → bölge (sistem yönü sekmesinin bölge düzeyi) */
const ZONES: Record<string, string[]> = {
  "Doğu Karadeniz": ["TRABZON", "RİZE", "ARTVİN", "GİRESUN", "ORDU", "GÜMÜŞHANE", "BAYBURT"],
  "Batı ve Orta Karadeniz": ["SAMSUN", "SİNOP", "KASTAMONU", "BARTIN", "ZONGULDAK", "BOLU", "DÜZCE", "TOKAT", "AMASYA", "ÇORUM", "KARABÜK", "SİVAS"],
  "Doğu Anadolu": ["ERZURUM", "ERZİNCAN", "KARS", "AĞRI", "VAN", "MUŞ", "BİTLİS", "BİNGÖL", "TUNCELİ", "ELAZIĞ", "MALATYA", "HAKKARİ", "ARDAHAN", "IĞDIR"],
  "Güneydoğu Anadolu": ["DİYARBAKIR", "SİİRT", "BATMAN", "ŞIRNAK", "MARDİN", "ADIYAMAN", "ŞANLIURFA", "GAZİANTEP", "KİLİS"],
  Akdeniz: ["ADANA", "MERSİN", "ANTALYA", "HATAY", "OSMANİYE", "KAHRAMANMARAŞ", "ISPARTA", "BURDUR"],
  Ege: ["İZMİR", "MANİSA", "AYDIN", "DENİZLİ", "MUĞLA", "UŞAK", "KÜTAHYA", "AFYONKARAHİSAR"],
  Marmara: ["İSTANBUL", "EDİRNE", "KIRKLARELİ", "TEKİRDAĞ", "ÇANAKKALE", "BALIKESİR", "BURSA", "BİLECİK", "KOCAELİ", "SAKARYA", "YALOVA"],
};
export function zoneOfProvince(il: string | null | undefined): string | null {
  if (!il) return null;
  const up = il.toLocaleUpperCase("tr-TR").trim();
  return Object.entries(ZONES).find(([, ils]) => ils.includes(up))?.[0] ?? "İç Anadolu";
}
