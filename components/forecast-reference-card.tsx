"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReferenceRow, ReferenceSummary } from "@/lib/services/production-loss";

const nf = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");
const ym = (s: string) => `${["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"][Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;

/**
 * Üretim tahmini sayfası: canlı tahmin modelinin (sürüm 3 kalıcılıksız) ve kalıcılıklı sürüm 3'ün geçmişte şirketin ilk
 * KGÜP'üyle maliyet kıyası (Aşama 15 kapı kararı: açık referans, iyileştirme iddiası değildir)
 */
export function ForecastReferenceCard({ period, rows, summary }: { period: { from: string; to: string }; rows: ReferenceRow[]; summary: ReferenceSummary | null }) {
  // Kalıcılıksız sonuç yoksa (eski test dosyası) "–": kalıcılıklı sürümün daha iyi sonucu bu sayfanın modeli gibi gösterilmez
  const live = (r: ReferenceRow) => r.liveTlPerMwh;
  const key = (r: ReferenceRow) => (Number.isFinite(live(r)) ? live(r) - r.kgupTlPerMwh : Number.POSITIVE_INFINITY);
  const sorted = [...rows].sort((a, b) => key(a) - key(b));
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Geçmiş başarı: bu tahmin şirketin planına göre ne kadar tutardı?</CardTitle>
        <CardDescription>
          Dengesizlik maliyeti + KÜPST, MWh başına ({ym(period.from)} – {ym(period.to)}; dönemin kuralı). Model her ay önceki 4 ayla eğitilip GÖP kesiminden önce
          herkesin erişebildiği 2 gün önceki ECMWF tahminiyle çalıştırıldı ve şirketin ilk planıyla (ilk KGÜP) aynı saatlerde fiyatlandı. İyileştirme iddiası
          değildir: şirketler santral içi veri ve ticari tahmin servisi kullanır. Bu sayfadaki tahmin daha yeni hava tahminini kullanır (yarın için ≈ 1 gün
          önceki): geçmiş sonuç birebir aynı koşul değildir, yarın için büyük olasılıkla kötümserdir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        {summary && (
          <p className="px-6 text-sm text-slate-800">
            {summary.plants} güneş santralinde (proje dışı dahil, kayıp saatler hariç) bu sayfadaki model <b>{nf(summary.liveTlPerMwh)}</b>, şirketlerin ilk planı{" "}
            <b>{nf(summary.kgupTlPerMwh)}</b> TL/MWh; model {summary.liveWins} santralde şirketten ucuz. Şirketin dünkü üretimini bildiği durumdaki model (kalıcılıklı
            sürüm 3) {nf(summary.modelTlPerMwh)} TL/MWh.
          </p>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Santral</TableHead>
                <TableHead className="text-right">Bu sayfadaki model</TableHead>
                <TableHead className="text-right">İlk KGÜP</TableHead>
                <TableHead className="text-right">Fark</TableHead>
                <TableHead className="text-right">Kalıcılıklı sürüm 3</TableHead>
                <TableHead className="text-right">Tüm saatler: model / KGÜP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const diff = live(r) - r.kgupTlPerMwh;
                return (
                  <TableRow key={r.epiasPlantId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf(live(r))}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf(r.kgupTlPerMwh)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number.isFinite(diff) ? `${diff < 0 ? "model" : "KGÜP"} ${nf(Math.abs(diff))} daha ucuz` : "test yeniden çalıştırılmalı"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{nf(r.modelTlPerMwh)}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {nf(r.liveAllTlPerMwh)} / {nf(r.kgupAllTlPerMwh)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="px-6 pb-4 text-xs leading-relaxed text-slate-500">
          Kayıp saatler (uyduyla planlı kısıntı ve arıza) iki taraftan da çıkarılmıştır; şirketin kendini gerçekleştiren kısıntı planı böylece avantaj sayılmaz. Model
          sürüm 3: panel düzlemi ışınımı, uyduyla temizlenmiş eğitim; 2024&apos;te tasarlandı, sonra donduruldu. &quot;Bu sayfadaki model&quot; 48 saat önceki üretimi
          kullanmaz: kamu üretim verisi (EPİAŞ UEVM) aylık yayımlandığı için canlı tahminde yoktur. Konumu ilçe merkezi olan santrallerde (~) sonuç kabadır.
        </p>
      </CardContent>
    </Card>
  );
}
