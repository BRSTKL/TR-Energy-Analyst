/**
 * TR-Energy Analyst - Fiziksel güneş modeli (Aşama 22.2; DENENDİ, CANLIYA ALINMADI)
 *
 * Geriye dönük test 19.10.2026 (scripts/solar-candidates-backtest.mts; 55 konumlu güneş santrali, Ocak 2025 – Eylül 2026,
 * her ay önceki 4 ayla eğitim, kayıp saatler hariç, dengesizlik maliyeti TL/MWh): temel (sürüm 3) 107,0; saf fiziksel
 * 136,2 (temeli 10 / 55 santralde yener); karma 119,1 (9 / 55); ilk KGÜP 84,8. İkisi de temelden kötü: hava modelinin
 * saatlik ışınım hatası panel geometrisinin inceliğinden büyük. Kod referans ve sonraki adımlar (22.4 düzeltme katmanının
 * girdileri, AC tavanı) için duruyor; motor registry.ts'te kullanmıyor. Sızıntı denetimi: kayıtlı tavan bugünkü kurulu güç
 * (sonradan genişleme içerebilir) ve "kayıp hariç" süzgeci uyduyla sonradan kurulur; ikisi de adayları yalnız iyimser yöne
 * kaydırır, sonucun yönü değişmez.
 *
 * Üretim = min(ölçek × DC oranı, AC tavanı). DC oranı fiziksel zincirden (physics/pv-chain.ts: Perez panel düzlemi
 * ışınımı, NOCT hücre sıcaklığı, sıcaklık katsayısı). Santrale özgü iki büyüklük üretimden öğrenilir:
 *   - ölçek (MW / birim DC oranı): kırpılmayan saatlerde (üretim < KIRPMA_PAYI × tavan) orijinden geçen en küçük kareler;
 *     kurulu DC gücü, inverter ve kablo verimi, kirlenme ortalamasını taşır;
 *   - kurulum: sabit 10° / 20° / 30° güney ya da kuzey–güney eksenli takip; eğitimde en küçük mutlak hatayı veren.
 * AC tavanı: kayıtlı kurulu güç (YEKDEM, EPDK lisansı ya da elle; tahmin değil) ile eğitimdeki en yüksek üretimin büyüğü
 * (bazı santraller lisans MWe'yi aşıyor: Aşama 21 kurulu güç kontrolü). Kayıt yoksa eğitimdeki en yüksek üretim.
 * Eğitim saatleri sürüm 3 ile aynı süzgeçten geçer: hava eksik, gece, sıfır fiyat, devreye alma, uyduyla kayıp saatler.
 * Sürüm 3'ten (ridge, 6 özellik) farkı: az parametre (ölçek + kurulum), fiziksel biçim (sıcaklık ve kırpılma açık),
 * Perez dağınık modeli. Bilgi zamanı: hava girdileri `d2` (eğitim) ya da canlı (tahmin), her saat denetlenir.
 *
 * KARMA (`hybrid: true`, aday "solar-phys-hybrid"): saf fizik hava modelinin ışınım tahminine birebir güvenir; ECMWF'nin
 * bulutlu havadaki sistematik hatasını düzeltmez (geriye dönük test 19.10.2026: saf fiziksel çoğu santralde temelden
 * kötü). Karma sürümde ölçek yerine küçük bir ridge: DC oranı ve onun açıklık oranı, güneş yüksekliği, bulut ve
 * sıcaklıkla çarpımları (fizik biçimi korur, öğrenme hava hatasını düzeltir); tavan aynı.
 * SAF: I/O yok.
 */

import { assertAvailable, weatherFeature, type FeatureInfo } from "../../forecast/info-time";
import { fitRidge, predictRidge, type RidgeModel } from "@/lib/analysis/direction-model";
import { TR_UTC_OFFSET_MS } from "../../forecast/info-time";
import { clearSkyGhiHour, cosZenith, type PanelMount } from "../physics/solar-geometry";
import { dcFraction, poaPerez } from "../physics/pv-chain";
import { DEFAULT_PRODUCTION_LAMBDA, steadyFrom, TRAIN_ZERO_PRICE_MAX, type SolarSite } from "./production-model";
import type { SolarHourV2 } from "./production-model-v2";

export const PHYSICAL_MOUNTS: Array<{ id: string; mount: PanelMount }> = [
  { id: "sabit-10", mount: { kind: "fixed", tiltDeg: 10 } },
  { id: "sabit-20", mount: { kind: "fixed", tiltDeg: 20 } },
  { id: "sabit-30", mount: { kind: "fixed", tiltDeg: 30 } },
  { id: "takip", mount: { kind: "tracker" } },
];
/** Bu oranın üstündeki üretim kırpılmış olabilir: ölçek bu saatlerle öğrenilmez */
export const CLIP_MARGIN = 0.9;
const MIN_ROWS = 100;

export interface PhysicalModel {
  predict: (h: SolarHourV2) => number | null;
  mount: string;
  trainHours: number;
  trainMaxMwh: number;
  /** MW / birim DC oranı */
  scale: number;
  /** Kullanılan AC tavanı (MW) ve kaynağı */
  acCapMw: number;
  acCapSource: "kayıt" | "eğitim en yüksek";
}

function info(h: SolarHourV2): FeatureInfo[] {
  const L = h.weatherLead ?? 2;
  return [weatherFeature(`ghi_d${L}`, h.t, "mean", L), weatherFeature(`direct_d${L}`, h.t, "mean", L), weatherFeature(`diffuse_d${L}`, h.t, "mean", L), weatherFeature(`temp_d${L}`, h.t, "instant", L), weatherFeature(`cloud_d${L}`, h.t, "instant", L)];
}

/** DC oranı; hava eksikse null, gece 0 */
function dcOf(h: SolarHourV2, site: SolarSite, mount: PanelMount): number | null {
  if (h.ghi === null || h.direct === null || h.diffuse === null || h.temp === null || h.cloud === null) return null;
  if (clearSkyGhiHour(site.latitude, site.longitude, h.t) < 1 && h.ghi < 1) return 0;
  const poa = poaPerez(site.latitude, site.longitude, h.t, h.ghi, h.direct, h.diffuse, mount);
  return Math.max(0, dcFraction(poa, h.temp));
}

/** Karma sürümün özellikleri: DC oranı ve hava hatasını taşıyan çarpımları */
function hybridX(h: SolarHourV2, site: SolarSite, dc: number): number[] {
  const cs = clearSkyGhiHour(site.latitude, site.longitude, h.t);
  const kt = cs > 20 && h.ghi !== null ? Math.min(h.ghi / cs, 1.5) : 0;
  const cz = Math.max(0, cosZenith(site.latitude, site.longitude, h.t - TR_UTC_OFFSET_MS + 30 * 60_000));
  return [dc, dc * kt, dc * cz, (dc * h.cloud!) / 100, (dc * (h.temp! - 25)) / 10];
}

export function fitPhysicalModel(
  train: SolarHourV2[],
  site: SolarSite,
  opts: { exclude?: (h: SolarHourV2) => boolean; recordedCapacityMw?: number | null; hybrid?: boolean } = {}
): PhysicalModel {
  const steady = steadyFrom(train);
  const usable = train.filter((h) => {
    if (h.live) throw new Error("Canlı tahmin saati eğitime giremez");
    if (h.uevm === null) return false;
    if (h.ptf !== null && h.ptf <= TRAIN_ZERO_PRICE_MAX) return false;
    if (steady !== null && h.t < steady) return false;
    if (opts.exclude?.(h)) return false;
    return true;
  });
  for (const h of usable) assertAvailable(info(h), h.t);
  const trainMax = Math.max(0, ...usable.map((h) => h.uevm!));
  const rec = opts.recordedCapacityMw && opts.recordedCapacityMw > 0 ? opts.recordedCapacityMw : null;
  const cap = rec !== null ? Math.max(rec, trainMax) : trainMax;
  let best: { id: string; mount: PanelMount; scale: number; ridge: RidgeModel | null; mae: number; n: number } | null = null;
  for (const m of PHYSICAL_MOUNTS) {
    const rows = usable.map((h) => ({ h, y: h.uevm!, x: dcOf(h, site, m.mount) })).filter((r): r is { h: SolarHourV2; y: number; x: number } => r.x !== null && r.x > 0.01);
    if (rows.length < MIN_ROWS || cap <= 0) continue;
    // Kırpılmayan saatlerle öğrenilir (tavana dayanan saat ilişkiyi aşağı çekmesin)
    const free = rows.filter((r) => r.y < CLIP_MARGIN * cap);
    let scale = 0;
    let ridge: RidgeModel | null = null;
    let f: (r: { h: SolarHourV2; x: number }) => number;
    if (opts.hybrid) {
      if (free.length < MIN_ROWS) continue;
      ridge = fitRidge(free.map((r) => hybridX(r.h, site, r.x)), free.map((r) => r.y), DEFAULT_PRODUCTION_LAMBDA);
      const rg = ridge;
      f = (r) => predictRidge(rg, hybridX(r.h, site, r.x));
    } else {
      // Orijinden geçen en küçük kareler
      const sxy = free.reduce((s, r) => s + r.x * r.y, 0);
      const sxx = free.reduce((s, r) => s + r.x * r.x, 0);
      if (sxx <= 0) continue;
      scale = sxy / sxx;
      f = (r) => scale * r.x;
    }
    const mae = rows.reduce((s, r) => s + Math.abs(Math.min(cap, Math.max(0, f(r))) - r.y), 0) / rows.length;
    if (!best || mae < best.mae) best = { id: m.id, mount: m.mount, scale, ridge, mae, n: rows.length };
  }
  if (!best) throw new Error("Eğitim için yeterli saat yok");
  const { mount, scale, ridge } = best;
  return {
    predict: (h) => {
      if (!h.live) assertAvailable(info(h), h.t);
      const x = dcOf(h, site, mount);
      if (x === null) return null;
      if (x <= 0) return 0;
      const v = ridge ? predictRidge(ridge, hybridX(h, site, x)) : scale * x;
      return Math.min(cap, Math.max(0, v));
    },
    mount: best.id,
    trainHours: best.n,
    trainMaxMwh: trainMax,
    scale,
    acCapMw: cap,
    acCapSource: rec !== null ? "kayıt" : "eğitim en yüksek",
  };
}
