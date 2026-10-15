"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LOSS_COLOR } from "@/components/weather-day-chart";
import type { HourLossState, PlantLoss } from "@/lib/services/production-loss";

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const monthLabel = (m: string) => `${MONTHS_SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const tl = (v: number) => (v >= 1e6 ? `${nf(v / 1e6, 2)} M TL` : `${nf(v / 1e3)} bin TL`);
const HOURS = Array.from({ length: 16 }, (_, i) => i + 5); // 05–20
const CELL: Record<HourLossState, string> = { planned: LOSS_COLOR.planned, unplanned: LOSS_COLOR.unplanned, normal: "#dfe7ef", none: "transparent" };
const STATE_LABEL: Record<HourLossState, string> = { planned: "planlı kısıntı", unplanned: "plansız kayıp", normal: "güneşli, kayıp yok", none: "güneş zayıf / veri yok" };

/** PLAN 20.3: uyduyla kayıp üretim (santral × ay) ve günün ayının takvimi */
export function ProductionLossCard({
  name,
  loss,
  calendar,
  selectedDate,
  onDate,
  estimatedLocation,
}: {
  estimatedLocation?: boolean;
  name: string;
  loss: PlantLoss;
  calendar: Array<{ date: string; hours: HourLossState[] }>;
  selectedDate: string | null;
  onDate: (date: string) => void;
}) {
  const s = loss.last12;
  const chart = loss.months
    .filter((m) => m.actualMwh > 0)
    .map((m) => ({
      ay: monthLabel(m.month),
      month: m.month,
      "Planlı kısıntı": m.plannedLossMwh,
      "Plansız kayıp": m.unplannedLossMwh,
      pct: m.lossPct,
      tl: m.plannedValueTl + m.unplannedValueTl,
      commissioning: m.commissioning,
    }));
  const month = calendar[0]?.date.slice(0, 7);
  const monthRow = loss.months.find((m) => m.month === month);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{name}: kayıp üretim (uyduyla)</CardTitle>
        <CardDescription>
          Santralin üretebileceği (gerçekleşen uydu ışınımı × normal verimi) ile ürettiği arasındaki fark. Planlı: şirket o saat için ≈ 0 planlamış (kısıntı
          kararı); plansız: arıza, bakım, talimat, şebeke ya da panelleri örten kar. Santral verisi gerekmez.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {estimatedLocation && (
          <p className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
            Konum tahmini (~ ilçe merkezi): uydu ışınımı santralin kendi noktası yerine ilçe merkezinden alınıyor; bulutlu günlerde beklenen üretim
            sapabilir, kayıp rakamları kaba tahmindir.
          </p>
        )}
        {s ? (
          <p className="text-sm text-slate-800">
            Son 12 ay ({monthLabel(s.from)} – {monthLabel(s.to)}): potansiyel üretimin <b>%{nf(s.lossPct, 1)}</b> kaybı ={" "}
            {nf(s.plannedLossMwh + s.unplannedLossMwh)} MWh (planlı {nf(s.plannedLossMwh)}, plansız {nf(s.unplannedLossMwh)}). PTF ile karşılığı{" "}
            <b>{tl(s.plannedValueTl + s.unplannedValueTl)}</b>; bunun {tl(s.unplannedValueTl)}&apos;si plansız kayıp (planlı kısıntı çoğunlukla sıfır fiyatlı
            saatte olduğundan parasal karşılığı küçük).
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
                        <p className="text-slate-700">
                          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: LOSS_COLOR.planned }} />
                          Planlı kısıntı {nf(p["Planlı kısıntı"])} MWh
                        </p>
                        <p className="text-slate-700">
                          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: LOSS_COLOR.unplanned }} />
                          Plansız kayıp {nf(p["Plansız kayıp"])} MWh
                        </p>
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
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LOSS_COLOR.unplanned }} /> Plansız kayıp
            </span>
          </div>
        </div>

        {calendar.length > 0 && month && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">
              {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)} takvimi (gün × saat)
              {monthRow ? ` · kayıp %${nf(monthRow.lossPct, 1)}, ${monthRow.plannedHours} planlı ve ${monthRow.unplannedHours} plansız saat` : ""}. Bir güne tıklayın.
            </p>
            <div className="overflow-x-auto">
              <table className="border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th />
                    {HOURS.map((h) => (
                      <th key={h} className="w-5 text-center text-[10px] font-normal text-slate-400">
                        {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calendar.map((row) => (
                    <tr key={row.date} className="cursor-pointer" onClick={() => onDate(row.date)}>
                      <td className={`pr-1 text-right text-[10px] tabular-nums ${row.date === selectedDate ? "font-semibold text-slate-900" : "text-slate-400"}`}>{Number(row.date.slice(8))}</td>
                      {HOURS.map((h) => (
                        <td
                          key={h}
                          title={`${row.date} ${String(h).padStart(2, "0")}:00 · ${STATE_LABEL[row.hours[h]]}`}
                          className={`h-3 w-5 rounded-sm ${row.date === selectedDate ? "ring-1 ring-slate-400" : ""}`}
                          style={{ background: CELL[row.hours[h]] }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-600">
              {(["planned", "unplanned", "normal"] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CELL[k] }} /> {STATE_LABEL[k]}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs leading-relaxed text-slate-500">
          Panel kurulumu verim tahmininde {loss.mount === "takip" ? "tek eksen takip" : loss.mount.replace("sabit-", "sabit ") + "°"} (üretimle en iyi uyan).
          {loss.steadyFrom && loss.steadyFrom > "2024-03-09" ? ` ${loss.steadyFrom} öncesi devreye alma: kayıp sayılmadı.` : ""} Normal verim, güneşli saatlerde
          üretim ÷ uydu ışınımı oranının üst %10&apos;u (ay ve komşu aylar). Plansız kayıp kar örtüsünü (uydu güneşi görür, panel karla kaplı) ve model hatasını da içerebilir (inverter sınırı, panel kurulumu, konum);
          parasal karşılık kayıp MWh × PTF (YEKDEM ya da ikili anlaşma fiyatı değil). Uydu: EUMETSAT SARAH3 (Open-Meteo.com), ≈ 2 gün gecikmeli.
        </p>
      </CardContent>
    </Card>
  );
}
