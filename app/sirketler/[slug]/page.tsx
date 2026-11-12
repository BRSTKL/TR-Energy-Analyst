"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { YEKDEM_EXIT_LABEL, type YekdemExitStatus } from "@/lib/analysis/yekdem-exit";
import type { CompanyProfile } from "@/lib/services/company-profile";

/**
 * Şirket profili: bir sahip şirketin santralleri, kurulu gücü, üretimi ve sapmanın maliyeti (seçilen yılın sektör karnesi).
 * Veri /api/companies/<ad>. Tahmini kurulu güç `~` ve "Tahmini" rozetiyle işaretlenir (CLAUDE.md "Kurulu güç").
 */

const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const mTl = (v: number) => `${nf(v / 1e6, 1)} M TL`;
const unit = (tl: number, mwh: number) => (mwh > 0 ? `${nf(tl / mwh, 0)} TL/MWh` : "–");
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function CompanyProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const yearParam = useSearchParams().get("year");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setError(null);
    fetch(`/api/companies/${slug}${yearParam ? `?year=${yearParam}` : ""}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.success) setError(j.error ?? "Şirket profili alınamadı");
        else setProfile(j.profile);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Şirket profili alınamadı"));
    return () => {
      alive = false;
    };
  }, [slug, yearParam]);

  const back = (
    <Link href="/sirketler" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-3 w-3" /> Şirketler
    </Link>
  );

  if (error)
    return (
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 sm:px-6">
        {back}
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  if (!profile)
    return (
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 sm:px-6">
        {back}
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Şirket profili yükleniyor
        </p>
      </div>
    );

  const c = profile.company;
  const n = profile.netting;
  const exiting = profile.plants.filter((p) => p.yekdemStatus === "EXITED" || p.yekdemStatus === "ENDS_THIS_YEAR" || p.yekdemStatus === "ENDS_SOON");

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        {back}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{c.name}</h1>
        <p className="text-sm text-slate-600">
          {c.byType.map((t) => `${t.plants} ${TECH[t.type].toLocaleLowerCase("tr-TR")}`).join(" · ")} santrali
          {profile.rank ? ` · kurulu güçte ${profile.rank.of} şirket içinde ${profile.rank.rank}.` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        {profile.years.length > 1 && (
          <div className="flex gap-1 rounded-lg border bg-white p-1" role="group" aria-label="Yıl">
            {profile.years.map((y) => (
              <Link
                key={y}
                href={`/sirketler/${slug}?year=${y}`}
                aria-current={profile.year === y ? "true" : undefined}
                className={`rounded-md px-3 py-1 text-sm font-medium ${profile.year === y ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {y}
              </Link>
            ))}
          </div>
        )}
        <span>
          Dönem {day(profile.period.start)} – {day(profile.period.end)} · sektör karnesi
        </span>
      </div>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          Kayıtlı bilgiler <StatusChip kind="record" />
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-white p-3">
            <div className="text-xs text-slate-500">Kurulu güç</div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {c.estimatedMw > 0 ? "~" : ""}
                {nf(c.mw, 1)} MW
              </span>
              {c.estimatedMw > 0 && <StatusChip kind="estimate" />}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {c.estimatedMw > 0 ? `${nf(c.recordedMw, 1)} MW kayıtlı, ${nf(c.estimatedMw, 1)} MW tahmini (alt sınır)` : "tamamı kayıttan (YEKDEM / EPDK)"}
            </div>
          </div>
          <Stat label="Üretim" value={`${nf(c.actualMwh / 1000, 1)} GWh`} sub={`EPİAŞ gerçekleşen üretim · ${c.byType.map((t) => `${TECH[t.type]} ${nf(t.actualMwh / 1000, 0)}`).join(" · ")}`} />
          <Stat
            label={`YEKDEM (${profile.year})`}
            value={`${c.yekdem.plants} santral`}
            sub={c.yekdem.plants > 0 ? `${nf(c.yekdem.mw, 1)} MW · ${c.plants - c.yekdem.plants} santral serbest piyasada` : "hepsi serbest piyasada"}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
          Dengesizlik maliyeti <StatusChip kind="assumption" label="Hesaplanan risk · fatura değil" />
        </h2>
        {n ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="Santraller tek tek"
                value={mTl(n.own.sumTl + n.aggregated.sumTl)}
                sub={`${unit(n.own.sumTl + n.aggregated.sumTl, n.own.mwh + n.aggregated.mwh)} · her santral ayrı dengelenseydi`}
              />
              <div className="rounded-lg border-2 border-indigo-300 bg-white p-3">
                <div className="text-xs text-slate-500">Netleşmiş</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">{n.own.nettedTl === null ? "hesaplanmadı" : mTl(n.own.nettedTl)}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {n.own.nettedTl === null
                    ? n.own.plants === 1
                      ? `şirketin kendi portföyünde 1 santral var (${mTl(n.own.sumTl)})`
                      : "şirketin kendi portföyünde santral yok"
                    : `${unit(n.own.nettedTl, n.own.mwh)} · ${n.own.plants} santral tek portföyde dengelenirse`}
                </div>
              </div>
              {n.own.nettedTl !== null && (
                <Stat
                  label="Netleşmenin etkisi"
                  value={n.own.sumTl > 0 ? `−%${nf((1 - n.own.nettedTl / n.own.sumTl) * 100, 0)}` : "–"}
                  sub={`${mTl(n.own.sumTl - n.own.nettedTl)} · ${n.aggregated.plants > 0 ? `kendi portföyündeki ${n.own.plants} santralde (tek tek ${mTl(n.own.sumTl)})` : "santraller birbirinin sapmasını kapatıyor"}`}
                />
              )}
            </div>
            {n.aggregated.plants > 0 && (
              <div className="rounded-lg border bg-white p-3 text-sm text-slate-700">
                {n.aggregated.plants} santral toplayıcı portföyünde ({n.aggregated.aggregators.map((a) => `${a.name}: ${a.plants}`).join(", ")}; tek tek{" "}
                {mTl(n.aggregated.sumTl)}). Bunlar şirketle değil toplayıcının diğer santralleriyle dengelenir; netleşmeye katılmadı.
                {n.membershipAsOf ? ` Üyelik listesi ${day(n.membershipAsOf)} tarihli; yıl içinde giren ya da çıkan santral o günkü durumuyla sayılır.` : ""}
              </div>
            )}
            <p className="text-xs text-slate-500">
              Gün öncesi plana göre hesaplanır. Gün içi işlemler ve sistem işletmecisinin talimatları yayımlanmadığı için dahil değildir; gerçek
              fatura bu sayıların altında olabilir. Netleşmiş değer, toplayıcıda olmayan santrallerin tek portföyde dengelendiğini varsayar.
              {n.membershipAsOf === null ? " Toplayıcı üyelik listesi bulunamadı; hiçbir santral toplayıcıda sayılmadı." : ""}
              {n.missing > 0 ? ` Saatlik serisi olmayan ${n.missing} santral bu bölümde yok.` : ""} KÜPST santral bazında kesilir, netleşmez:{" "}
              {mTl(c.kupstTl)}.
            </p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Santraller tek tek" value={mTl(c.imbalanceCostTl)} sub={c.unitImbalanceTl === null ? undefined : `${nf(c.unitImbalanceTl, 0)} TL/MWh`} />
            </div>
            <p className="text-xs text-slate-500">
              Netleşmiş değer hesaplanamadı; gösterilen sayı santral toplamıdır ve gerçek maliyet daha düşük olabilir. KÜPST: {mTl(c.kupstTl)}.
            </p>
          </>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">YEKDEM&apos;den çıkış</CardTitle>
          <CardDescription>
            {exiting.length > 0 ? "Yeni çıkan ya da süresi dolmak üzere olan santraller; süre ±1 yıl belirsiz." : "Yeni çıkan ya da süresi dolmak üzere olan santral yok."}
          </CardDescription>
        </CardHeader>
        {exiting.length > 0 && (
          <CardContent className="pt-0 text-sm">
            <ul className="space-y-0.5">
              {exiting.map((p) => (
                <li key={p.id}>
                  <Link href={`/santraller/${p.id}`} className="text-indigo-700 hover:underline">
                    {p.name}
                  </Link>
                  <span className="text-slate-600"> · {YEKDEM_EXIT_LABEL[p.yekdemStatus as YekdemExitStatus]}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Santraller</CardTitle>
          <CardDescription>
            Dengesizlik santral bazındadır (netleşme yok). Sektördeki yer: aynı türdeki santraller içinde MWh başına dengesizlik sırası (düşük daha
            iyi).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Santral</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead className="text-right">Kurulu güç (MW)</TableHead>
                <TableHead className="text-right">Üretim (GWh)</TableHead>
                <TableHead className="text-right">Sapma (%)</TableHead>
                <TableHead className="text-right">Dengesizlik (TL/MWh)</TableHead>
                <TableHead className="text-right">Sektördeki yer</TableHead>
                <TableHead>YEKDEM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profile.plants.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/santraller/${p.id}`} className="text-indigo-700 hover:underline">
                      {p.name}
                    </Link>
                    {p.aggregator && <div className="text-xs font-normal text-slate-500">toplayıcı: {p.aggregator}</div>}
                  </TableCell>
                  <TableCell>{TECH[p.type]}</TableCell>
                  <TableCell className="text-right tabular-nums" title={p.capacityLabel}>
                    {p.recorded ? "" : "~"}
                    {nf(p.mw, 1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{nf(p.actualMwh / 1000, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf(p.deviationPct, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.actualMwh > 0 ? nf(p.imbalanceCostTl / p.actualMwh, 0) : "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">%{nf(p.rankPct, 0)}</TableCell>
                  <TableCell className="text-slate-600">
                    {p.yekdemStatus ? YEKDEM_EXIT_LABEL[p.yekdemStatus as YekdemExitStatus] : p.yekdem === null ? "–" : p.yekdem ? "YEKDEM'de" : "YEKDEM'de değil"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="space-y-1 text-xs text-slate-500">
        <p>
          <span className="font-medium">~</span> işaretli kurulu güç kayıttan değil; dönemdeki en yüksek saatlik üretimden alınan alt sınırdır.
        </p>
        <p>
          Kapsam: sektör karnesindeki lisanslı rüzgâr, güneş ve hidro santralleri. Toplayıcıya geçen santralin sahibi EPİAŞ&apos;ta görünmediği için
          şirketin listesinde olmayabilir.
        </p>
        {profile.errors.map((e) => (
          <p key={e} className="text-amber-700">
            {e}
          </p>
        ))}
      </div>
    </div>
  );
}
