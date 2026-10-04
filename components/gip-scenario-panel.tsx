"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RealisticClosingResult } from "@/lib/analysis/intraday-arbitrage";

interface PersistenceResponse {
  success: boolean;
  available?: boolean;
  error?: string;
  testMonths?: string[];
  strategies?: Array<{
    id: string;
    label: string;
    outOfSampleSavingTl: number;
    outOfSampleSavingPercent: number;
    positiveMonths: number;
    testMonths: number;
  }>;
  nextMonth?: Array<{ plantName: string; params: Record<string, string> }>;
}

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const monthLabel = (m: string) => `${MONTHS_TR[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

interface ScenarioResponse {
  success: boolean;
  error?: string;
  result: RealisticClosingResult;
  coverage: { gipHours: number; volumeHours: number };
}

const tl = (v: number) => `${v < -0.5 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("tr-TR")} ₺`;
const num = (v: number) => Math.round(v).toLocaleString("tr-TR");

const ROW_LABEL: Record<string, string> = {
  "SURPLUS-sell": "Sistem fazlada · santral fazla (satış)",
  "DEFICIT-buy": "Sistem açıkta · santral eksik (alış)",
  "SURPLUS-buy": "Sistem fazlada · santral eksik (alış)",
  "DEFICIT-sell": "Sistem açıkta · santral fazla (satış)",
  "BALANCED-sell": "Sistem dengede · santral fazla (satış)",
  "BALANCED-buy": "Sistem dengede · santral eksik (alış)",
};
const isHard = (key: string) => key === "SURPLUS-sell" || key === "DEFICIT-buy";

function Slider({
  label,
  hint,
  value,
  onChange,
  max = 100,
  step = 5,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-slate-800">{label}</span>
        <span className="font-mono text-slate-700">%{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-emerald-600"
      />
      <div className="text-2xs text-slate-500">{hint}</div>
    </label>
  );
}

/**
 * Gerçekçi GİP kapatma senaryosu: kapatılan pay, saatlik GİP hacmine göre sınır ve zor saatlerde
 * (sistem fazladayken satış, açıktayken alış) fiyat kayması. Basit senaryo kıyas için yanında gösterilir.
 */
export function GipScenarioPanel({ projectId, scope }: { projectId: string; scope: string }) {
  const [share, setShare] = useState(25);
  const [cap, setCap] = useState(10);
  const [haircut, setHaircut] = useState(50);
  const [data, setData] = useState<ScenarioResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const [persistence, setPersistence] = useState<PersistenceResponse | null>(null);

  // Veriyle test: kaydırıcılardan bağımsız, kapsam değişince bir kez hesaplanır (birkaç saniye sürebilir)
  useEffect(() => {
    let cancelled = false;
    setPersistence(null);
    fetch(`/api/projects/${projectId}/gip-persistence?scope=${encodeURIComponent(scope)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: PersistenceResponse) => !cancelled && setPersistence(d))
      .catch(() => !cancelled && setPersistence({ success: false, error: "Hesaplanamadı." }));
    return () => {
      cancelled = true;
    };
  }, [projectId, scope]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    // Kaydırıcı sürüklenirken her adımda istek atılmasın
    const timer = setTimeout(() => {
      fetch(`/api/projects/${projectId}/gip-scenario?scope=${encodeURIComponent(scope)}&share=${share}&cap=${cap}&haircut=${haircut}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((d: ScenarioResponse) => {
          if (id !== requestId.current) return;
          if (!d.success) throw new Error(d.error || "GİP senaryosu hesaplanamadı.");
          setData(d);
          setError(null);
        })
        .catch((err) => id === requestId.current && setError(err instanceof Error ? err.message : "Hata"))
        .finally(() => id === requestId.current && setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [projectId, scope, share, cap, haircut]);

  const r = data?.result;
  const coverage = data?.coverage;
  const noVolume = !!coverage && coverage.gipHours > 0 && coverage.volumeHours === 0;
  const partialVolume = !!coverage && coverage.volumeHours > 0 && coverage.volumeHours < coverage.gipHours;
  const hardShare =
    r && r.simpleGainTl > 0
      ? r.breakdown.filter((b) => isHard(`${b.direction}-${b.side}`)).reduce((s, b) => s + b.simpleGainTl, 0) / r.simpleGainTl
      : 0;

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white shadow-sm lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-emerald-800">
          Üst sınır (kusursuz öngörü): hatanın %{share} payı doğru yönde GİP&apos;te kapatılırsa {loading && "· hesaplanıyor…"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {r && (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className={`text-3xl font-bold tracking-tight ${r.realisticGainTl < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {tl(r.realisticGainTl)}
              </div>
              <div className="text-xs text-slate-600">
                dengesizlik maliyetinin %{r.realisticShareOfCostPercent.toLocaleString("tr-TR")} payı
              </div>
              <div className="mt-1 max-w-xs text-xs font-medium text-amber-800">
                Hatanın yönü hep doğru bilinir varsayılır; uygulanabilir sonuç için aşağıdaki &quot;Veriyle test&quot; (2 saat önce) satırına bakın.
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Basit senaryo (ortalama fiyat, sınırsız hacim): <strong className="text-slate-700">{tl(r.simpleGainTl)}</strong>
              <br />
              Kapatılan: {num(r.closedMwh)} / {num(r.desiredMwh)} MWh
              {r.cappedHours > 0 && ` · hacim sınırına takılan ${num(r.cappedHours)} saat`}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Slider label="Kapatılan pay" hint="Hatanın gün içinde görülüp kapatılan kısmı" value={share} onChange={setShare} />
          <Slider
            label="Hacim sınırı"
            hint="Saatlik GİP eşleşme hacminin en fazla bu kadarı"
            value={cap}
            onChange={setCap}
            max={50}
            step={1}
          />
          <Slider
            label="Zor saatte fiyat kayması"
            hint="Ortalamadan en kötü eşleşme fiyatına doğru"
            value={haircut}
            onChange={setHaircut}
          />
        </div>

        {noVolume && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Bu dönem için GİP hacim ve en düşük/en yüksek fiyat verisi henüz çekilmemiş; hacim sınırı ve fiyat kayması
            uygulanamıyor, sonuç basit senaryoya eşit. EPİAŞ&apos;tan yeniden çekince tamamlanır.
          </div>
        )}
        {partialVolume && coverage && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            GİP hacim ve en düşük/en yüksek fiyat verisi {coverage.volumeHours.toLocaleString("tr-TR")} /{" "}
            {coverage.gipHours.toLocaleString("tr-TR")} saat için var. Kalan saatlerde hacim sınırı ve fiyat kayması
            uygulanamadı (ortalama fiyat kullanıldı); gerçekçi sonuç olduğundan iyimser. Eksik ayları EPİAŞ&apos;tan
            yeniden çekin.
          </div>
        )}

        {r && r.breakdown.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1.5 pr-2">Durum</th>
                  <th className="py-1.5 pr-2 text-right">Saat</th>
                  <th className="py-1.5 pr-2 text-right">Dengesizlik maliyeti</th>
                  <th className="py-1.5 pr-2 text-right">Basit</th>
                  <th className="py-1.5 text-right">Hacim sınırlı</th>
                </tr>
              </thead>
              <tbody>
                {r.breakdown.map((b) => {
                  const key = `${b.direction}-${b.side}`;
                  return (
                    <tr key={key} className={`border-b last:border-0 ${isHard(key) ? "bg-amber-50/60" : ""}`}>
                      <td className="py-1.5 pr-2 text-slate-800">
                        {ROW_LABEL[key] ?? key}
                        {isHard(key) && <span className="ml-1 text-2xs font-semibold text-amber-700">zor</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{num(b.hours)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{tl(b.imbalanceCostTl)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{tl(b.simpleGainTl)}</td>
                      <td className={`py-1.5 text-right font-semibold tabular-nums ${b.realisticGainTl < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {tl(b.realisticGainTl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Veriyle test: sabit varsayım vs "son görülen hata sürer" kuralı, görmediği aylarda */}
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-800">
            Veriyle test: hatayı gerçekten ne kadar erken görebilirsiniz?
          </div>
          {!persistence && <p className="mt-1 text-xs text-slate-500">Geriye dönük test çalıştırılıyor…</p>}
          {persistence && (!persistence.success || !persistence.available) && (
            <p className="mt-1 text-xs text-slate-500">
              {persistence.error ?? "Test için yeterli veri yok (önceki 4 ayın tamamı gerekir)."}
            </p>
          )}
          {persistence?.available && persistence.strategies && persistence.testMonths && (
            <>
              <p className="mt-1 text-2xs text-slate-500">
                {monthLabel(persistence.testMonths[0])} – {monthLabel(persistence.testMonths[persistence.testMonths.length - 1])}
                , kuralın görmediği aylarda. &quot;Kalıcılık&quot; kuralı, birkaç saat önce görülen hatanın sürdüğünü
                varsayıp bir kısmını GİP&apos;te kapatır; hata yön değiştirirse zarar da sayılır. Kapatılan oran her
                santral için önceki 4 aydan öğrenilir.
              </p>
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {persistence.strategies.map((st) => (
                    <tr key={st.id} className={`border-b last:border-0 ${st.id.startsWith("gip-close") || st.id === "persistence-1h" ? "text-slate-500" : ""}`}>
                      <td className="py-1.5 pr-2">
                        {st.id.startsWith("gip-close") ? "Sabit %25 varsayımı (yönü hep doğru bilir)" : st.label}
                      </td>
                      <td className={`py-1.5 pr-2 text-right font-semibold tabular-nums ${st.outOfSampleSavingTl < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {tl(st.outOfSampleSavingTl)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {st.outOfSampleSavingPercent < 0 ? "−" : ""}%{Math.abs(st.outOfSampleSavingPercent).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">
                        {st.positiveMonths}/{st.testMonths} ay kazançlı
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {persistence.nextMonth && persistence.nextMonth.length > 0 && (
                <p className="mt-2 text-2xs text-slate-500">
                  Gelecek ay için öğrenilen oran (2 saat önce görülürse):{" "}
                  {persistence.nextMonth.map((p) => `${p.plantName} ${p.params["persistence-2h"] ?? "—"}`).join(" · ")}
                </p>
              )}
            </>
          )}
        </div>

        <p className="text-xs leading-relaxed text-slate-600">
          {r && hardShare > 0 && (
            <>
              Basit senaryodaki kazancın <strong>%{Math.round(hardShare * 100)}</strong> payı &quot;zor&quot; saatlerden
              geliyor: sistem fazladayken fazlayı satmak ve açıktayken eksiği almak. Bu saatlerde karşı taraf az olduğu
              için fiyat, ortalamadan en kötü eşleşme fiyatına doğru kaydırılır.{" "}
            </>
          )}
          Hacim sınırı aynı saatteki tüm santrallerin toplam isteğine uygulanır. Gün içi tahmin güncellemesinin ne kadar
          erken geldiği modellenmez.
        </p>
      </CardContent>
    </Card>
  );
}
