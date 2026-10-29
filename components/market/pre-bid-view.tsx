"use client";

import React from "react";
import { BarChart, ComposedChart, ReferenceLine } from "recharts";
import {
  ChartArea as Area,
  ChartBar as Bar,
  ChartGrid as CartesianGrid,
  ChartLegend as Legend,
  ChartLine as Line,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
  CHART_COLOR,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartCard } from "@/components/market/chart-card";
import { Kpi, hh } from "@/components/market/daily-dashboard";
import { DAY_CLASS_LABEL } from "@/lib/analysis/daily-market";
import { LEVEL_LABEL, type PriceLimit } from "@/lib/analysis/price-limit";
import type { PreBidView } from "@/lib/analysis/pre-bid";
import { nf } from "@/lib/format";

const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}%${nf(Math.abs(v))}`;
const axis = {
  x: { dataKey: "hour", interval: 2 as const, tickFormatter: (h: number) => hh(h) },
};

/** Neleri bilsek daha iyi ölçerdik: etki ölçümde görülene dayanır; kaynak ve durum yanında */
const MISSING: Array<{
  data: string;
  why: string;
  where: string;
  status: "bulundu" | "yok" | "kısmen" | "bayat" | "birikiyor";
}> = [
  {
    data: "Yarının sistem güneş tahmini (lisanssız dahil)",
    why: "Güneşi günü gününe bilmek net yüke katkıyı büyütüyor: tüm örnekte (2025–2026) gerçek KGÜP güneşiyle fiyat hatası %12,6 azaldı, güneş vekiliyle %4 civarı. Yazın fark yok, ara mevsimde ve bulutlu günlerde büyük. Şimdi önceki 7 günün ortancası kullanılıyor. EPİAŞ'ın yarın için sistem güneş tahmini YOK (rüzgâr tahmini var; 'Üretim Tahmini' servisi 2016'da kalan YEKDEM bildirimi, veri dönmüyor).",
    where:
      "Kendi sistem güneş modelimizi kurmak: eğitim verisi artık var (aşağıdaki lisanssız üretim) ve hava tahmini bizde; ya da yarının KGÜP'ü (EPİAŞ 15:13–17:48 arasında yayımlıyor, 12:30'dan sonra).",
    status: "yok",
  },
  {
    data: "Lisanssız üretim (gerçekleşen, kaynak bazında saatlik)",
    why: "EPİAŞ, YEKDEM kapsamındaki lisanssız santrallerin uzlaştırmaya esas saatlik veriş miktarını kaynağa göre yayımlıyor (güneş öğlen yaklaşık 9–11 GW; rüzgâr, biyokütle, kanal tipi hidro). Yaklaşık 4 hafta gecikmeli (30 Eylül'e kadar vardı), 2025'ten beri. Sistem güneş modelini eğitmek ve KGÜP güneş planını doğrulamak için gerçek değer. Henüz hesaplara bağlanmadı.",
    where: "EPİAŞ electricity-service: renewables/data/unlicensed-generation-amount.",
    status: "bulundu",
  },
  {
    data: "Doğal gaz referans fiyatı (GRF)",
    why: "EPİAŞ doğal gaz piyasasının günlük referans fiyatı (TL, USD, EUR, USD/MMBtu; 2024-11'den beri) bulundu ve aşağıda gösteriliyor. Fiyat modeline eklenince katkı vermedi: Haziran–Ekim 2026'da %15,9 → %14,4, 2025–2026 uzun örnekte %8,3 → %7,4. Seviye kaymasını referans ve dünkü artık zaten yakalıyor.",
    where: "EPİAŞ natural-gas-service: markets/sgp/data/daily-reference-price.",
    status: "bulundu",
  },
  {
    data: "Arz–talep eğrisi (teklif düzeyi)",
    why: "EPİAŞ saatlik arz–talep eğrisini yayımlıyor (2024'ten beri, yarının eğrisi de yayımlanınca); bulundu ve aşağıda gösteriliyor. Doğrudan net yük kaymasına uygulanınca kötü sonuç verdi (hata 527 → 992 TL/MWh, eğri dengeye yakın çok dik); regresyona üçüncü özellik olarak yalnız ~1 puan kazandırdı (%14,7 → %15,7, 56 gün, 8 saat).",
    where:
      "EPİAŞ electricity-service: markets/dam/data/supply-demand (date: saat bazlı; saat başına bir istek).",
    status: "bulundu",
  },
  {
    data: "GÖP toplam alış ve satış teklif miktarları",
    why: "Saatlik toplam teklif miktarlarından satış/alış oranı (sıkılık göstergesi) aşağıda gösteriliyor. Modele eklenmedi, katkısı ölçülmedi.",
    where:
      "EPİAŞ electricity-service: markets/dam/data/submitted-bid-order-volume ve submitted-sales-order-volume.",
    status: "bulundu",
  },
  {
    data: "Gün içi piyasa işlem geçmişi (her işlem)",
    why: "Kontrat bazında fiyat ve miktar (günde yaklaşık 24 bin işlem); saatlik hacim ve ağırlıklı fiyat aşağıda gösteriliyor, GİP düzeltme maliyetini PTF ile kıyaslamak için. Modele eklenmedi.",
    where: "EPİAŞ electricity-service: markets/idm/data/transaction-history.",
    status: "bulundu",
  },
  {
    data: "Baraj doluluğu ve hidro planı",
    why: "Barajlı hidro akşam rampasını karşılıyor; su değeri akşam fiyatını belirliyor. DSİ'nin yağış ve baraj doluluk sitesinin herkese açık JSON API'si bulundu: amaca göre (enerji, sulama, içme suyu) ülke ortalaması doluluk ve aktif hacim, 15.05.2024'ten beri günlük (yalnız iş günleri, mayıs–ekim; kış ayları API'de boş), ayrıca dört büyük ilin içme suyu doluluğu. Sunucu her saat kontrol edip havuza yazıyor (`dsi-dam-sync.mts`). Fiyat modeline eklenince şanstan ayırt edilemedi (yukarıdaki ölçüm). Sınır: baraj bazında veri yok (yalnız ülke ortalaması), saat bazında su değeri yok; EPİAŞ'ın 'suyun enerji karşılığı' servisi baraj bazında MWh veriyor ama geçmişi yok (ayrı kayıt işi planda).",
    where:
      "DSİ yagisbarajdolulukapi.dsi.gov.tr (yalnız Türkiye IP'sinden, kimlik gerekmez); havuz data/pool/dsi. Baraj bazında: EPİAŞ dams/data/water-energy-provision.",
    status: "bulundu",
  },
  {
    data: "Arıza ve bakım bildirimleri",
    why: "Kullanılabilir kapasiteyi değiştirir; sıkışıklığı gösterir. Güncellendi: havuz 27 Ekim'e getirildi ve sunucudaki günlük eşitlemeye eklendi (içinde bulunulan ay 6 saatte bir). Yukarıda canlı çekilen süren arızalar gösteriliyor. Sınır: EPİAŞ yalnız başlamış bildirimleri veriyor, ileri tarihli planlı bakım bu servisten gelmiyor; yani 'yarın başlayacak bakım' bilinemez, yalnız bugün süren ve yarına sarkan arızalar bilinir. Fiyata etkisi ölçülmedi.",
    where:
      "EPİAŞ piyasa mesaj sistemi (markets/data/market-message-system); havuz data/pool/umm.",
    status: "bulundu",
  },
  {
    data: "EPİAŞ tahminlerinin saat saat sürümleri (12:25'te neyin yayımlanmış olduğu)",
    why: "Geriye dönük ölçüm EPİAŞ'ın son tahminiyle yapıldı; 12:25'teki sürüm daha kötü olabilir. Ölçüm şimdilik iyimser olabilir.",
    where:
      "Anlık görüntü işi 28 Ekim'den beri biriktiriyor; yaklaşık 2 hafta sonra yayım saati, 8–12 hafta sonra revizyon ve model testi.",
    status: "birikiyor",
  },
  {
    data: "İthal kömür fiyatı (API2) ve TTF",
    why: "Termik marjinal maliyetin ikinci ayağı; gaz dışı termik santrallerin maliyeti. Şimdi yok.",
    where: "Ücretsiz bir kaynak bulamadık (ticari veri sağlayıcıları).",
    status: "yok",
  },
  {
    data: "Sınır hatları: kapasite, nomine ikili anlaşma, hat arızaları",
    why: "Enterkonneksiyon toplam ve kullanıma açık kapasitesi (Bulgaristan, Yunanistan; saatlik, 2025-06'dan beri), nomine kapasite (ithalat / ihracat ikili anlaşmaları, saatlik) ve hat arıza bildirimleri bulundu, EPİAŞ'ta. Kullanıma açık kapasite sıfır görünüyor (Bulgaristan, Eylül 2026): ihracat / ithalat zaten dolu olabilir; anlamını doğrulamadan analize bağlamadık.",
    where:
      "EPİAŞ electricity-service: transmission/data/line-capacities (yön: TRBG, BGTR, TRGR, GRTR), nominal-capacity, international-line-events.",
    status: "bulundu",
  },
  {
    data: "Komşu ülke fiyatları ve sınır akışları",
    why: "İthalat/ihracatın fiyat tarafı. ENTSO-E'den Bulgaristan ve Yunanistan gün öncesi fiyatı (EUR/MWh) ile Türkiye–Bulgaristan ve Türkiye–Yunanistan fiziksel akışı (MW, iki yön) alınıyor ve yukarıda PTF ile karşılaştırılıyor. Türkiye'nin kendi fiyatı ENTSO-E'de yok (zaten EPİAŞ PTF'si var). Sunucu her saat kontrol edip havuza yazıyor (`entsoe-sync.mts`). Zamanlama sınırı: bir günün komşu fiyatı o günden önceki gün öğleden sonra yayımlanır, yani Türkiye 12:30 kapanışından sonra; teklif saatinde yalnız bir önceki günün fiyatı ve akışı bilinir. Fiyat modeline etkisi yukarıdaki ölçümde (fark ve akış değişkenleri). Komşu fiyat öteki komşular (Gürcistan, Suriye, Irak, İran) için yok.",
    where:
      "ENTSO-E Transparency Platform REST API (ENTSOE_TOKEN, sunucu .env); kur ECB; havuz data/pool/entsoe.",
    status: "bulundu",
  },
  {
    data: "Kendi sözleşme ve açık pozisyonunuz",
    why: "Fiyat beklentisinin sizin için anlamı pozisyonunuza bağlı. Veri yok, yalnız piyasa tarafı.",
    where: "Kendi sisteminiz.",
    status: "yok",
  },
];
const STATUS_TONE: Record<(typeof MISSING)[number]["status"], string> = {
  bulundu: "bg-emerald-100 text-emerald-800",
  yok: "bg-slate-100 text-slate-700",
  kısmen: "bg-amber-100 text-amber-800",
  bayat: "bg-orange-100 text-orange-800",
  birikiyor: "bg-sky-100 text-sky-800",
};

/** Veri durumu: bulunanlar ve hâlâ eksik olanlar */
export function PreBidStatusCard() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Veri durumu: bulunanlar ve hâlâ eksik olanlar
        </CardTitle>
        <p className="text-xs text-slate-500">
          Yeşil: EPİAŞ&apos;ta bulundu ve yukarıda analizlere bağlandı. Diğerleri hâlâ
          eksik; sıra önemine göre, etki yalnız ölçümde görülenlere dayanır, diğerleri
          beklenti (ölçülmedi).
        </p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm">
          {MISSING.map((m, i) => (
            <li key={m.data} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">
                  {i + 1}. {m.data}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[m.status]}`}
                >
                  {m.status === "bulundu"
                    ? "bulundu"
                    : m.status === "yok"
                      ? "elimizde yok"
                      : m.status === "kısmen"
                        ? "kısmen var"
                        : m.status === "bayat"
                          ? "var, güncel değil"
                          : "birikiyor"}
                </span>
              </div>
              <p className="mt-1 text-slate-600">{m.why}</p>
              <p className="mt-1 text-xs text-slate-500">Nereden: {m.where}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function PreBidBody({
  view,
  limit,
}: {
  view: Extract<PreBidView, { ok: true }>;
  limit: PriceLimit | null;
}) {
  const s = view.summary;
  const bt = view.backtest;
  const withBand = view.rows.some((r) => r.lo !== null);
  const data = view.rows.map((r) => ({
    ...r,
    band: r.lo !== null && r.hi !== null ? [r.lo, r.hi] : null,
  }));
  return (
    <>
      {view.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {view.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Ortalama beklenti"
          value={`${nf(s.meanExpected!)} TL/MWh`}
          sub={
            s.vsBaselinePct !== null
              ? `Referans ${nf(s.meanBaseline!)} (${DAY_CLASS_LABEL[view.dayClass]} ortancası); ${signedPct(s.vsBaselinePct)}`
              : undefined
          }
        />
        <Kpi
          label="En pahalı beklenen saat"
          value={s.peak ? hh(s.peak.hour) : "–"}
          sub={
            s.peak
              ? `${nf(s.peak.value)} TL/MWh; pik saati güvenilir değil (ölçümde %60–65)`
              : undefined
          }
        />
        <Kpi
          label="Akşam – öğle farkı (beklenti)"
          value={s.eveningMinusNoon === null ? "–" : `${nf(s.eveningMinusNoon)} TL/MWh`}
          sub="PTF(18–21) − PTF(11–14)"
        />
        <Kpi
          label="Limite dayanan saat"
          value={
            limit ? `${s.hiAtCapHours} (üst uç) / ${s.nearCapHours} (beklenti)` : "–"
          }
          sub={limit ? `Limit ${nf(limit.cap)} TL/MWh` : "Limit çıkarılamadı"}
          tone={s.hiAtCapHours > 0 ? "warn" : undefined}
        />
        <Kpi
          label={`Son ${bt?.days ?? 0} gün başarısı`}
          value={bt ? `%${nf(bt.improvementPct)} daha iyi` : "–"}
          sub={
            bt
              ? `Hata ${nf(bt.modelMae)} / referans ${nf(bt.baselineMae)} TL/MWh; günlerin %${nf(bt.betterDaysPct)}'inde iyi`
              : "Geriye dönük ölçüm yok"
          }
        />
        {s.actualCheck ? (
          <Kpi
            label="Gerçekleşen ile (deneme günü)"
            value={`Hata ${nf(s.actualCheck.mae)} TL/MWh`}
            sub={`Referans ${nf(s.actualCheck.baselineMae)}; ${s.actualCheck.inInterval}/${s.actualCheck.hours} saat ± aralıkta`}
          />
        ) : (
          <Kpi
            label="± aralık"
            value={withBand ? "%10–%90" : "–"}
            sub={
              withBand
                ? `Son ${view.intervalDays} günün hatalarından; hedef %80, ölçümde yaklaşık %75 tutuyor`
                : "Yeterli geçmiş yok"
            }
          />
        )}
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Özet</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {view.sentences.map((t) => (
              <li key={t}>{t}</li>
            ))}
            <li>
              Katsayılar: dünkü artığın %{nf(view.coefficients.persistence * 100)}&apos;i
              bugüne taşınıyor, net yükteki her 1.000 MW sapma yaklaşık{" "}
              {nf(view.coefficients.load * 1000)} TL/MWh ({view.coefficients.trainDays}{" "}
              benzer günle uydurulmuş).
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Saatlik fiyat beklentisi ve ± aralık"
          description={`TL/MWh. Mavi: beklenti; açık mavi bant: %80 aralık (son ${view.intervalDays} günün hatalarından); gri kesikli: referans ortancası${s.actualCheck ? "; koyu: gerçekleşen PTF" : ""}; kırmızı kesikli: fiyat limiti.`}
        >
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid />
            <XAxis {...axis.x} />
            <YAxis tickFormatter={(v: number) => nf(v)} />
            <Tooltip
              formatter={(v: unknown) =>
                Array.isArray(v)
                  ? `${nf(Number(v[0]))} – ${nf(Number(v[1]))}`
                  : `${nf(Number(v ?? 0))} TL/MWh`
              }
              labelFormatter={(h) => hh(Number(h))}
            />
            <Legend />
            {limit && (
              <ReferenceLine
                y={limit.cap}
                stroke={CHART_COLOR.red}
                strokeDasharray="6 3"
                label={{
                  value: `Limit ${nf(limit.cap)}`,
                  position: "insideTopLeft",
                  fontSize: 11,
                  fill: CHART_COLOR.red,
                }}
              />
            )}
            {withBand && (
              <Area
                name="%80 aralık"
                dataKey="band"
                stroke="none"
                fill={CHART_COLOR.blue}
                fillOpacity={0.15}
                isAnimationActive={false}
              />
            )}
            <Line
              name="Referans ortancası"
              dataKey="baseline"
              stroke={CHART_COLOR.slateLight}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Line
              name="Beklenti"
              dataKey="expected"
              stroke={CHART_COLOR.blue}
              isAnimationActive={false}
            />
            {s.actualCheck && (
              <Line
                name="Gerçekleşen PTF"
                dataKey="actual"
                stroke={CHART_COLOR.slate}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ChartCard>

        <div id="kart-katkilar" className="scroll-mt-24">
          <ChartCard
            title="Beklentiyi ne oluşturuyor"
            description="TL/MWh, referansa eklenen katkılar. Dünkü artık: dünün fiyatının normalden sapması bugüne taşınıyor. Net yük: yük tahmini − EPİAŞ rüzgâr tahmini − güneş vekili; normalden yüksekse fiyatı artırır."
          >
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid />
              <XAxis {...axis.x} />
              <YAxis tickFormatter={(v: number) => nf(v)} />
              <Tooltip
                formatter={(v: unknown) => `${nf(Number(v ?? 0))} TL/MWh`}
                labelFormatter={(h) => hh(Number(h))}
                cursor={{ fill: "#f1f5f9" }}
              />
              <Legend />
              <Bar
                name="Dünkü artık"
                dataKey="persistence"
                stackId="a"
                fill={CHART_COLOR.violet}
                isAnimationActive={false}
              />
              <Bar
                name="Net yük"
                dataKey="load"
                stackId="a"
                fill={CHART_COLOR.orange}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartCard>
        </div>

        <div id="kart-girdiler" className="scroll-mt-24">
          <ChartCard
            title="Girdiler: yük, rüzgâr tahmini, net yük"
            description="MW. Yük tahmini ve EPİAŞ rüzgâr tahmini yarın için yayımlanmış hâliyle; net yük = yük − rüzgâr − güneş vekili (önceki 7 günün aynı saat KGÜP güneş ortancası)."
          >
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid />
              <XAxis {...axis.x} />
              <YAxis tickFormatter={(v: number) => nf(v / 1000)} unit=" GW" width={62} />
              <Tooltip
                formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`}
                labelFormatter={(h) => hh(Number(h))}
              />
              <Legend />
              <Line
                name="Yük tahmini"
                dataKey="lep"
                stroke={CHART_COLOR.slate}
                isAnimationActive={false}
              />
              <Line
                name="EPİAŞ rüzgâr tahmini"
                dataKey="windF"
                stroke={CHART_COLOR.teal}
                isAnimationActive={false}
              />
              <Line
                name="Net yük"
                dataKey="net"
                stroke={CHART_COLOR.red}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartCard>
        </div>
      </div>

      <details className="rounded-md border bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
          Saatlik tablo
        </summary>
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="px-2 py-2 font-medium">Saat</th>
                <th className="px-2 py-2 text-right font-medium">Referans</th>
                <th className="px-2 py-2 text-right font-medium">Dünkü artık</th>
                <th className="px-2 py-2 text-right font-medium">Net yük</th>
                <th className="px-2 py-2 text-right font-medium">Beklenti</th>
                <th className="px-2 py-2 text-right font-medium">%80 aralık</th>
                <th className="px-2 py-2 font-medium">Limit</th>
                {s.actualCheck && (
                  <th className="px-2 py-2 text-right font-medium">Gerçekleşen</th>
                )}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.hour} className="border-b last:border-0">
                  <td className="px-2 py-1.5 tabular-nums">{hh(r.hour)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {r.baseline === null ? "–" : nf(r.baseline)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {r.persistence === null ? "–" : nf(r.persistence)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {r.load === null ? "–" : nf(r.load)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                    {r.expected === null ? "–" : nf(r.expected)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {r.lo === null || r.hi === null ? "–" : `${nf(r.lo)} – ${nf(r.hi)}`}
                  </td>
                  <td
                    className={`px-2 py-1.5 ${r.hiAtCap ? "text-amber-700" : "text-slate-500"}`}
                  >
                    {r.level ? LEVEL_LABEL[r.level] : r.hiAtCap ? "üst uç limitte" : ""}
                  </td>
                  {s.actualCheck && (
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.actual === null ? "–" : nf(r.actual)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
