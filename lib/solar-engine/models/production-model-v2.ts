/**
 * TR-Energy Analyst - Güneş üretim tahmini, sürüm 2 (PLAN 15.5 öncesi; tasarım yalnız 2024 verisiyle)
 *
 * Sürüm 1'den (production-model.ts, değişmeden kalır) üç fark:
 *   1. Panel düzlemi ışınımı (POA): `d2` GHI / doğrudan / dağınıktan (solar-geometry.ts `planeOfArray`). Kurulum veride
 *      yok: sabit 20° güney, sabit 30° güney ve kuzey–güney eksenli takip denenir; her santral için EĞİTİM verisinde en
 *      küçük hatayı veren seçilir (test verisine bakılmaz).
 *   2. Çarpımsal biçim: üretim ≈ POA × verim; verim sıcaklık, açıklık oranı ve güneş yüksekliğiyle değişir. Ridge
 *      özellikleri POA ile çarpılmış terimlerdir (POA, POA·sıcaklık, POA·açıklık, POA·cos zenit) ve havaya göre
 *      düzeltilmiş kalıcılık (48 saat önceki üretim × POA oranı).
 *   3. Kısıntı süzgeci (yalnız eğitim): PTF ≤ 1 TL; şirketin gündüz ilk KGÜP'ü ≈ 0 (eğitim tepesinin %2'si altı, POA >
 *      200 W/m²: planlı kısıntı); ilk kurulumdan sonra üretimi modelin beklediğinin %60'ının altında kalan saatler
 *      (arıza / talimat) çıkarılır ve model bir kez yeniden kurulur. Devreye alma (`steadyFrom`) sürüm 1'deki gibi.
 * Bilgi zamanı: bütün hava girdileri `d2` (info-time.ts; her saat `assertAvailable`); 1 / 0 gün önceki girdiler yalnız
 * açık `leakUpperBound` bayrağıyla (sızıntı üst sınırı ölçümü). λ sabit.
 *
 * DONMUŞ AYAR (15.10.2026, `scripts/forecast-design-2024.mts`, yalnız 2024 Temmuz–Aralık, 10 santral × 6 ay):
 * ortalama mutlak hata ÷ ortalama üretim — sürüm 1 %22,5, sürüm 2 %21,4, sürüm 2 süzgeçsiz %20,5, sürüm 2 sabit 20°
 * %22,1, ilk KGÜP %17,6. Önceden konan kural (2024'te en iyisi) gereği kısıntı süzgeci (3) KAPALI: `V2_FROZEN`.
 * Süzgeç kodu tasarım karşılaştırması için durur; 2025–2026 sınamasında kullanılmaz.
 */

import { fitRidge, predictRidge, type RidgeModel } from "@/lib/analysis/direction-model";
import { assertAvailable, calendarFeature, productionFeature, weatherFeature, TR_UTC_OFFSET_MS, type FeatureInfo, type WeatherLeadDays, type WeatherSource } from "../../forecast/info-time";
import { clearSkyGhiHour, cosZenith, planeOfArray, type PanelMount } from "../physics/solar-geometry";
import { DEFAULT_PRODUCTION_LAMBDA, steadyFrom, TRAIN_ZERO_PRICE_MAX, type SolarHour, type SolarSite } from "./production-model";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const PANEL_MOUNTS: Array<{ id: string; mount: PanelMount }> = [
  { id: "sabit-20", mount: { kind: "fixed", tiltDeg: 20 } },
  { id: "sabit-30", mount: { kind: "fixed", tiltDeg: 30 } },
  { id: "takip", mount: { kind: "tracker" } },
];

/** Donmuş sürüm 2 ayarı (2024 tasarımı): kısıntı süzgeci kapalı */
export const V2_FROZEN = { curtail: false } as const;

/** Kısıntı süzgecinin eşikleri */
export const CURTAIL_PLAN_SHARE = 0.02;
export const CURTAIL_POA_MIN = 200;
export const CURTAIL_RESIDUAL_SHARE = 0.6;

/** 48 saat önceki saatin hava girdileri (POA oranı için); production-data.ts doldurur */
export interface SolarHourV2 extends SolarHour {
  directLag48: number | null;
  diffuseLag48: number | null;
  /** Hava girdilerinin sürümü (gün önce); yoksa 2. 1 ve 0 kesimden sonradır: model yalnız `leakUpperBound` ile kabul eder */
  weatherLead?: WeatherLeadDays;
  /** Hava girdilerinin modeli (yoksa ECMWF): bilgi zamanı o modelin çalışma kuralıyla denetlenir (Aşama 22.3). Birden çok
   * modelin girdi ortalamasında en geç elde olan model (models/ensemble.ts) */
  weatherSource?: WeatherSource;
  /** Gerçekleşen uydu ışınımı (satellite.ts): YALNIZ ETİKET (kısıntı tespiti); özelliklerde kullanılmaz */
  satGhi?: number | null;
  satDirect?: number | null;
  satDiffuse?: number | null;
  /**
   * Canlı tahmin saati (ileriye dönük tahmin sayfası; lib/solar-engine/forecast.ts): girdiler sayfanın açıldığı andaki en
   * yeni hava tahminidir, geriye dönük testin parçası değildir. Bilgi zamanı denetimi yalnız bu saatlerin TAHMİNİNDE
   * atlanır; eğitimde canlı saat kabul edilmez.
   */
  live?: boolean;
}

function features(h: SolarHourV2, site: SolarSite, mount: PanelMount): { x: number[]; info: FeatureInfo[]; poa: number; clearSky: number } | null {
  if (h.ghi === null || h.direct === null || h.diffuse === null || h.temp === null || h.cloud === null) return null;
  const poa = planeOfArray(site.latitude, site.longitude, h.t, h.ghi, h.direct, h.diffuse, mount);
  const cs = clearSkyGhiHour(site.latitude, site.longitude, h.t);
  const kt = cs > 20 ? Math.min(h.ghi / cs, 1.5) : 0;
  const cz = Math.max(0, cosZenith(site.latitude, site.longitude, h.t - TR_UTC_OFFSET_MS + 30 * 60_000));
  const poaLag =
    h.ghiLag48 !== null && h.directLag48 !== null && h.diffuseLag48 !== null
      ? planeOfArray(site.latitude, site.longitude, h.t - 2 * DAY, h.ghiLag48, h.directLag48, h.diffuseLag48, mount)
      : null;
  const ratio = poaLag !== null && poaLag > 20 ? Math.min(3, Math.max(0, poa / poaLag)) : poa > 20 ? 1 : 0;
  const p = poa / 1000;
  const x = [p, p * h.temp, p * kt, p * cz, (h.lag48 ?? 0) * ratio, h.lag48 === null ? 0 : 1];
  const L = h.weatherLead ?? 2;
  const S = h.weatherSource ?? "ecmwf_ifs025";
  const pre = S === "ecmwf_ifs025" ? "" : `${S}_`;
  const info: FeatureInfo[] = [
    weatherFeature(`${pre}ghi_d${L}`, h.t, "mean", L, S),
    weatherFeature(`${pre}direct_d${L}`, h.t, "mean", L, S),
    weatherFeature(`${pre}diffuse_d${L}`, h.t, "mean", L, S),
    weatherFeature(`${pre}temp_d${L}`, h.t, "instant", L, S),
    weatherFeature(`${pre}cloud_d${L}`, h.t, "instant", L, S),
    calendarFeature("clear_sky_geometry"),
    productionFeature("uevm_lag48", h.t - 2 * DAY),
    weatherFeature(`${pre}radiation_lag48_d${L}`, h.t - 2 * DAY, "mean", L, S),
  ];
  return { x, info, poa, clearSky: cs };
}

export interface SolarModelV2 {
  predict: (h: SolarHourV2) => number | null;
  mount: string;
  trainHours: number;
  trainMaxMwh: number;
  excluded: { missing: number; night: number; zeroPrice: number; plannedCurtail: number; residual: number; commissioning: number; labeled: number };
}

interface Row {
  h: SolarHourV2;
  x: number[];
  poa: number;
}

function fitMount(train: SolarHourV2[], site: SolarSite, mount: PanelMount, lambda: number, curtail: boolean, leak: boolean, exclude?: (h: SolarHourV2) => boolean) {
  const steady = steadyFrom(train);
  const ex = { missing: 0, night: 0, zeroPrice: 0, plannedCurtail: 0, residual: 0, commissioning: 0, labeled: 0 };
  const rows: Row[] = [];
  let peak = 0;
  for (const h of train) if (h.uevm !== null) peak = Math.max(peak, h.uevm);
  for (const h of train) {
    if (h.live) throw new Error("Canlı tahmin saati eğitime giremez");
    const f = features(h, site, mount);
    if (!f || h.uevm === null) {
      ex.missing++;
      continue;
    }
    if (!leak) assertAvailable(f.info, h.t);
    if (f.clearSky < 1 && f.poa < 1) {
      ex.night++;
      continue;
    }
    if (h.ptf !== null && h.ptf <= TRAIN_ZERO_PRICE_MAX) {
      ex.zeroPrice++;
      continue;
    }
    if (curtail && h.kgupFirst !== null && f.poa > CURTAIL_POA_MIN && h.kgupFirst < CURTAIL_PLAN_SHARE * peak) {
      ex.plannedCurtail++;
      continue;
    }
    if (steady !== null && h.t < steady) {
      ex.commissioning++;
      continue;
    }
    if (exclude?.(h)) {
      ex.labeled++;
      continue;
    }
    rows.push({ h, x: f.x, poa: f.poa });
  }
  if (rows.length < 100) return null;
  const first = fitRidge(
    rows.map((r) => r.x),
    rows.map((r) => r.h.uevm!),
    lambda
  );
  const kept = rows.filter((r) => {
    const p = predictRidge(first, r.x);
    const drop = curtail && p > 0.1 * peak && r.h.uevm! < CURTAIL_RESIDUAL_SHARE * p;
    if (drop) ex.residual++;
    return !drop;
  });
  if (kept.length < 100) return null;
  const ridge = fitRidge(
    kept.map((r) => r.x),
    kept.map((r) => r.h.uevm!),
    lambda
  );
  const trainMax = Math.max(...kept.map((r) => r.h.uevm!));
  const mae = kept.reduce((a, r) => a + Math.abs(Math.min(trainMax, Math.max(0, predictRidge(ridge, r.x))) - r.h.uevm!), 0) / kept.length;
  return { ridge, trainMax, mae, ex, n: kept.length };
}

/**
 * Varsayılan donmuş ayardır (`V2_FROZEN`); `curtail: true` ve `mounts` yalnız tasarım karşılaştırması içindir.
 * `exclude`: eğitimden çıkarılacak saatler (ör. uydu etiketli kayıp saatler; sürüm 3 = sürüm 2 + bu temizlik).
 * `leakUpperBound: true`: bilgi zamanı denetimi atlanır (1 / 0 gün önceki hava; yalnız sızıntı üst sınırı ölçümü, ana
 * sonuçta kullanılmaz). Bayrak yokken kesim sonrası girdi `LeakageError` verir.
 * `noLag: true` (kalıcılıksız; ileriye dönük tahmin sayfası, 16.10.2026): 48 saat önceki üretim girdisi hem eğitimde hem
 * tahminde yok sayılır. Şirket kendi üretimini ertesi gün bilir (info-time.ts), ama kamu verisi (EPİAŞ UEVM) aylık
 * uzlaştırmadan sonra yayımlandığı için canlı tahminde bu girdi yoktur. Geçmiş başarısı geriye dönük testte ayrıca ölçülür.
 */
export function fitSolarModelV2(
  train: SolarHourV2[],
  site: SolarSite,
  opts: { lambda?: number; curtail?: boolean; mounts?: string[]; leakUpperBound?: boolean; exclude?: (h: SolarHourV2) => boolean; noLag?: boolean } = {}
): SolarModelV2 {
  const lambda = opts.lambda ?? DEFAULT_PRODUCTION_LAMBDA;
  const leak = opts.leakUpperBound === true;
  const noLag = opts.noLag === true;
  const strip = (h: SolarHourV2): SolarHourV2 => (noLag ? { ...h, lag48: null } : h);
  if (noLag) train = train.map(strip); // exclude (uydu etiketi) saatin zamanıyla çalışır: kopyalar sorun değil
  let best: { id: string; mount: PanelMount; fit: NonNullable<ReturnType<typeof fitMount>> } | null = null;
  for (const m of PANEL_MOUNTS.filter((x) => !opts.mounts || opts.mounts.includes(x.id))) {
    const fit = fitMount(train, site, m.mount, lambda, opts.curtail ?? V2_FROZEN.curtail, leak, opts.exclude);
    if (fit && (!best || fit.mae < best.fit.mae)) best = { id: m.id, mount: m.mount, fit };
  }
  if (!best) throw new Error("Eğitim için yeterli saat yok");
  const { ridge, trainMax } = best.fit;
  const mount = best.mount;
  return {
    predict: (h0) => {
      const h = strip(h0);
      const f = features(h, site, mount);
      if (!f) return null;
      if (!leak && !h.live) assertAvailable(f.info, h.t);
      if (f.clearSky < 1 && f.poa < 1) return 0;
      return Math.min(trainMax, Math.max(0, predictRidge(ridge as RidgeModel, f.x)));
    },
    mount: best.id,
    trainHours: best.fit.n,
    trainMaxMwh: trainMax,
    excluded: best.fit.ex,
  };
}
