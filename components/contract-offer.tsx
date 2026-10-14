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
 * önerinin PTF oranı, reel TL ve USD karşılığı; kötü senaryoda marj; sözleşme biçimi sınamasının (16.2) sonucu.
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
  const typicalRaw = pricing.typicalRatio[c.type] ?? pricing.typicalRatio.ALL;
  const typical = typicalRaw && price.floorTl > 0 ? typicalRaw : null;
  return (
    <div className="grid gap-4 text-sm text-slate-800 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-3">
        <p className="text-base">
          Önerilen dengesizlik hizmet bedeli <b>{nf(price.offerTl, 1)} TL/MWh</b>
          {price.offerPctOfPtf !== null && (
            <> (PTF&apos;ye oranı %{nf(price.offerPctOfPtf, 1)})</>
          )}
          {pricing.real && (
            <>
              ; {pricing.real.label} ile ≈ {nf(price.offerTl * pricing.real.factor, 1)} TL
            </>
          )}
          {pricing.usdFactor !== null && (
            <>, ≈ {nf(price.offerTl * pricing.usdFactor, 2)} USD/MWh</>
          )}
          .
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
        {typical !== null && (
          <p>
            <b>Tipik durum:</b> geçen yılın verisiyle hesaplanan maliyet, ertesi yıl gerçekleşende medyan ×{nf(typical, 2)} çıktı (
            {pricing.backtestLabel}). Aynı sapma tekrarlanırsa taban {nf(price.floorTl * typical, 1)} TL/MWh, marj{" "}
            <b className={price.offerTl - price.floorTl * typical < 0 ? "text-rose-700" : "text-slate-900"}>
              {nf(price.offerTl - price.floorTl * typical, 1)} TL/MWh
            </b>
            .
          </p>
        )}
        {worst ? (
          <p>
            <b>Kötü senaryo:</b> geçmişle sınamada ({pricing.backtestLabel}) gerçekleşen
            maliyet tahminin P90&apos;ında ×{nf(worst.ratio, 2)} çıktı. Bu durumda taban{" "}
            {nf(worst.floorTl, 1)} TL/MWh, marj{" "}
            <b className={worst.marginTl! < 0 ? "text-rose-700" : "text-slate-900"}>
              {nf(worst.marginTl!, 1)} TL/MWh
            </b>
            {worst.marginTl! < 0 ? ": bu bedel kötü senaryoda zarar ettirir." : "."}
          </p>
        ) : (
          <p className="text-slate-500">
            Kötü senaryo hesaplanmadı (geçmişle sınama dosyası yok ya da taban eksi).
          </p>
        )}
        {forms && (
          <p>
            <b>Sabit TL mi, PTF yüzdesi mi?</b> {pricing.backtestLabel} sınamasında bedel
            maliyetin %50 fazlasıyla fiyatlansaydı zarar eden santral payı (
            {TECH_NAME[c.type] && pricing.contractForms[c.type]
              ? TECH_NAME[c.type]
              : "bütün santraller"}
            ): sabit TL <b>%{nf(forms.fixedLossPct)}</b>, PTF yüzdesi{" "}
            <b>%{nf(forms.ptfShareLossPct)}</b>. Maliyet arttı, santrallerin üretim
            ağırlıklı PTF&apos;si ise ×{nf(forms.ptfChange, 2)} değişti. Bu yüzden öneri
            sabit TL/MWh; PTF oranı yalnız bilgi içindir.
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
