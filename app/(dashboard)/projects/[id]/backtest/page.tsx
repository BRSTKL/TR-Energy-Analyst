"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BacktestResult, StrategyBacktest } from "@/lib/analysis/backtest";

interface PlantBacktest {
  plantId: string;
  plantName: string;
  plantType: string;
  result: BacktestResult;
}

interface Scenario {
  label: string;
  portfolio: BacktestResult | null;
  plants: PlantBacktest[];
}

interface BacktestResponse {
  success: boolean;
  error?: string;
  project: { id: string; name: string };
  trainMonths: number;
  scenarios: { project: Scenario; rules2026: Scenario };
}

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const monthLabel = (m: string) => `${MONTHS_TR[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const tl = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("tr-TR")} ₺`;
const pct = (v: number) => `${v < 0 ? "−" : ""}%${Math.abs(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
const tone = (v: number) => (v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-700" : "text-slate-500");

export default function BacktestPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [data, setData] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarioKey, setScenarioKey] = useState<"project" | "rules2026">("project");
  const [scope, setScope] = useState<string>("portfolio");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/backtest`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: BacktestResponse) => {
        if (cancelled) return;
        if (!d.success) setError(d.error || "Geriye dönük test çalıştırılamadı.");
        else setData(d);
      })
      .catch(() => !cancelled && setError("Geriye dönük test çalıştırılamadı."));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const scenario = data?.scenarios[scenarioKey];
  const selectedPlant = scenario?.plants.find((p) => p.plantId === scope);
  const result = scope === "portfolio" ? scenario?.portfolio : selectedPlant?.result;

  const verdict = useMemo(() => {
    if (!result) return null;
    // Yalnızca teklif miktarını ayarlayan kurallar (GİP ve gün içi kalıcılık kuralları ayrı değerlendirilir)
    const learned = result.strategies.filter((s) => !s.id.startsWith("gip-") && !s.id.startsWith("persistence-"));
    const best = learned.reduce<StrategyBacktest | null>(
      (b, s) => (!b || s.outOfSampleSavingTl > b.outOfSampleSavingTl ? s : b),
      null
    );
    return best;
  }, [result]);

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs">
            <Link href={`/projects/${projectId}/results`} className="flex items-center gap-1 text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-3 w-3" /> Sonuçlar
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-slate-700">{data?.project.name ?? ""}</span>
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            <FlaskConical className="h-6 w-6 text-indigo-600" /> Geriye Dönük Test
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Her kural, test edilen ayı görmeden yalnızca önceki {data?.trainMonths ?? 4} ayın verisinden öğrenilir ve o
            ayda uygulanır. &quot;Aynı dönem&quot; sütunu kuralın test aylarının kendisinden öğrenildiği iyimser
            referanstır; ikisi arasındaki fark, geçmişe bakarak bulunan kazancın ileriye ne kadar taşındığını gösterir.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {!data && !error && <p className="text-sm text-slate-500">Test çalıştırılıyor...</p>}

        {data && scenario && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["portfolio", "Tüm Portföy"],
                    ...scenario.plants.map((p) => [p.plantId, p.plantName]),
                  ] as [string, string][]
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={scope === id ? "default" : "outline"}
                    onClick={() => setScope(id)}
                    className={scope === id ? "bg-indigo-600 text-white hover:bg-indigo-700" : ""}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Fiyat kuralları:
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  value={scenarioKey}
                  onChange={(e) => setScenarioKey(e.target.value as "project" | "rules2026")}
                >
                  <option value="project">{data.scenarios.project.label}</option>
                  <option value="rules2026">{data.scenarios.rules2026.label}</option>
                </select>
              </label>
            </div>

            {!result || result.testMonths.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center text-sm text-slate-600">
                  Test için yeterli veri yok: bir ayın test edilebilmesi için önceki {data.trainMonths} ayın tamamında
                  veri gerekir.
                </CardContent>
              </Card>
            ) : (
              <>
                {verdict && (
                  <div
                    className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                      verdict.outOfSampleSavingPercent >= 1
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Teklif miktarını ayarlayan kurallar arasında en iyisi <strong>{verdict.label}</strong>: görmediği
                      aylarda {tl(verdict.outOfSampleSavingTl)} ({pct(verdict.outOfSampleSavingPercent)}), {verdict.testMonths}{" "}
                      ayın {verdict.positiveMonths} tanesinde kazançlı.{" "}
                      {verdict.outOfSampleSavingPercent < 1
                        ? "Kazanç maliyetin %1'inin altında; teklif ayarı bu veride güçlü bir kaldıraç değil."
                        : "Kazancı gerçek teklife taşımadan önce KÜPST etkisini de değerlendirin."}
                    </span>
                  </div>
                )}

                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Kurallar</CardTitle>
                    <CardDescription>
                      Test ayları: {monthLabel(result.testMonths[0])} – {monthLabel(result.testMonths[result.testMonths.length - 1])}{" "}
                      · Bu aylardaki dengesizlik maliyeti: {tl(result.baselineCostTl)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                          <th className="py-2 pr-3">Kural</th>
                          <th className="py-2 pr-3 text-right">Geriye dönük test</th>
                          <th className="py-2 pr-3 text-right">Aynı dönem (iyimser)</th>
                          <th className="py-2 pr-3 text-right">Kazançlı ay</th>
                          <th className="py-2 pr-3 text-right">En kötü ay</th>
                          {scope !== "portfolio" && <th className="py-2 text-right">Gelecek ay için</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {result.strategies.map((s) => (
                          <tr key={s.id} className="border-b align-top last:border-0">
                            <td className="py-3 pr-3">
                              <div className="font-medium text-slate-900">{s.label}</div>
                              <div className="mt-0.5 max-w-md text-xs text-slate-500">{s.description}</div>
                            </td>
                            <td className={`py-3 pr-3 text-right font-semibold ${tone(s.outOfSampleSavingTl)}`}>
                              {tl(s.outOfSampleSavingTl)}
                              <div className="text-xs font-normal">{pct(s.outOfSampleSavingPercent)}</div>
                            </td>
                            <td className={`py-3 pr-3 text-right ${tone(s.inSampleSavingTl)}`}>
                              {tl(s.inSampleSavingTl)}
                              <div className="text-xs">{pct(s.inSampleSavingPercent)}</div>
                            </td>
                            <td className="py-3 pr-3 text-right text-slate-700">
                              {s.positiveMonths} / {s.testMonths}
                            </td>
                            <td className={`py-3 pr-3 text-right ${tone(s.worstMonth?.savingTl ?? 0)}`}>
                              {s.worstMonth ? (
                                <>
                                  {tl(s.worstMonth.savingTl)}
                                  <div className="text-xs text-slate-500">{monthLabel(s.worstMonth.month)}</div>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            {scope !== "portfolio" && (
                              <td className="py-3 text-right font-mono text-xs text-slate-700">{s.nextMonthParams}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Aylık tasarruf (geriye dönük test)</CardTitle>
                    <CardDescription>Pozitif: kural o ayda maliyeti azalttı · Negatif: artırdı</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-xs">
                      <thead>
                        <tr className="border-b text-slate-500">
                          <th className="py-2 pr-3 text-left">Kural</th>
                          {result.testMonths.map((m) => (
                            <th key={m} className="py-2 px-1 text-right font-medium">
                              {monthLabel(m)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.strategies.map((s) => (
                          <tr key={s.id} className="border-b last:border-0">
                            <td className="py-2 pr-3 font-medium text-slate-800">{s.label}</td>
                            {result.testMonths.map((m) => {
                              const mr = s.months.find((x) => x.month === m);
                              return (
                                <td
                                  key={m}
                                  className={`px-1 py-2 text-right tabular-nums ${tone(mr?.savingTl ?? 0)}`}
                                  title={mr?.params}
                                >
                                  {mr ? `${mr.savingTl < 0 ? "−" : ""}${Math.abs(Math.round(mr.savingTl / 1000)).toLocaleString("tr-TR")}k` : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-slate-50/60 shadow-none">
                  <CardContent className="space-y-1.5 p-4 text-xs leading-relaxed text-slate-600">
                    <p>
                      <strong>Sınırlamalar.</strong> Tek yıllık veriyle yalnızca {result.testMonths.length} ay test
                      edilebiliyor; mevsimsel örüntüler (özellikle HES) öğrenilemez. Portföy satırı santral sonuçlarının
                      toplamıdır, DSG netleştirmesi uygulanmaz.
                    </p>
                    <p>
                      Teklif ayarı, santralin en iyi tahmininden bilerek sapmak demektir; lisanslı santrallerde KÜPST
                      maliyetini artırabilir ve bu tabloda yer almaz. GİP kuralında öğrenilen parametre yoktur;
                      kapatılan payın gün içinde öngörülebildiği varsayılır.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
