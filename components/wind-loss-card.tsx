"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LOSS_COLOR } from "@/components/weather-day-chart";
import { NOTICE_CAUSE_LABEL } from "@/lib/analysis/outage-validation";
import { WIND_MIN_DAILY_R } from "@/lib/forecast/wind-loss";
import type { HourLossState } from "@/lib/services/production-loss";
import type { WindPlantLoss } from "@/lib/services/wind-loss";

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const monthLabel = (m: string) => `${MONTHS_SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const tl = (v: number) => (v >= 1e6 ? `${nf(v / 1e6, 2)} M TL` : `${nf(v / 1e3)} bin TL`);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CELL: Record<HourLossState, string> = { planned: LOSS_COLOR.planned, unplanned: LOSS_COLOR.unplanned, normal: "#dfe7ef", none: "transparent" };
const STATE_LABEL: Record<HourLossState, string> = {
  planned: "planlı kısıntı",
  unplanned: "plansız kayıp (ilk KGÜP'te yok)",
  normal: "rüzgârlı, kayıp yok",
  none: "rüzgâr zayıf / veri yok",
};
/** "Son 12 ay"; verisi daha kısa santralde ay sayısı ("Verisi olan 6 ay") */
const periodLabel = (from: string, to: string) => {
  const n = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
  return n >= 12 ? "Son 12 ay" : `Verisi olan ${n} ay`;
};
const r3 = (v: number | null) => (v === null ? "–" : nf(v, 2));
const eventDate = (s: string) => `${Number(s.slice(8, 10))} ${MONTHS_SHORT[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)} ${s.slice(11, 13)}:00`;

/** Rüzgâr santrali kayıp üretimi (geçmiş rüzgâr × santralin güç eğrisi), aylık özet, olaylar ve takvim */
export function WindLossCard({
  name,
  loss,
  calendar,
  selectedDate,
  onDate,
  estimatedLocation,
}: {
  name: string;
  loss: WindPlantLoss;
  calendar: Array<{ date: string; hours: HourLossState[] }>;
  selectedDate: string | null;
  onDate: (date: string) => void;
  estimatedLocation?: boolean;
}) {
  const s = loss.last12;
  const chart = loss.months
    .filter((m) => m.actualMwh > 0)
    .map((m) => ({ ay: monthLabel(m.month), month: m.month, "Planlı kısıntı": m.plannedLossMwh, "Plansız kayıp": m.unplannedLossMwh, pct: m.lossPct, tl: m.plannedValueTl + m.unplannedValueTl, commissioning: m.commissioning }));
  const month = calendar[0]?.date.slice(0, 7);
  const monthRow = loss.months.find((m) => m.month === month);
  const quality = `Kayıpsız ${nf(loss.days)} günde günlük beklenen ile gerçekleşen üretimin korelasyonu ${r3(loss.dailyR)} (ECMWF IFS 9 km; ERA5 ile ${r3(loss.dailyRSecondary)})`;
  const capacity = `${loss.capacitySource === "PEAK_ESTIMATE" ? "≥ " : ""}${nf(loss.capacityMw, 1)} MW${loss.capacitySource === "PEAK_ESTIMATE" ? " (kayıt yok; en yüksek üretimden alt sınır)" : loss.capacitySource === "EPIAS_YEKDEM" ? " (YEKDEM kaydı)" : loss.capacitySource === "EPDK_LICENSE" ? " (EPDK lisansı)" : ""}`;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{name}: kayıp üretim (geçmiş rüzgârla)</CardTitle>
        <CardDescription>
          Santralin üretebileceği (geçmiş 100 m rüzgâr × santralin kendi üretiminden öğrenilen güç eğrisi) ile ürettiği arasındaki fark. Planlı: şirket o
          saat için beklenenin %10&apos;undan az planlamış (kısıntı, bakım); plansız: ilk KGÜP&apos;te olmayan, iki hava kaynağının birlikte bulduğu ve en az 6
          saat süren düşüşler (arıza, bakım, talimat, şebeke ya da model hatası; alt sınır).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {estimatedLocation && (
          <p className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
            Konum tahmini (~ ilçe merkezi): rüzgâr santralin kendi noktası yerine yaklaşık bir noktadan; kayıp rakamları kaba tahmindir.
          </p>
        )}
        {!loss.reliable ? (
          <p className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
            {quality}: eşik {nf(WIND_MIN_DAILY_R, 2)}. Hava verisi bu santralin üretimini yeterince açıklamıyor (sırt / vadi etkisi, konum ya da türbin
            sayısı değişimi); kayıp rakamı gösterilmiyor.
          </p>
        ) : (
          <>
            {s ? (
              <p className="text-sm text-slate-800">
                {periodLabel(s.from, s.to)} ({monthLabel(s.from)} – {monthLabel(s.to)}): potansiyel üretimin <b>%{nf(s.lossPct, 1)}</b> kaybı = {nf(s.plannedLossMwh + s.unplannedLossMwh)} MWh
                (planlı {nf(s.plannedLossMwh)}, plansız en az {nf(s.unplannedLossMwh)}). PTF ile karşılığı <b>{tl(s.plannedValueTl + s.unplannedValueTl)}</b>.
              </p>
            ) : (
              <p className="text-sm text-slate-500">Devreye alma sonrası tam ay yok.</p>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Aylık kayıp, MWh</p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 6, right: 10, left: 0, bottom: 0 }} barCategoryGap={3}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="ay" tick={{ fontSize: 11 }} stroke="#64748b" tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#64748b" tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => nf(v)} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p: any = payload[0].payload;
                        return (
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                            <p className="font-medium text-slate-900">
                              {MONTHS[Number(p.month.slice(5, 7)) - 1]} {p.month.slice(0, 4)}
                              {p.commissioning ? " · devreye alma" : ""}
                            </p>
                            <p className="text-slate-700">Planlı kısıntı {nf(p["Planlı kısıntı"])} MWh</p>
                            <p className="text-slate-700">Plansız kayıp (en az) {nf(p["Plansız kayıp"])} MWh</p>
                            <p className="text-slate-500">
                              Kayıp payı %{nf(p.pct, 1)} · {tl(p.tl)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="Plansız kayıp" stackId="k" fill={LOSS_COLOR.unplanned} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
                    <Bar dataKey="Planlı kısıntı" stackId="k" fill={LOSS_COLOR.planned} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LOSS_COLOR.planned }} /> Planlı kısıntı
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LOSS_COLOR.unplanned }} /> Plansız kayıp (en az)
                </span>
              </div>
            </div>

            {loss.events.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Plansız kayıp olayları ({loss.events.length}) ve EPİAŞ arıza / bakım bildirimleri{loss.noticeCoverage ? ` (bildirim verisi ${loss.noticeCoverage})` : ""}
                </p>
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Başlangıç</TableHead>
                        <TableHead className="text-right">Saat</TableHead>
                        <TableHead className="text-right">Kayıp, MWh</TableHead>
                        <TableHead>Bildirim</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...loss.events].reverse().map((e) => (
                        <TableRow key={e.start} className="cursor-pointer" onClick={() => onDate(e.start.slice(0, 10))}>
                          <TableCell className="tabular-nums">{eventDate(e.start)}</TableCell>
                          <TableCell className="text-right tabular-nums">{e.hours}</TableCell>
                          <TableCell className="text-right tabular-nums">{nf(e.lostMwh)}</TableCell>
                          <TableCell className={e.notice ? "" : "text-slate-500"}>
                            {e.notice === "uncovered" ? "bildirim verisi yok" : e.notice ? NOTICE_CAUSE_LABEL[e.notice].split(" (")[0] : "bildirim yok"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </>
        )}

        {calendar.length > 0 && month && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">
              {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)} takvimi (gün × saat)
              {loss.reliable && monthRow ? ` · kayıp %${nf(monthRow.lossPct, 1)}, ${monthRow.plannedHours} planlı ve ${monthRow.unplannedHours} plansız saat` : ""}. Bir güne tıklayın.
            </p>
            <div className="overflow-x-auto">
              <table className="border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th />
                    {HOURS.map((h) => (
                      <th key={h} className="w-4 text-center text-[10px] font-normal text-slate-400">
                        {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calendar.map((row) => (
                    <tr key={row.date} className="cursor-pointer" onClick={() => onDate(row.date)}>
                      <td className={`pr-1 text-right text-[10px] tabular-nums ${row.date === selectedDate ? "font-semibold text-slate-900" : "text-slate-400"}`}>{Number(row.date.slice(8))}</td>
                      {HOURS.map((h) => {
                        const st = loss.reliable ? row.hours[h] : row.hours[h] === "none" ? "none" : "normal";
                        return (
                          <td
                            key={h}
                            title={`${row.date} ${String(h).padStart(2, "0")}:00 · ${STATE_LABEL[st]}`}
                            className={`h-3 w-4 rounded-sm ${row.date === selectedDate ? "ring-1 ring-slate-400" : ""}`}
                            style={{ background: CELL[st] }}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-600">
              {(loss.reliable ? (["planned", "unplanned", "normal"] as const) : (["normal"] as const)).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CELL[k] }} /> {STATE_LABEL[k]}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs leading-relaxed text-slate-500">
          {quality}. Güç eğrisi: 100 m hız (0,5 m/s dilim) × 8 yön diliminde üretimin medyanı; kısıntılı saatler eğitimden çıkarılır. Kayıp saati: beklenen
          üretim kurulu gücün en az %30&apos;u iken üretim beklenenin %20&apos;sinin altında. Yalnız santralin büyük kısmının durduğu saatler görünür (birkaç
          türbinin arızası görünmez); plansız kayıp bu yüzden ve iki kaynak şartı nedeniyle alt sınırdır (sayılmayan: yalnız IFS&apos;in bulduğu ya da 6 saatten kısa düşüşler{" "}
          {nf(loss.excludedUnplannedMwh)} MWh).
          {loss.steadyFrom ? ` ${loss.steadyFrom} öncesi devreye alma: kayıp sayılmadı.` : ""} Kurulu güç {capacity}. Parasal karşılık kayıp
          MWh × PTF (YEKDEM ya da ikili anlaşma fiyatı değil). Rüzgâr: ECMWF IFS 9 km kısa vadeli model çıktısı (≈ 1 gün
          gecikmeli) ve ERA5 0,25° yeniden analizi (≈ 5–6 gün; plansız kayıp bu kadar gecikir); Open-Meteo.com, CC BY 4.0; ERA5: Copernicus Climate Change
          Service.
        </p>
      </CardContent>
    </Card>
  );
}
