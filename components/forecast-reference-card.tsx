"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReferenceRow } from "@/lib/services/production-loss";

const nf = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");
const ym = (s: string) => `${["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"][Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;

/** PLAN 20.3 / 15 kapı kararı: açık hava tahmini referansı ile şirketin ilk KGÜP'ü (iyileştirme iddiası değildir) */
export function ForecastReferenceCard({ period, rows }: { period: { from: string; to: string }; rows: ReferenceRow[] }) {
  const sorted = [...rows].sort((a, b) => a.modelTlPerMwh - a.kgupTlPerMwh - (b.modelTlPerMwh - b.kgupTlPerMwh));
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Açık referans: ücretsiz hava tahminiyle model ve şirketin ilk KGÜP&apos;ü</CardTitle>
        <CardDescription>
          Dengesizlik maliyeti + KÜPST, MWh başına ({ym(period.from)} – {ym(period.to)}; dönemin kuralı). Model, GÖP kesiminden önce herkesin erişebildiği 2 gün
          önceki ECMWF tahminiyle kurulur. İyileştirme iddiası değildir: şirketler santral içi veri ve ticari tahmin servisi kullanır.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Santral</TableHead>
                <TableHead className="text-right">Model (kayıp hariç)</TableHead>
                <TableHead className="text-right">İlk KGÜP (kayıp hariç)</TableHead>
                <TableHead className="text-right">Fark</TableHead>
                <TableHead className="text-right">Model / İlk KGÜP (tüm saatler)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const diff = r.modelTlPerMwh - r.kgupTlPerMwh;
                return (
                  <TableRow key={r.epiasPlantId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf(r.modelTlPerMwh)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf(r.kgupTlPerMwh)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {diff < 0 ? "model " : "KGÜP "}
                      {nf(Math.abs(diff))} TL/MWh daha ucuz
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {nf(r.modelAllTlPerMwh)} / {nf(r.kgupAllTlPerMwh)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="px-6 pb-4 text-xs leading-relaxed text-slate-500">
          &quot;Kayıp hariç&quot;: uyduyla kayıp saatler (planlı kısıntı, arıza) iki taraftan da çıkarılmıştır; şirketin kendini gerçekleştiren kısıntı planı
          böylece avantaj sayılmaz. Model sürüm 3 (panel düzlemi ışınımı, uyduyla temizlenmiş eğitim; 2024&apos;te tasarlandı, sonra donduruldu); her ay önceki 4
          ayla eğitilir. 15 santralde (Aşama 15) kayıp hariç model 101,5, ilk KGÜP 78,3 TL/MWh; model 2 santralde önde.
        </p>
      </CardContent>
    </Card>
  );
}
