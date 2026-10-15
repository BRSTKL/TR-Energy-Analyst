"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ValidationPack, ValidationUnit } from "@/lib/services/validation-pack";
import { pctIn } from "@/lib/format";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const tl = (v: number) => `${nf(v, 0)} TL`;
const TYPE: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };

function Question({ n, text }: { n: number; text: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-slate-900">
        {n}. {text}
      </p>
      <div className="flex flex-wrap gap-4 text-sm text-slate-700">
        {["Fark %5'in altında", "Fark %5–15 arasında", "Fark %15'in üstünde", "Karşılaştıramıyoruz"].map((o) => (
          <span key={o} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-slate-400" /> {o}
          </span>
        ))}
      </div>
    </div>
  );
}

function UnitBlock({ u }: { u: ValidationUnit }) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <h2 className="text-base font-semibold text-slate-900">
        {u.name} <span className="text-sm font-normal text-slate-500">· {u.plants.length} santral · uzlaştırma birimi{u.aggregator ? " (toplayıcı)" : ""}</span>
      </h2>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {[
            ["Üretim (UEVM)", `${nf(u.uevmMwh)} MWh`],
            ["Pozitif dengesizlik (fazla üretim)", `${nf(u.positiveMwh, 1)} MWh`],
            ["Negatif dengesizlik (eksik üretim)", `${nf(u.negativeMwh, 1)} MWh`],
            ["Pozitif dengesizlik tutarı (alacak)", tl(u.receivableTl)],
            ["Negatif dengesizlik tutarı (borç)", tl(u.payableTl)],
            ["Net dengesizlik tutarı", tl(u.netAmountTl)],
            ["Dengesizlik maliyeti (PTF'den satılsaydı farka göre)", tl(u.imbalanceCostTl)],
            [u.aggregator ? "KÜPST (topluluk bazında, tahmini)" : "KÜPST (santral bazında toplam, tahmini)", tl(u.kupstTl)],
          ].map(([k, v]) => (
            <tr key={k} className="border-b border-slate-200">
              <td className="py-1.5 pr-4 text-slate-600">{k}</td>
              <td className="py-1.5 text-right font-medium tabular-nums text-slate-900">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="text-xs text-slate-600 print:hidden" open={u.plants.length <= 8}>
        <summary className="cursor-pointer">Santraller ({u.plants.length})</summary>
        <table className="mt-1 w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left font-normal">Santral</th>
              <th className="text-right font-normal">UEVM (MWh)</th>
              <th className="text-right font-normal">İlk KGÜP</th>
              <th className="text-right font-normal">Son KGÜP</th>
              <th className="text-right font-normal">KÜPST (TL)</th>
            </tr>
          </thead>
          <tbody>
            {u.plants.map((p) => (
              <tr key={p.name}>
                <td>
                  {p.name} <span className="text-slate-400">({TYPE[p.type] ?? p.type}{p.epiasPlantId !== null ? `, EPİAŞ ${p.epiasPlantId}` : ""})</span>
                </td>
                <td className="text-right tabular-nums">{nf(p.uevmMwh)}</td>
                <td className="text-right tabular-nums">{nf(p.firstPlanMwh)}</td>
                <td className="text-right tabular-nums">{nf(p.finalPlanMwh)}</td>
                <td className="text-right tabular-nums">{nf(p.kupstTl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/**
 * Kör doğrulama paketi (Bekleyen işler: kalibrasyon): şirketten veri istemeden, açık veriyle hesaplanan ayın uzlaştırma
 * tutarlarını tek sayfada gösterir ve yalnız "faturanızla fark hangi aralıkta?" diye sorar. Yazdırılıp PDF olarak gönderilir.
 */
export default function ValidationPage() {
  const { id } = useParams<{ id: string }>();
  const [month, setMonth] = useState<string | null>(null);
  const [unit, setUnit] = useState<string>("all");
  const [data, setData] = useState<ValidationPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${id}/validation${month ? `?month=${month}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
        if (!month) setMonth(d.month);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Doğrulama paketi yüklenemedi."))
      .finally(() => setLoading(false));
    // ay yalnız seçilince yeniden çekilir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, month]);

  const units = data ? (unit === "all" ? data.units : data.units.filter((u) => u.key === unit)) : [];

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16 print:bg-white print:pb-0">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-6 print:max-w-none print:px-0 print:pt-0">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link href={`/projects/${id}/results`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-3 w-3" /> Sonuçlar
          </Link>
          <span className="ml-auto text-xs text-slate-500">Ay:</span>
          <select className="rounded border border-slate-300 bg-white px-2 py-1 text-sm" value={month ?? ""} onChange={(e) => setMonth(e.target.value)} aria-label="Ay">
            {(data?.months ?? []).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          {data && data.units.length > 1 && (
            <select className="rounded border border-slate-300 bg-white px-2 py-1 text-sm" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Uzlaştırma birimi">
              <option value="all">Bütün birimler ({data.units.length})</option>
              {data.units.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => window.print()} disabled={!data}>
            <Printer className="h-3.5 w-3.5" /> Yazdır / PDF
          </Button>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>
        {error && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}

        {data && (
          <article className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
            <header className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">TR-Energy Analyst · Doğrulama talebi</p>
              <h1 className="text-xl font-bold text-slate-900">
                {monthLabel(data.month)} dengesizlik hesabımız faturanıza ne kadar yakın?
              </h1>
              <p className="text-sm text-slate-600">
                Aşağıdaki rakamları yalnız EPİAŞ Şeffaflık Platformu&apos;nun açık verisiyle hesapladık. Sizden veri istemiyoruz: PYS uzlaştırma
                bildiriminizle karşılaştırıp yalnız farkın hangi aralıkta olduğunu işaretlemeniz yeterli. Bu, aracın gerçeğe ne kadar yakın olduğunu
                ölçmemizi sağlar.
              </p>
            </header>

            {units.map((u) => (
              <UnitBlock key={u.key} u={u} />
            ))}

            <section className="space-y-3 rounded-md border border-slate-200 p-4 break-inside-avoid">
              <p className="text-sm font-semibold text-slate-900">Sorularımız</p>
              <Question n={1} text={`Net dengesizlik tutarı (ya da alacak ve borç ayrı ayrı), ${monthLabel(data.month)} uzlaştırma bildiriminizle:`} />
              <Question n={2} text="KÜPST tutarı, bildiriminizle:" />
              <p className="text-xs text-slate-500">İsterseniz farkın yönünü de (bizim rakamımız yüksek / düşük) yazabilirsiniz. Başka bir bilgi gerekmez.</p>
            </section>

            <footer className="space-y-1 text-xs leading-relaxed text-slate-500">
              <p>
                <b>Nasıl hesaplandı.</b> Saatlik UEVM ve KGÜP (EPİAŞ), uzlaştırma birimi bazında netleştirildi. Pozisyon olarak son KGÜP (gün içi
                piyasası kapandıktan sonraki plan) kullanıldı; son planı olmayan saatte ilk KGÜP. Dengesizlik fiyatları EPİAŞ&apos;ın resmi pozitif ve
                negatif dengesizlik fiyatlarıdır (saatlerin {pctIn(data.officialPriceSharePct)} resmi fiyat var). KÜPST: EPDK 14029 / 13025
                kararlarına göre{units.some((u) => u.aggregator) ? ", toplayıcıda topluluk bazında" : ", santral bazında"}.
              </p>
              <p>
                <b>Farkın olası nedenleri.</b> Gerçek pozisyonunuz son KGÜP&apos;ten farklıysa (ikili anlaşmalar, GİP işlemleri, YAL / YAT talimatları)
                fark oradan gelir; bu da bizim için değerli bir bilgidir. Faturanızda bu sayfadaki santraller dışında santral varsa (listede {units.reduce((a, u) => a + u.plants.length, 0)} santral var) fark oradan da gelebilir. Rakamlar KDV ve diğer kalemler (sistem kullanım, piyasa işletim) hariçtir.
              </p>
            </footer>
          </article>
        )}
      </div>
    </div>
  );
}
