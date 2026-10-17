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
import type { HourLossState, PlantLoss } from "@/lib/services/production-loss";
import { ProductionLossCard } from "@/components/production-loss-card";
import { WindLossCard } from "@/components/wind-loss-card";
import { WindDayChart } from "@/components/wind-day-chart";
import type { ProjectWindPlant, WindDay, WindPlantLoss } from "@/lib/services/wind-loss";

interface LossResponse {
  project: { id: string; name: string };
  plants: ProjectWeatherPlant[];
  day: WeatherDay | null;
  dayError: string | null;
  loss: PlantLoss | null;
  calendar: Array<{ date: string; hours: HourLossState[] }>;
}

interface WindResponse {
  plants: ProjectWindPlant[];
  loss: WindPlantLoss | null;
  calendar: Array<{ date: string; hours: HourLossState[] }>;
  day: WindDay | null;
}

/**
 * PLAN 20.3: projenin güneş santralleri için uyduyla kayıp üretim (planlı kısıntı, plansız kayıp) ve günün saatleri.
 * Eski adı "Üretim tahmini"ydi (Aşama 15); kullanıcı kararı 16.10.2026: bu sayfa kayıp üretim, ileriye dönük tahmin
 * ayrı sayfa (/projects/[id]/forecast) ve açık referans kıyası orada. Rüzgâr santralleri (kullanıcı kararı 17.10.2026)
 * geçmiş rüzgâr ve santralin güç eğrisiyle; güneş ve rüzgâr ayrı alt başlıkta (?tab=gunes / ruzgar).
 */
export default function LossPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<LossResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plant, setPlant] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wind, setWind] = useState<WindResponse | null>(null);
  const [windError, setWindError] = useState<string | null>(null);
  const [windPlant, setWindPlant] = useState<number | null>(null);
  const [windDate, setWindDate] = useState<string | null>(null);
  const [windLoading, setWindLoading] = useState(false);
  // Alt başlık: güneş / rüzgâr (adres çubuğunda ?tab=ruzgar; seçilmediyse santrali olan ilk teknoloji)
  const [tab, setTab] = useState<"GES" | "RES" | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "ruzgar") setTab("RES");
    else if (t === "gunes") setTab("GES");
  }, []);
  const chooseTab = (t: "GES" | "RES") => {
    setTab(t);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", t === "RES" ? "ruzgar" : "gunes");
    window.history.replaceState(null, "", u.toString());
  };

  useEffect(() => {
    const q = new URLSearchParams();
    if (windPlant) q.set("plant", String(windPlant));
    if (windDate) q.set("date", windDate);
    setWindLoading(true);
    fetch(`/api/projects/${id}/wind-losses?${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setWind(d);
        setWindError(null);
      })
      .catch((e) => setWindError(e instanceof Error ? e.message : "Rüzgâr verisi yüklenemedi."))
      .finally(() => setWindLoading(false));
  }, [id, windPlant, windDate]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (plant) q.set("plant", String(plant));
    if (date) q.set("date", date);
    setLoading(true);
    fetch(`/api/projects/${id}/losses?${q}`)
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
  const active: "GES" | "RES" = tab ?? (data && data.plants.length === 0 && (wind?.plants.length ?? 0) > 0 ? "RES" : "GES");
  const tabs = [
    { id: "GES" as const, label: "Güneş", count: data?.plants.length ?? null },
    { id: "RES" as const, label: "Rüzgâr", count: wind?.plants.length ?? null },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <Link href={`/projects/${id}/results`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-3 w-3" /> Sonuçlar
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Kayıp üretim{data ? ` · ${data.project.name}` : ""}</h1>
        <p className="text-sm text-slate-600">
          Santrallerin geçmişte üretebileceği ile ürettiği arasındaki fark, santral verisi olmadan: üretebileceği güneşte uydunun ölçtüğü ışınımdan, rüzgârda
          geçmiş rüzgârdan; ürettiği EPİAŞ&apos;tan. Kayıp, planlı kısıntı (şirket o saat için ≈ 0 planlamış) ve plansız kayıp (arıza, bakım, talimat, şebeke, kar) olarak
          ayrılır. Bu bir ölçümdür, tahmin değil; yarının beklenen üretimi{" "}
          <Link href={`/projects/${id}/forecast`} className="underline">
            Üretim tahmini
          </Link>{" "}
          sayfasında. Santral seçip takvimden gün seçin.
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => chooseTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${active === t.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
            {t.count !== null && <span className="ml-1.5 text-xs font-normal text-slate-400">{t.count}</span>}
          </button>
        ))}
      </div>

      {active === "GES" && (
        <>
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
                    : "Bu projede güneş santrali yok."}
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
                  Bu projenin güneş santrallerinin {located ? "hava verisi henüz çekilmedi" : "konumu henüz girilmedi"}. Kayıp ölçümü için önce santralin konumu gerekir:
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
                <CardDescription>Uyduya göre beklenen üretim ölçüm içindir; grafikteki ışınım tahmini yalnız bilgi için (tahmin modelinin girdisi).</CardDescription>
              </CardHeader>
              <CardContent>
                <WeatherDayChart day={data.day} loading={loading} onDate={setDate} />
              </CardContent>
            </Card>
          )}
          {data?.dayError && <p className="text-sm text-amber-800">{data.dayError}</p>}
        </>
      )}

      {active === "RES" && (
        <>
          {windError && <p className="text-sm text-amber-800">{windError}</p>}
          {!wind && !windError && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
            </div>
          )}
          {wind && wind.plants.length === 0 && <p className="text-sm text-slate-500">Bu projede rüzgâr santrali yok.</p>}
          {wind && wind.plants.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Rüzgâr santralleri</CardTitle>
                <CardDescription>
                  {wind.plants.length} rüzgâr santrali; {wind.plants.filter((p) => p.locationSource !== null).length} tanesinin konumu var,{" "}
                  {wind.plants.filter((p) => p.windYears.length > 0).length} tanesinin rüzgâr verisi çekildi. Güneşten temkinli: plansız kayıp yalnız iki hava kaynağının
                  birlikte bulduğu uzun düşüşlerde sayılır; hava verisinin üretimi iyi açıklamadığı santralde rakam gösterilmez.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Santral</TableHead>
                      <TableHead>Şirket</TableHead>
                      <TableHead>Konum</TableHead>
                      <TableHead>Rüzgâr verisi</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wind.plants.map((p) => {
                      const has = p.epiasPlantId !== null && p.windYears.length > 0;
                      const selected = has && wind.day?.plant.epiasPlantId === p.epiasPlantId;
                      return (
                        <TableRow key={`${p.epiasPlantId}-${p.name}`} className={selected ? "bg-blue-50/60" : undefined}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-slate-600">{p.organizationName ?? "–"}</TableCell>
                          <TableCell className={p.locationSource ? "tabular-nums" : "text-slate-400"}>{p.locationText}</TableCell>
                          <TableCell className={has ? "" : "text-slate-400"}>{has ? p.windYears.join(", ") : "yok"}</TableCell>
                          <TableCell className="text-right">
                            {has && (
                              <Button
                                size="sm"
                                variant={selected ? "default" : "outline"}
                                onClick={() => {
                                  setWindPlant(p.epiasPlantId);
                                  setWindDate(null);
                                }}
                              >
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
            </Card>
          )}
          {wind && wind.plants.length > 0 && !wind.plants.some((p) => p.windYears.length > 0) && (
            <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
              <CardContent className="space-y-2 p-4 text-sm text-slate-700">
                <p>Bu projenin rüzgâr santrallerinin {wind.plants.some((p) => p.locationSource) ? "rüzgâr verisi henüz çekilmedi" : "konumu henüz girilmedi"}.</p>
                <p className="text-xs text-slate-500">
                  Komutlar: <code>scripts/location-autofill.mts --gem --res</code> (Global Energy Monitor kaydı) ya da <code>scripts/plant-location.mts set</code>, sonra{" "}
                  <code>scripts/wind-sync.mts</code>.
                </p>
              </CardContent>
            </Card>
          )}
          {wind?.loss && wind.day && (
            <WindLossCard
              name={wind.day.plant.name}
              loss={wind.loss}
              calendar={wind.calendar}
              selectedDate={wind.day.date}
              onDate={setWindDate}
              estimatedLocation={wind.day.location.text.startsWith("~")}
            />
          )}
          {wind?.day && wind.loss && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{wind.day.plant.name}: günün üretimi, beklenen üretim ve rüzgâr</CardTitle>
                <CardDescription>Rüzgâra göre beklenen üretim geçmiş analizi içindir, tahmin değildir.</CardDescription>
              </CardHeader>
              <CardContent>
                <WindDayChart day={wind.day} loading={windLoading} onDate={setWindDate} showLoss={wind.loss.reliable} />
              </CardContent>
            </Card>
          )}
        </>
      )}

    </div>
  );
}
