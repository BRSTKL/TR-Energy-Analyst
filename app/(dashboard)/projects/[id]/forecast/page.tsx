"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ForecastReferenceCard } from "@/components/forecast-reference-card";
import type { ProjectLiveForecast, LivePlantForecast } from "@/lib/services/live-forecast";
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
          <XAxis dataKey="saat" tick={{ fontSize: 11 }} stroke={COLOR.axis} tickLine={false} interval={2} />
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

/** İleriye dönük güneş üretim tahmini (kullanıcı kararı 16.10.2026): yarın ve öbür gün, açık veriyle, geçmiş başarısıyla */
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
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Tahmin yüklenemedi."));
  }, [id]);

  const ok = data?.plants.filter((p) => p.status === "ok") ?? [];
  const selected = ok.find((p) => p.epiasPlantId === plant) ?? null;
  // Hava tahmini yarının GÖP kesiminden (bugün 12:30 Türkiye saati) sonra alındıysa: GÖP teklifi için elde değildi
  const afterCutoff = (() => {
    if (!data?.weatherFetchedAt || !data.days[0]) return false;
    const d = new Date(Date.parse(`${data.days[0]}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    return Date.parse(data.weatherFetchedAt) > Date.parse(`${d}T09:30:00Z`);
  })();
  const sum = (d: number) => (data ? data.total.slice(d * 24, d * 24 + 24).reduce((a: number, v) => a + (v ?? 0), 0) : 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <Link href={`/projects/${id}/results`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-3 w-3" /> Sonuçlar
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Üretim tahmini{data ? ` · ${data.project.name}` : ""}</h1>
        <p className="text-sm text-slate-600">
          Güneş santrallerinin yarın ve öbür gün saat saat beklenen üretimi, herkesin erişebildiği ücretsiz hava tahminiyle (ECMWF). Bir açık referanstır:
          şirketlerin kendi tahmini santral içi veri ve ticari servisle yapılır ve geçmişte genellikle bundan daha iyi tuttu (aşağıda). Geçmişteki kayıp üretim
          (kısıntı, arıza){" "}
          <Link href={`/projects/${id}/losses`} className="underline">
            Kayıp üretim
          </Link>{" "}
          sayfasında.
        </p>
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

      {data && ok.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Portföy: yarın {nf(sum(0), 0)} MWh{data.days[1] ? `, öbür gün ${nf(sum(1), 0)} MWh` : ""}
            </CardTitle>
            <CardDescription>
              Tahmini olan {ok.length} güneş santralinin saatlik toplamı (MWh, Türkiye saati). Rüzgâr ve hidro henüz yok.
              {afterCutoff && (
                <span className="mt-1 block text-amber-700">
                  Hava tahmini bugün 12:30&apos;dan (yarının GÖP kapanışı) sonra alındı: yarın için GÖP teklifinde elde olmayan bilgi içerir; GİP ve bilgi amaçlıdır.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HourlyChart hours={data.total} days={data.days} />
          </CardContent>
        </Card>
      )}

      {data && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Güneş santralleri</CardTitle>
            <CardDescription>
              {data.plants.length
                ? `${data.plants.length} güneş santrali; ${ok.length} tanesi için tahmin var.`
                : "Bu projede güneş santrali yok. Rüzgâr için tahmin henüz yok (Aşama 15.7)."}
            </CardDescription>
          </CardHeader>
          {data.plants.length > 0 && (
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Santral</TableHead>
                    <TableHead>Konum</TableHead>
                    <TableHead className="text-right">Yarın, MWh</TableHead>
                    {data.days[1] && <TableHead className="text-right">Öbür gün, MWh</TableHead>}
                    <TableHead className="text-right">En yüksek saat</TableHead>
                    <TableHead>Eğitim</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.plants.map((p) => {
                    const isSel = selected?.epiasPlantId === p.epiasPlantId && p.status === "ok";
                    return (
                      <TableRow key={`${p.epiasPlantId}-${p.name}`} className={isSel ? "bg-blue-50/60" : undefined}>
                        <TableCell className="font-medium">
                          {p.name}
                          {p.warning && <div className="text-[11px] font-normal text-amber-700">{p.warning}</div>}
                        </TableCell>
                        <TableCell className={p.locationSource ? "text-xs tabular-nums text-slate-600" : "text-xs text-slate-400"}>{p.locationText}</TableCell>
                        {p.status === "ok" ? (
                          <>
                            <TableCell className="text-right tabular-nums">{nf(p.daily![0])}</TableCell>
                            {data.days[1] && <TableCell className="text-right tabular-nums">{nf(p.daily![1])}</TableCell>}
                            <TableCell className="text-right tabular-nums">{nf(p.peakMwh!)}</TableCell>
                            <TableCell className="text-xs text-slate-500">
                              {p.train!.from.slice(0, 7)} – {p.train!.to.slice(0, 7)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant={isSel ? "default" : "outline"} onClick={() => setPlant(p.epiasPlantId)}>
                                Göster
                              </Button>
                            </TableCell>
                          </>
                        ) : (
                          <TableCell colSpan={data.days[1] ? 5 : 4} className="text-xs text-slate-400">
                            {STATUS[p.status]}
                            {p.message ? `: ${p.message}` : ""}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {selected && data && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selected.name}: yarın {nf(selected.daily![0])} MWh{data.days[1] ? `, öbür gün ${nf(selected.daily![1])} MWh` : ""}
            </CardTitle>
            <CardDescription>
              Eğitim {selected.train!.from} – {selected.train!.to} ({selected.train!.hours} saat, panel kurulumu {selected.train!.mount}); en yüksek saat eğitimdeki
              en yüksek üretimle ({nf(selected.train!.maxMwh)} MWh) sınırlı. Konum {selected.locationText}
              {selected.locationText.startsWith("~") ? " (ilçe merkezi tahmini: sonuç kaba)" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HourlyChart hours={selected.hours!} days={data.days} />
          </CardContent>
        </Card>
      )}

      {data?.reference && data.reference.rows.length > 0 && (
        <ForecastReferenceCard period={data.reference.period} rows={data.reference.rows} summary={data.reference.summary} />
      )}

      {data && (
        <p className="text-xs leading-relaxed text-slate-500">
          Nasıl: her santral için donmuş model sürüm 3 (panel düzlemi ışınımı × verim; uyduyla kısıntı ve arıza saatleri eğitimden çıkarılmış), havuzdaki son tam
          üretim ayından önceki 4 ayla eğitilir; girdi ECMWF IFS 0,25° tahmininin en yeni çalışmasıdır
          {data.weatherFetchedAt ? ` (alındığı an ${new Date(data.weatherFetchedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}, 3 saatte bir yenilenir)` : ""}. 48 saat
          önceki üretim kullanılmaz (kamu verisi aylık yayımlanır). Planlı kısıntı, arıza ve talimat tahmin edilmez: tahmin, santralin normal çalıştığı
          varsayımıyladır. Hava verisi: Open-Meteo.com (CC-BY 4.0), ECMWF.
        </p>
      )}
    </div>
  );
}
