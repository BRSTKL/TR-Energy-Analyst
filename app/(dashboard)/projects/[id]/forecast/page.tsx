"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ForecastReferenceCard } from "@/components/forecast-reference-card";
import { ForecastScorecardCard } from "@/components/forecast-scorecard-card";
import type { ProjectLiveForecast, LivePlantForecast } from "@/lib/solar-engine/forecast";
import type { ReferenceRow, ReferenceSummary } from "@/lib/services/production-loss";

interface ForecastResponse extends ProjectLiveForecast {
  reference: { period: { from: string; to: string }; generatedAt: string; rows: ReferenceRow[]; summary: ReferenceSummary | null } | null;
}

/** Piyasa sayfasıyla aynı: yarın vurgulu mavi, öbür gün gri */
const COLOR = { day1: "#2a78d6", day2: "#b4b2a9", grid: "#e2e8f0", axis: "#64748b" };
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const dayLabel = (d: string, i: number) => `${i === 0 ? "Yarın" : "Öbür gün"} (${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]})`;
const STATUS: Record<LivePlantForecast["status"], string> = {
  ok: "",
  "no-location": "konum yok",
  unlicensed: "lisanssız toplam: tek konumla tahmin edilmez",
  "no-data": "eğitim verisi yok",
  error: "hata",
};

function HourlyChart({ hours, days }: { hours: Array<number | null>; days: string[] }) {
  const rows = Array.from({ length: 24 }, (_, h) => ({
    saat: `${String(h).padStart(2, "0")}:00`,
    d1: hours[h] ?? null,
    d2: hours[24 + h] ?? null,
  }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={COLOR.grid} />
          <XAxis dataKey="saat" tick={{ fontSize: 11 }} stroke={COLOR.axis} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={{ fontSize: 11 }} stroke={COLOR.axis} tickLine={false} axisLine={false} width={48} domain={[0, "auto"]} />
          <Tooltip formatter={(v: unknown) => (v === null || v === undefined ? "–" : `${nf(Number(v))} MWh`)} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-slate-600">{v}</span>} />
          <Line name={dayLabel(days[0], 0)} dataKey="d1" stroke={COLOR.day1} strokeWidth={2} dot={false} isAnimationActive={false} />
          {days[1] && <Line name={dayLabel(days[1], 1)} dataKey="d2" stroke={COLOR.day2} strokeWidth={2} dot={false} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Özet kutusu: büyük sayı, altında küçük açıklama (sektör kayıp kartıyla aynı düzen) */
function StatBox({ label, value, unit, sub }: { label: string; value: string; unit: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 p-2.5 sm:p-3">
      <p className="text-xs font-medium leading-tight text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 sm:text-2xl">
        {value}
        <span className="ml-1 text-xs font-normal text-slate-500 sm:text-sm">{unit}</span>
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const hourText = (h: number) => `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`;
const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/**
 * İleriye dönük güneş üretim tahmini (kullanıcı kararı 16.10.2026): yarın ve öbür gün, açık veriyle, geçmiş başarısıyla.
 * Düzen (kullanıcı 19.10.2026: "çok karışık"): özet kutuları → tek grafik (portföy ya da seçilen santral) → sade santral
 * tablosu → "Ne kadar tutuyor?" (karne ve geçmiş başarı, kapalı) → "Nasıl hesaplandı?" (kapalı).
 */
export default function ForecastPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plant, setPlant] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${id}/forecast`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Tahmin yüklenemedi."));
  }, [id]);

  const ok = data?.plants.filter((p) => p.status === "ok") ?? [];
  const missing = data?.plants.filter((p) => p.status !== "ok") ?? [];
  const selected = ok.find((p) => p.epiasPlantId === plant) ?? null;
  // Hava tahmini yarının GÖP kesiminden (bugün 12:30 Türkiye saati) sonra alındıysa: GÖP teklifi için elde değildi
  const afterCutoff = (() => {
    if (!data?.weatherFetchedAt || !data.days[0]) return false;
    const d = new Date(Date.parse(`${data.days[0]}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    return Date.parse(data.weatherFetchedAt) > Date.parse(`${d}T09:30:00Z`);
  })();
  const shown = selected?.hours ?? data?.total ?? [];
  const daySum = (hours: Array<number | null>, d: number) => hours.slice(d * 24, d * 24 + 24).reduce((a: number, v) => a + (v ?? 0), 0);
  const peak = (() => {
    const day = shown.slice(0, 24);
    let h = 0;
    day.forEach((v, i) => {
      if ((v ?? 0) > (day[h] ?? 0)) h = i;
    });
    return { h, v: day[h] ?? 0 };
  })();
  const fetchedAt = data?.weatherFetchedAt ? new Date(data.weatherFetchedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", day: "numeric", month: "long" }) : null;
  const ref = data?.reference?.summary ?? null;
  const ym = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <Link href={`/projects/${id}/results`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-3 w-3" /> Sonuçlar
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Üretim tahmini{data ? ` · ${data.project.name}` : ""}</h1>
        <p className="text-sm text-slate-600">Güneş santrallerinin yarın ve öbür gün saat saat beklenen üretimi.</p>
      </div>

      {error && (
        <Card className="shadow-sm">
          <CardContent className="p-4 text-sm text-amber-800">{error}</CardContent>
        </Card>
      )}
      {!data && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Model kuruluyor ve hava tahmini alınıyor…
        </div>
      )}
      {data && data.plants.length === 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-4 text-sm text-slate-600">Bu projede güneş santrali yok. Rüzgâr ve hidro için tahmin henüz yok.</CardContent>
        </Card>
      )}

      {data && ok.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{selected ? selected.name : `Portföy · ${ok.length} güneş santrali`}</CardTitle>
              <select
                aria-label="Gösterilen"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                value={plant ?? ""}
                onChange={(e) => setPlant(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Portföy (toplam)</option>
                {ok.map((p) => (
                  <option key={p.epiasPlantId} value={p.epiasPlantId!}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {afterCutoff && (
              <CardDescription className="text-amber-700">
                Hava tahmini bugün 12:30&apos;dan sonra alındı: yarının gün öncesi teklifi için geç; gün içi piyasa ve bilgi amaçlı.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatBox label={`Yarın, ${shortDay(data.days[0])}`} value={nf(daySum(shown, 0), 0)} unit="MWh" />
              {data.days[1] && <StatBox label={`Öbür gün, ${shortDay(data.days[1])}`} value={nf(daySum(shown, 1), 0)} unit="MWh" />}
              <StatBox label="Yarın en yüksek" value={nf(peak.v, 0)} unit="MWh" sub={hourText(peak.h)} />
            </div>
            <HourlyChart hours={shown} days={data.days} />
            {selected?.locationText.startsWith("~") && <p className="text-xs text-amber-700">Bu santralin konumu ilçe merkezi tahmini: sonuç kaba.</p>}
          </CardContent>
        </Card>
      )}

      {data && ok.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Santraller</CardTitle>
            <CardDescription>Satıra tıklayınca grafikte o santral gösterilir.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Santral</TableHead>
                  <TableHead className="text-right">Yarın, MWh</TableHead>
                  {data.days[1] && <TableHead className="text-right">Öbür gün, MWh</TableHead>}
                  <TableHead className="text-right">En yüksek saat, MWh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...ok]
                  .sort((a, b) => b.daily![0] - a.daily![0])
                  .map((p) => {
                    const isSel = selected?.epiasPlantId === p.epiasPlantId;
                    return (
                      <TableRow
                        key={`${p.epiasPlantId}-${p.name}`}
                        className={`cursor-pointer ${isSel ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
                        onClick={() => setPlant(isSel ? null : p.epiasPlantId)}
                      >
                        <TableCell className="font-medium">
                          {p.name}
                          {p.locationText.startsWith("~") && (
                            <span className="ml-1 text-xs font-normal text-slate-400" title="Konum ilçe merkezi tahmini">
                              ~
                            </span>
                          )}
                          {p.warning && <div className="text-[11px] font-normal text-amber-700">Eğitim verisi az: tahmin kaba</div>}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{nf(p.daily![0])}</TableCell>
                        {data.days[1] && <TableCell className="text-right tabular-nums text-slate-600">{nf(p.daily![1])}</TableCell>}
                        <TableCell className="text-right tabular-nums text-slate-600">{nf(p.peakMwh!)}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
            {missing.length > 0 && (
              <p className="px-6 py-3 text-xs text-slate-500">
                Tahmin dışı: {missing.map((p) => `${p.name} (${STATUS[p.status]})`).join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {data && ok.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <summary className="cursor-pointer text-base font-semibold text-slate-900">Ne kadar tutuyor?</summary>
          <div className="mt-3 space-y-4">
            {ref && data.reference && (
              <p className="text-sm text-slate-700">
                Geçmişte ({ym(data.reference.period.from)} – {ym(data.reference.period.to)}) {ref.plants} güneş santralinde (kısıntı ve arıza saatleri hariç) bu tahminle dengesizlik maliyeti{" "}
                <b>{nf(ref.liveTlPerMwh)} TL/MWh</b>, şirketlerin kendi planıyla <b>{nf(ref.kgupTlPerMwh)} TL/MWh</b>; model {ref.liveWins} santralde şirketten iyi.
                Şirketler santral içi veri ve ticari tahmin servisi kullanır; bu sayfa bağımsız bir açık referanstır.
              </p>
            )}
            <ForecastScorecardCard projectId={id} />
            {data.reference && data.reference.rows.length > 0 && (
              // Özet cümlesi yukarıda: kartın kendi özet paragrafı tekrar etmesin
              <ForecastReferenceCard period={data.reference.period} rows={data.reference.rows} summary={null} />
            )}
          </div>
        </details>
      )}

      {data && ok.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-600 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Nasıl hesaplandı?</summary>
          <div className="mt-2 space-y-2">
            <p>
              Her santral için model, santralin son 4 aydaki üretimini o günlerin hava tahminiyle eşleştirerek &quot;şu kadar güneşte şu kadar üretir&quot;
              ilişkisini öğrenir (panel düzlemine düşen ışınım × verim; uyduyla bulunan kısıntı ve arıza saatleri eğitimden çıkarılır). Sonra ECMWF&apos;nin en yeni
              hava tahminiyle yarını hesaplar{fetchedAt ? ` (hava tahmini ${fetchedAt}'de alındı, 3 saatte bir yenilenir)` : ""}. Planlı kısıntı, arıza ve
              talimat tahmin edilmez: santralin normal çalıştığı varsayılır. Geçmiş kayıp üretim{" "}
              <Link href={`/projects/${id}/losses`} className="underline">
                Kayıp üretim
              </Link>{" "}
              sayfasında. Hava verisi: Open-Meteo.com (CC BY 4.0), ECMWF.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Santral</TableHead>
                    <TableHead>Konum</TableHead>
                    <TableHead>Eğitim dönemi</TableHead>
                    <TableHead className="text-right">Eğitim saati</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ok.map((p) => (
                    <TableRow key={`t-${p.epiasPlantId}`}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="tabular-nums">{p.locationText}</TableCell>
                      <TableCell>
                        {p.train!.from} – {p.train!.to}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.train!.hours.toLocaleString("tr-TR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
