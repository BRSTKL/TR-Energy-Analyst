"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Download, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { bidCsv, bidTotals, buildBidRows, RISK_LABEL, type BidRisk } from "@/lib/ptf/bid-table";
import type { PtfLogHour } from "@/lib/ptf/forecast-log";
import type { PriceLimit } from "@/lib/analysis/price-limit";
import type { PortfolioProduction } from "@/lib/services/portfolio-forecast";
import { nf } from "@/lib/format";

const RISK_CLASS: Record<Exclude<BidRisk, null>, string> = {
  cap: "bg-red-100 text-red-800",
  near: "bg-amber-100 text-amber-900",
  zero: "bg-sky-100 text-sky-800",
  wide: "bg-slate-100 text-slate-700",
};

const clock = (iso: string) =>
  new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(11, 16);

/**
 * Saat saat karar tablosu: PTF tahmini + aralık, portföy üretim tahmini, fiyat riski. Teklif miktarı önerisi vermez.
 * PTF saatleri motor panelinden gelir; üretim sunucunun sabah kayıtlarından (`/api/ops/portfolio-forecast`).
 */
export function BidTable({
  date,
  ptf,
  limit,
}: {
  date: string;
  ptf: PtfLogHour[] | null;
  limit: PriceLimit | null;
}) {
  const [prod, setProd] = useState<PortfolioProduction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProd(null);
    setError(null);
    fetch(`/api/ops/portfolio-forecast?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) throw new Error(d.error);
        setProd(d as PortfolioProduction);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Üretim tahmini alınamadı."));
    return () => {
      cancelled = true;
    };
  }, [date]);

  const rows = useMemo(
    () => (ptf && ptf.length ? buildBidRows(ptf, prod?.total.hours ?? null, limit) : []),
    [ptf, prod, limit]
  );
  const totals = useMemo(() => bidTotals(rows), [rows]);

  const download = () => {
    const blob = new Blob([bidCsv(date, rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `teklif-masasi-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const hasProd = !!prod?.total.hours;
  const logs = prod?.logs;
  const late = [logs?.solar, logs?.wind].some((l) => l && !l.onTime);

  return (
    <section aria-labelledby="teklif-masasi" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="teklif-masasi" className="text-xl font-semibold text-slate-900">
          Saat saat teklif masası
        </h2>
        <Button variant="outline" size="sm" disabled={!rows.length} onClick={download}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> CSV indir
        </Button>
        {!prod && !error && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>
      <p className="text-sm text-slate-600">
        PTF tahmini, üretim tahmini ve risk yan yana. Teklif miktarı önerisi vermez (kendi KGÜP ve
        sözleşme verisi yok).
      </p>

      {!rows.length && (
        <Card>
          <CardContent className="p-4 text-sm text-slate-600">
            PTF tahmini hazır olunca tablo burada dolar.
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Üretim tahmini alınamadı: {error}
        </div>
      )}
      {prod && !prod.total.hours && (
        <p className="flex items-start gap-1.5 text-sm text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          Bu gün için güneş / rüzgâr üretim kaydı yok (sunucu sabah yazar); tablo yalnız fiyat
          riskini gösterir.
        </p>
      )}
      {late && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Üretim kaydı teklif kesiminden sonra yazılmış (
          {[logs?.solar, logs?.wind]
            .filter((l) => l && !l.onTime)
            .map((l) => clock(l!.issuedAt))
            .join(", ")}
          ); karar için geç olabilir.
        </div>
      )}

      {rows.length > 0 && (
        <>
          {hasProd && totals.weightedPtf !== null && totals.mwh !== null && (
            <p className="text-sm text-slate-700">
              Üretim ağırlıklı PTF <b className="tabular-nums">{nf(totals.weightedPtf)} TL/MWh</b> ·
              üretim tahmini <b className="tabular-nums">{nf(totals.mwh)} MWh</b>
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Saat</th>
                  <th className="px-3 py-2 text-right">PTF tahmini (TL/MWh)</th>
                  <th className="px-3 py-2 text-right">Aralık (TL/MWh)</th>
                  {hasProd && <th className="px-3 py-2 text-right">Üretim (MWh)</th>}
                  <th className="px-3 py-2">Risk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hour} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{r.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{nf(r.ptf)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {r.low === null || r.high === null ? "–" : `${nf(r.low)} – ${nf(r.high)}`}
                    </td>
                    {hasProd && (
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.mwh === null ? "–" : nf(r.mwh, 1)}
                      </td>
                    )}
                    <td className="px-3 py-1.5">
                      {r.risk && (
                        <span
                          title={r.note}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_CLASS[r.risk]}`}
                        >
                          {RISK_LABEL[r.risk]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {prod && prod.projects.length > 0 && prod.total.hours && (
            <p className="text-xs text-slate-500">
              Üretim: {prod.projects.filter((p) => p.hours).length} / {prod.projects.length} projenin
              güneş ve rüzgâr santralleri toplandı. HES ve kayıtta olmayan santraller dışarıda (
              {prod.projects.reduce((s, p) => s + p.uncovered, 0)} santral).
            </p>
          )}
        </>
      )}
    </section>
  );
}
