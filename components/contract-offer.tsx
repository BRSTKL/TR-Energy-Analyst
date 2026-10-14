"use client";

import React from "react";
import type { CandidateResult } from "@/lib/analysis/candidate-screening";
import type { ContractPrice } from "@/lib/analysis/contract-pricing";
import type { CandidatePricing } from "@/lib/services/candidates";

const nf = (v: number, d = 0) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const TECH_NAME: Record<string, string> = { RES: "rüzgâr", GES: "güneş", HES: "hidro" };

/**
 * Aday santral için teklif kutusu (PLAN 16.3): taban (adil prim), öneri ve tavan (tek başına maliyet);
 * öneri makasa endeksli (16.2b); PTF oranı, reel TL ve USD karşılığı; sözleşme biçimi sınaması ve sabit TL'nin riski.
 */
export function ContractOffer({
  c,
  price,
  pricing,
}: {
  c: CandidateResult;
  price: ContractPrice;
  pricing: CandidatePricing;
}) {
  const forms = pricing.contractForms[c.type] ?? pricing.contractForms.ALL;
  if (price.offerTl === null)
    return <p className="text-sm text-slate-700">Teklif verilemez: {price.reason}</p>;

  const worst = price.worst;
  // Makas endeksli öneri: referans makas ve 16.2b sınaması varsa
  const indexed = pricing.referenceSpreadTl !== null && pricing.referenceSpreadTl > 0 && forms?.spreadShareLossPct != null;
  const typicalRaw = pricing.typicalRatio[c.type] ?? pricing.typicalRatio.ALL;
  const typical = typicalRaw && price.floorTl > 0 ? typicalRaw : null;
  return (
    <div className="grid gap-4 text-sm text-slate-800 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-3">
        <p className="text-base">
          Önerilen dengesizlik hizmet bedeli <b>{nf(price.offerTl, 1)} TL/MWh</b>
          {indexed ? (
            <>
              , <b>makasa endeksli</b>: uzlaştırma döneminde bedel = {nf(price.offerTl, 1)} × gerçekleşen piyasa makası /{" "}
              {nf(pricing.referenceSpreadTl!, 0)} TL/MWh (referans: bu dönemin ortalama |SMF − PTF|).
            </>
          ) : (
            "."
          )}
        </p>
        <p className="text-xs text-slate-600">
          Bugünkü karşılıkları:
          {price.offerPctOfPtf !== null && <> PTF&apos;ye oranı %{nf(price.offerPctOfPtf, 1)};</>}
          {pricing.real && (
            <>
              {" "}
              {pricing.real.label} ile ≈ {nf(price.offerTl * pricing.real.factor, 1)} TL;
            </>
          )}
          {pricing.usdFactor !== null && <> ≈ {nf(price.offerTl * pricing.usdFactor, 2)} USD/MWh.</>}
        </p>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-slate-500">Taban: adil prim</dt>
            <dd className="font-semibold tabular-nums">{nf(price.floorTl, 1)} TL/MWh</dd>
            <dd className="text-slate-500">
              toplayıcının beklenen maliyeti (Shapley payı + KÜPST)
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Öneri</dt>
            <dd className="font-semibold tabular-nums text-emerald-800">
              {nf(price.offerTl, 1)} TL/MWh
            </dd>
            <dd className="text-slate-500">
              taban + pazarlık alanından toplayıcı payı (%{nf(price.marginShare * 100)}); marj{" "}
              {nf(price.marginTl!, 1)} TL/MWh
              {price.zeroFloored &&
                " (taban eksi: aday portföyün maliyetini kendi payından fazla düşürüyor, bedel 0'a çekildi)"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Tavan: tek başına</dt>
            <dd className="font-semibold tabular-nums">
              {nf(price.ceilingTl, 1)} TL/MWh
            </dd>
            <dd className="text-slate-500">
              santralin bağımsız kalırsa ödeyeceği (KÜPST dahil)
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
        {forms && (
          <p>
            <b>Sözleşme biçimi:</b> {pricing.backtestLabel} sınamasında bedel maliyetin %50 fazlasıyla fiyatlanıp ertesi yıl
            uygulansaydı zarar eden santral payı ({TECH_NAME[c.type] && pricing.contractForms[c.type] ? TECH_NAME[c.type] : "bütün santraller"}):
            {forms.spreadShareLossPct !== null && (
              <>
                {" "}
                makas endeksi <b>%{nf(forms.spreadShareLossPct)}</b>,
              </>
            )}{" "}
            sabit TL <b>%{nf(forms.fixedLossPct)}</b>, PTF yüzdesi <b>%{nf(forms.ptfShareLossPct)}</b>. Maliyeti makas yönetiyor
            {forms.spreadChange !== null && <> (makas ×{nf(forms.spreadChange, 2)})</>}; santrallerin üretim ağırlıklı PTF&apos;si ise ×
            {nf(forms.ptfChange, 2)} değişti.
          </p>
        )}
        {(typical !== null || worst) && (
          <p>
            <b>Sabit TL olarak verilirse:</b>
            {typical !== null && (
              <>
                {" "}
                geçen yılın verisiyle hesaplanan maliyet ertesi yıl medyan ×{nf(typical, 2)} çıktı; bu tekrarlanırsa marj{" "}
                <b className={price.offerTl - price.floorTl * typical < 0 ? "text-rose-700" : "text-slate-900"}>
                  {nf(price.offerTl - price.floorTl * typical, 1)} TL/MWh
                </b>
                .
              </>
            )}
            {worst && (
              <>
                {" "}
                Kötü senaryoda (P90, ×{nf(worst.ratio, 2)}) marj{" "}
                <b className={worst.marginTl! < 0 ? "text-rose-700" : "text-slate-900"}>{nf(worst.marginTl!, 1)} TL/MWh</b>.
              </>
            )}
          </p>
        )}
        {indexed && (
          <p className="text-slate-600">
            Makas endeksi iki yönlüdür: makas daralırsa bedel de düşer. Sınama tek yılı kapsıyor (makasın açıldığı 2025 → 2026); endeks
            maliyetin yalnız fiyat kısmını izler, tahmin kalitesi değişirse bedel bunu yakalamaz.
          </p>
        )}
        <p className="text-slate-500">
          Rakiplerin teklif fiyatı açık veride yok. Toplayıcının işletme gideri ve GİP
          işlem kâr/zararı bedele dahil değil; tavana santralin kendi ticaret ekibinin
          gideri eklenmedi (gerçek tavan daha yüksek). Ölçümdür, işlem önerisi değil.
        </p>
      </div>
    </div>
  );
}
