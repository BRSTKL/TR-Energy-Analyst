"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WeatherDayChart } from "@/components/weather-day-chart";
import type { ProjectWeatherPlant, WeatherDay } from "@/lib/services/weather-preview";
import type { HourLossState, PlantLoss, ReferenceRow } from "@/lib/services/production-loss";
import { ProductionLossCard } from "@/components/production-loss-card";
import { ForecastReferenceCard } from "@/components/forecast-reference-card";

interface ForecastResponse {
  project: { id: string; name: string };
  plants: ProjectWeatherPlant[];
  day: WeatherDay | null;
  dayError: string | null;
  loss: PlantLoss | null;
  calendar: Array<{ date: string; hours: HourLossState[] }>;
  reference: { period: { from: string; to: string }; generatedAt: string; rows: ReferenceRow[] } | null;
}

/** PLAN 15 / 20.3: projenin güneş santralleri için hava verisi, uyduyla kayıp üretim ve açık tahmin referansı */
export default function ForecastPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plant, setPlant] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams();
    if (plant) q.set("plant", String(plant));
    if (date) q.set("date", date);
    setLoading(true);
    fetch(`/api/projects/${id}/forecast?${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Veri yüklenemedi."))
      .finally(() => setLoading(false));
  }, [id, plant, date]);

  const ready = data?.plants.filter((p) => p.epiasPlantId !== null && p.weatherYears.length > 0) ?? [];
  const located = data?.plants.filter((p) => p.locationSource !== null).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <Link href={`/projects/${id}/results`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-3 w-3" /> Sonuçlar
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Üretim tahmini{data ? ` · ${data.project.name}` : ""}</h1>
        <p className="text-sm text-slate-600">
          Güneş santralleri için açık veriyle iki çıktı: santralin uyduyla ölçülen kayıp üretimi (planlı kısıntı ve plansız kayıp) ve ücretsiz hava
          tahminiyle kurulan modelin şirketin ilk KGÜP&apos;üyle maliyet kıyası (açık referans). Santral seçip gün ya da takvimden gün seçin.
        </p>
      </div>

      {error && (
        <Card className="shadow-sm">
          <CardContent className="p-4 text-sm text-amber-800">{error}</CardContent>
        </Card>
      )}
      {!data && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      )}

      {data && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Güneş santralleri</CardTitle>
            <CardDescription>
              {data.plants.length
                ? `${data.plants.length} güneş santrali; ${located} tanesinin konumu var, ${ready.length} tanesinin hava verisi çekildi.`
                : "Bu projede güneş santrali yok. Rüzgâr santralleri Aşama 15.7'de eklenecek."}
            </CardDescription>
          </CardHeader>
          {data.plants.length > 0 && (
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Santral</TableHead>
                    <TableHead>Şirket</TableHead>
                    <TableHead>Konum</TableHead>
                    <TableHead>Hava verisi</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.plants.map((p) => {
                    const has = p.epiasPlantId !== null && p.weatherYears.length > 0;
                    const selected = has && data.day?.plant.epiasPlantId === p.epiasPlantId;
                    return (
                      <TableRow key={`${p.epiasPlantId}-${p.name}`} className={selected ? "bg-blue-50/60" : undefined}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-slate-600">{p.organizationName ?? "–"}</TableCell>
                        <TableCell className={p.locationSource ? "tabular-nums" : "text-slate-400"}>{p.locationText}</TableCell>
                        <TableCell className={has ? "" : "text-slate-400"}>{has ? p.weatherYears.join(", ") : "yok"}</TableCell>
                        <TableCell className="text-right">
                          {has && (
                            <Button size="sm" variant={selected ? "default" : "outline"} onClick={() => setPlant(p.epiasPlantId)}>
                              Göster
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {data && data.plants.length > 0 && !ready.length && (
        <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
          <CardContent className="space-y-2 p-4 text-sm text-slate-700">
            <p>
              Bu projenin güneş santrallerinin {located ? "hava verisi henüz çekilmedi" : "konumu henüz girilmedi"}. Tahmin için önce santralin konumu gerekir:
              EPİAŞ&apos;ta konum yok; konum OpenStreetMap ya da Global Energy Monitor kaydından bulunur ve elle doğrulanır. Ardından o konum için hava verisi
              çekilir.
            </p>
            <p className="text-xs text-slate-500">
              Komutlar: <code>scripts/plant-location.mts set &lt;EPİAŞ kimliği&gt; &lt;enlem&gt; &lt;boylam&gt; USER &quot;&lt;kaynak&gt;&quot;</code>, sonra{" "}
              <code>scripts/weather-sync.mts</code>.
            </p>
          </CardContent>
        </Card>
      )}

      {data?.loss && data.day && (
        <ProductionLossCard name={data.day.plant.name} loss={data.loss} calendar={data.calendar} selectedDate={data.day.date} onDate={setDate} estimatedLocation={data.day.location.text.startsWith("~")} />
      )}

      {data?.day && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{data.day.plant.name}: günün üretimi, beklenen üretim ve ışınım</CardTitle>
            <CardDescription>Uyduya göre beklenen üretim ölçüm içindir; ışınım tahmini modelin girdisidir.</CardDescription>
          </CardHeader>
          <CardContent>
            <WeatherDayChart day={data.day} loading={loading} onDate={setDate} />
          </CardContent>
        </Card>
      )}
      {data?.dayError && <p className="text-sm text-amber-800">{data.dayError}</p>}

      {data?.reference && data.reference.rows.length > 0 && <ForecastReferenceCard period={data.reference.period} rows={data.reference.rows} />}
    </div>
  );
}
