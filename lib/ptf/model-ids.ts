/**
 * TR-Energy Analyst - PTF motoru: sürüm kimlikleri (bağımlılıksız; istemci bileşenleri de okur)
 *
 * Karar kuralı lib/ptf/champion.ts'te; kimlikler değiştirilmez ve silinmez (günlük kayıtlar bunlara göre okunur).
 */

/** Temel (ana) sürüm; şampiyon defteri boşken canlı sürüm budur */
export const PTF_BASE_MODEL = "ptf-ens-v1";
/** Gölge sürüm: rüzgârda EPİAŞ ve kendi tahminin ortalaması */
export const PTF_SHADOW_AVG_WIND = "ptf-ens-v1-ruzgar-ortalama";
/** Gölge sürüm: hidro özellikleri (hipotez sınama dönemine bakılarak kuruldu; canlı kapı bunu sınırlar) */
export const PTF_SHADOW_HYDRO = "ptf-ens-v1-hidro";
