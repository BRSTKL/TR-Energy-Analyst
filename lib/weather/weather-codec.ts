/**
 * TR-Energy Analyst - Hava verisi havuzu: santral-yıl belgesinin biçimi (PLAN 15.2)
 *
 * Kaynak Open-Meteo Previous Runs API (ECMWF IFS 0,25°; çoğu modelde arşiv 2024-03-06'dan). Her değişken üç sürümde
 * saklanır: geçerlilik saatinden N gün önce yapılmış tahmin (`d1`, `d2`) ve en yeni tahmin (`d0`, analize yakın; yalnız
 * sızıntı tavanı kıyası için). Teyit (15.10.2026, tek çalışma API'siyle birebir karşılaştırma): UTC geçerlilik saati H
 * için `previous_dayN` değeri N gün önceki, H+1'i 6 saate aşağı yuvarlayan çalışmadan gelir (ilerleme süresi
 * N × 24 − 1 … N × 24 + 4 saat; lib/forecast/info-time.ts). Bilgi anı (GÖP D-1 12:30 TR = 09:30 UTC): `d2`'nin en geç çalışması D-2 18Z
 * (≈ D-1 02:00 UTC yayımlanır) → temiz, ana sonuç. `d1` çoğu saatte D-1 06Z / 12Z / 18Z çalışmasından → sızıntılı,
 * yalnız iyimser üst sınır. Kural sizinti-denetcisi ve PLAN 15.0 / 15.2'de.
 *
 * HİZALAMA: dizinin i. elemanı üretim saati i'dir (EPİAŞ: [i, i+1) aralığı; duvar saati UTC alanında, havuzla aynı).
 * Open-Meteo ışınımı damgadan ÖNCEKİ saatin ortalamasıdır (damga i+1 = [i, i+1) ortalaması; gün doğumunda teyit):
 * ışınım değişkenleri bir saat kaydırılarak yazılır. Anlık değişkenler (sıcaklık, bulut, rüzgâr) saat başı (damga i).
 * SAF: I/O yok (dosya işleri weather-store.ts).
 */

export const WEATHER_MODEL = "ecmwf_ifs025";

/** Open-Meteo değişkeni → saatin ortalaması mı (ışınım) yoksa anlık mı */
export const WEATHER_VARIABLES = {
  shortwave_radiation: "mean",
  direct_radiation: "mean",
  diffuse_radiation: "mean",
  direct_normal_irradiance: "mean",
  temperature_2m: "instant",
  cloud_cover: "instant",
  wind_speed_10m: "instant",
} as const;

export type WeatherVariable = keyof typeof WEATHER_VARIABLES;
export const WEATHER_VARIABLE_LIST = Object.keys(WEATHER_VARIABLES) as WeatherVariable[];

/** d0: en yeni tahmin (sızıntı tavanı), d1: 1 gün önceki (sızıntılı, üst sınır), d2: 2 gün önceki (ana sonuç) */
export type WeatherLead = "d0" | "d1" | "d2";
export const WEATHER_LEADS: readonly WeatherLead[] = ["d0", "d1", "d2"];
const LEAD_SUFFIX: Record<WeatherLead, string> = { d0: "", d1: "_previous_day1", d2: "_previous_day2" };

/** Open-Meteo'ya istenen değişken adları (21 tane) */
export const apiVariableNames = (): string[] => WEATHER_LEADS.flatMap((l) => WEATHER_VARIABLE_LIST.map((v) => v + LEAD_SUFFIX[l]));

export interface WeatherYear {
  epiasPlantId: number;
  year: number;
  /** İlk saat (duvar saati UTC alanında, ISO): yılın 1 Ocak 00:00'ı */
  start: string;
  model: string;
  /** İstenen konum ve modelin kullandığı ızgara noktası */
  latitude: number;
  longitude: number;
  gridLatitude: number | null;
  gridLongitude: number | null;
  /** Sürüm → değişken → saat dizisi (verisi olmayan saat null) */
  series: Record<WeatherLead, Record<WeatherVariable, Array<number | null>>>;
  /** Ay ("01".."12") → çekilme anı (ISO) */
  fetched: Record<string, string>;
}

/** Open-Meteo yanıtının kullandığımız kısmı (timezone=Europe/Istanbul; zaman "YYYY-MM-DDTHH:mm") */
export interface OpenMeteoHourly {
  latitude: number;
  longitude: number;
  hourly: Record<string, Array<number | null> | string[]> & { time: string[] };
}

const HOUR = 3_600_000;

export function hoursInYear(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / HOUR;
}

export function emptyWeatherYear(epiasPlantId: number, year: number, latitude: number, longitude: number): WeatherYear {
  const n = hoursInYear(year);
  const lead = () => Object.fromEntries(WEATHER_VARIABLE_LIST.map((v) => [v, Array(n).fill(null)])) as WeatherYear["series"]["d0"];
  return {
    epiasPlantId,
    year,
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    model: WEATHER_MODEL,
    latitude,
    longitude,
    gridLatitude: null,
    gridLongitude: null,
    series: { d0: lead(), d1: lead(), d2: lead() },
    fetched: {},
  };
}

/** Duvar saati damgası ("2026-06-21T07:00") → ms (UTC alanında) */
const wallMs = (t: string) => Date.parse(`${t}:00Z`);

/**
 * Yanıtı belgeye yazar (yalnız belgenin yılına düşen saatler; null değerler mevcut değeri silmez). Işınım damgası
 * bir saat geri alınarak üretim saatine yazılır. `months`: çekilmiş sayılacak aylar.
 */
export function mergeWeather(doc: WeatherYear, res: OpenMeteoHourly, months: string[], fetchedAt: string): WeatherYear {
  const start = Date.parse(doc.start);
  const n = hoursInYear(doc.year);
  doc.gridLatitude = res.latitude;
  doc.gridLongitude = res.longitude;
  const time = res.hourly.time;
  for (const lead of WEATHER_LEADS)
    for (const v of WEATHER_VARIABLE_LIST) {
      const values = res.hourly[v + LEAD_SUFFIX[lead]] as Array<number | null> | undefined;
      if (!values) continue;
      const shift = WEATHER_VARIABLES[v] === "mean" ? 1 : 0;
      const target = doc.series[lead][v];
      for (let k = 0; k < time.length; k++) {
        const value = values[k];
        if (value === null || value === undefined) continue;
        const i = (wallMs(time[k]) - start) / HOUR - shift;
        if (i >= 0 && i < n) target[i] = value;
      }
    }
  for (const m of months) doc.fetched[m] = fetchedAt;
  return doc;
}

/** Üretim saati (duvar saati) için değer; yoksa null */
export function weatherAt(doc: WeatherYear, lead: WeatherLead, v: WeatherVariable, t: Date | number): number | null {
  const i = Math.round(((typeof t === "number" ? t : t.getTime()) - Date.parse(doc.start)) / HOUR);
  return doc.series[lead][v][i] ?? null;
}

/** Bir sürümün bir değişkeninde dolu saat sayısı */
export const filledHours = (doc: WeatherYear, lead: WeatherLead, v: WeatherVariable): number =>
  doc.series[lead][v].reduce((a: number, x) => a + (x === null ? 0 : 1), 0);
