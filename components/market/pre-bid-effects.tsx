"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EffectId } from "@/lib/analysis/pre-bid-effects";
import type { PreBidEffects } from "@/lib/services/pre-bid-effects";
import { nf } from "@/lib/format";

const dmy = (d: string) => d.split("-").reverse().join(".");

const LABEL: Record<EffectId, { name: string; what: string; usable: string }> = {
  gas: {
    name: "Doğal gaz referans fiyatı (GRF)",
    what: "Bir önceki günkü GRF, modele ek girdi olarak",
    usable: "Teklif saatinde bilinir.",
  },
  sunReal: {
    name: "Gerçekleşen güneş (lisanssız dahil)",
    what: "Net yükteki güneş tahmini yerine gerçekleşen güneş",
    usable:
      "Teklif saatinde BİLİNMEZ: yarının güneşini bilseydik elde edeceğimiz üst sınır.",
  },
  hydro: {
    name: "Baraj doluluğu (DSİ, enerji amaçlı)",
    what: "İki gün önceki son yayımlanan ülke ortalaması doluluk (%), modele ek girdi olarak",
    usable: "Teklif saatinde bilinir (DSİ iş günlerinde akşam yayımlıyor).",
  },
  neighbor: {
    name: "Komşu fiyatı: PTF − Bulgaristan (ENTSO-E)",
    what: "Bir önceki günün saatlik PTF ile Bulgaristan gün öncesi fiyatı (EUR → TL) farkı, modele ek girdi olarak",
    usable: "Teklif saatinde bilinir (bir önceki günün fiyatı).",
  },
  flows: {
    name: "Sınır akışı: net ihracat (ENTSO-E)",
    what: "Bir önceki günün saatlik toplam net ihracatı (Bulgaristan + Yunanistan, MW), modele ek girdi olarak",
    usable: "Teklif saatinde bilinir (bir önceki günün akışı).",
  },
  both: {
    name: "İkisi birlikte",
    what: "Gerçekleşen güneş + GRF",
    usable: "Yine üst sınır (güneş bilinmiyor).",
  },
};

const VERDICT = {
  better: { text: "iyileştiriyor", tone: "bg-emerald-100 text-emerald-800" },
  worse: { text: "kötüleştiriyor", tone: "bg-red-100 text-red-800" },
  noise: { text: "fark gürültü içinde", tone: "bg-slate-100 text-slate-700" },
} as const;

/** Ölçülmeyen verilerin neden ölçülmediği; sayı yok, yalnız durum */
const NOT_MEASURED: Array<{ data: string; why: string }> = [
  {
    data: "Arz–talep eğrisi",
    why: "Geçmiş günler için gün başına 24 istek gerekir (yaklaşık 3.400 istek); bu ekranda hesaplanmadı. Önceki ayrı ölçümde (27.10.2026) üçüncü değişken olarak yaklaşık +1 puan, yani gürültü sınırında kalmıştı.",
  },
  {
    data: "GÖP teklif miktarları, gün içi işlem geçmişi",
    why: "Geçmişleri aylarca çekilmedi; modele bağlanmadı, yalnız yukarıda bağlam olarak gösteriliyor.",
  },
  {
    data: "Sınır hatları kapasitesi",
    why: "Kullanıma açık kapasite sıfır görünüyor, anlamı doğrulanmadı; ölçüme sokmadım.",
  },
];

/** Yeni bulunan verilerin teklif öncesi fiyat modeline etkisi (ÖNİZLEME): aynı yürüyen geriye test, günlük eşleştirilmiş hata farkı */
export function PreBidEffectsPanel({
  data: external,
}: { data?: PreBidEffects | null } = {}) {
  const [fetched, setData] = useState<PreBidEffects | null>(null);
  const data = external !== undefined ? external : fetched;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (external !== undefined) return;
    let cancelled = false;
    fetch("/api/market/pre-bid-effects")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) throw new Error(d.error);
        setData(d);
      })
      .catch(
        (e) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Etki ölçümü alınamadı.")
      );
    return () => {
      cancelled = true;
    };
  }, [external]);

  return (
    <Card id="kart-etki" className="scroll-mt-24 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Yeni verilerin fiyat tahminine etkisi</CardTitle>
        <p className="text-xs text-slate-500">
          Aynı geriye test (her gün yalnız o günden önceki verilerle), her veri modele
          eklenerek tekrarlandı. Hata: saatlik ortalama mutlak sapma, TL/MWh; küçük olan
          iyidir. Fark, günlük hata farklarının ortalamasıdır; standart hatasının iki
          katından küçükse ölçülen şey şanstan ayırt edilemez.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
            {error}
          </div>
        )}
        {!data && !error && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Ölçülüyor (yaklaşık 10 saniye)…
          </div>
        )}
        {data && data.notes.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            {data.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}
        {data && data.rows.length === 0 && !error && (
          <p className="text-slate-600">Ölçmek için yeterli gün yok.</p>
        )}
        {data?.rows.map((r) => {
          const v = VERDICT[r.verdict];
          return (
            <div key={r.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{LABEL[r.id].name}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${v.tone}`}
                >
                  {v.text}
                </span>
              </div>
              <p className="mt-1 text-slate-600">
                {LABEL[r.id].what}. {LABEL[r.id].usable}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Mevcut model hatası</dt>
                  <dd className="font-medium">{nf(r.currentMae)} TL/MWh</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Bu veriyle hata</dt>
                  <dd className="font-medium">{nf(r.variantMae)} TL/MWh</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Değişim</dt>
                  <dd className="font-medium">
                    {r.improvementPct >= 0 ? "hata %" : "hata +%"}
                    {nf(Math.abs(r.improvementPct))}
                    {r.improvementPct >= 0 ? " azaldı" : " arttı"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Daha iyi olduğu günler</dt>
                  <dd className="font-medium">%{nf(r.betterDaysPct, 0)}</dd>
                </div>
              </dl>
              <p className="mt-1 text-xs text-slate-500">
                {r.days} gün ({dmy(r.firstDay)} – {dmy(r.lastDay)}); günlük fark{" "}
                {nf(r.diffMean)} ± {nf(r.diffSe)} TL/MWh; aynı günlerde referansın (son 28
                gün ortancası) hatası {nf(r.baselineMae)} TL/MWh.
              </p>
            </div>
          );
        })}
        {data && data.rows.length > 0 && <Conclusion data={data} />}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-700">Bu ekranda ölçülmeyenler</p>
          {NOT_MEASURED.map((m) => (
            <p key={m.data} className="text-xs text-slate-600">
              <span className="font-medium text-slate-800">{m.data}:</span> {m.why}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Conclusion({ data }: { data: PreBidEffects }) {
  const better = data.rows.filter((r) => r.verdict === "better");
  const worse = data.rows.filter((r) => r.verdict === "worse");
  const sun = data.rows.find((r) => r.id === "sunReal");
  const tail = data.unlicensedUntil
    ? ` Lisanssız güneşin son dolu günü ${dmy(data.unlicensedUntil)} (EPİAŞ yaklaşık 4 hafta gecikmeli yayımlıyor).`
    : "";
  return (
    <p className="rounded-md bg-slate-50 p-3 text-slate-700">
      <strong>Sonuç:</strong>{" "}
      {better.length === 0 && worse.length === 0
        ? "Bu verilerin hiçbiri modeli şanstan ayırt edilebilir ölçüde değiştirmiyor."
        : `${better.length ? `İyileştirenler: ${better.map((r) => LABEL[r.id].name).join(", ")}. ` : ""}${worse.length ? `Kötüleştirenler: ${worse.map((r) => LABEL[r.id].name).join(", ")}.` : ""}`}
      {sun
        ? ` Yarının güneşini tam bilseydik bile (üst sınır) hata ${sun.improvementPct >= 0 ? "yalnız %" : "%"}${nf(Math.abs(sun.improvementPct), 0)} ${sun.improvementPct >= 0 ? "azalırdı" : "artardı"}; ölçülen dönem yaz-sonbahar, güneşin fiyatı en az değiştirdiği mevsim. Ara mevsim ve kış verisi birikince tekrar bakılmalı.`
        : ""}
      {tail}
    </p>
  );
}
