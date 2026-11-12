"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { BarChart, ResponsiveContainer } from "recharts";
import {
  ChartBar as Bar,
  ChartGrid as CartesianGrid,
  ChartLegendDots,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
  STATUS_COLOR,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { companySlug } from "@/lib/analysis/company-profile";
import type { PlantCard } from "@/lib/services/plant-card";

/**
 * Santral kartı: kayıtlı bilgiler (kurulu güç, konum, YEKDEM) ve seçilen yılın gerçekleşen satış fiyatı. Veri /api/plants/<kimlik>.
 * Tahmini değerler `~` ve "Tahmini" rozetiyle işaretlenir; kayıttan gelenler kaynağını yazar (CLAUDE.md kuralları).
 */

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const HYDRO: Record<string, string> = { RESERVOIR: "barajlı", RUN_OF_RIVER: "nehir tipi" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const mTl = (v: number) => `${nf(v / 1e6, 1)} M ₺`;

function Stat({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3" title={hint}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-3 text-sm">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 space-y-1">{children}</div>
    </div>
  );
}

export default function PlantCardPage() {
  const { id } = useParams<{ id: string }>();
  const yearParam = useSearchParams().get("year");
  const [card, setCard] = useState<PlantCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setCard(null);
    setError(null);
    fetch(`/api/plants/${id}${yearParam ? `?year=${yearParam}` : ""}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.success) setError(j.error ?? "Santral kartı alınamadı");
        else setCard(j.card);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Santral kartı alınamadı"));
    return () => {
      alive = false;
    };
  }, [id, yearParam]);

  const back = (
    <Link href="/santraller" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-3 w-3" /> Santral rehberi
    </Link>
  );

  if (error)
    return (
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 sm:px-6">
        {back}
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  if (!card)
    return (
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 sm:px-6">
        {back}
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Santral kartı yükleniyor
        </p>
      </div>
    );

  const d = card.data;
  const cap = card.capacity;
  const ex = card.yekdem.exit;
  const monthRows = d?.monthly.map((m) => ({ ...m, label: MONTHS[Number(m.month.slice(5, 7)) - 1] })) ?? [];
  const hourRows = d?.hourly.map((h) => ({ saat: `${String(h.hour).padStart(2, "0")}`, "Üretim payı": +h.mwhSharePct.toFixed(2), "Gelir payı": +h.revenueSharePct.toFixed(2) })) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        {back}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{card.name}</h1>
        <p className="text-sm text-slate-600">
          {TECH[card.type]}
          {card.hydroKind ? ` · ${HYDRO[card.hydroKind]}` : ""} ·{" "}
          {card.owner ? (
            <Link href={`/sirketler/${companySlug(card.owner)}`} className="text-indigo-700 hover:underline">
              {card.owner}
            </Link>
          ) : (
            "sahip şirket bilinmiyor"
          )}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Fact title="Kurulu güç">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums">
              {cap.recorded ? "" : "~"}
              {nf(cap.mw, 2)} MW
            </span>
            <StatusChip kind={cap.recorded ? "record" : "estimate"} />
          </div>
          <div className="text-xs text-slate-500">{cap.sourceLabel}</div>
          <div className="text-xs text-slate-500">{cap.ref}</div>
          {cap.warning && <div className="text-xs text-amber-700">{cap.warning}</div>}
        </Fact>
        <Fact title="Konum">
          {card.location ? (
            <>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{card.location.text}</span>
                <StatusChip kind={card.location.estimate ? "estimate" : "record"} />
              </div>
              <div className="text-xs text-slate-500">{card.location.sourceLabel}</div>
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer">Kaynak notu</summary>
                <p className="mt-1">{card.location.ref}</p>
              </details>
            </>
          ) : (
            <div className="text-slate-500">Konum kaydı yok</div>
          )}
        </Fact>
        <Fact title="YEKDEM">
          {ex ? (
            <>
              <div className="font-semibold">
                {ex.status === "NEVER" ? "Listelerde görülmedi" : ex.status === "ENDS_SOON" ? "Süresi bitiyor" : ex.status === "EXITED" ? "Çıktı" : "YEKDEM'de"}
              </div>
              <div className="text-xs text-slate-500">{ex.note}</div>
            </>
          ) : (
            <div className="text-slate-500">{card.yekdem.error ?? "YEKDEM durumu alınamadı"}</div>
          )}
        </Fact>
        <Fact title="Veri">
          {d ? (
            <>
              <div className="font-semibold tabular-nums">
                {nf(d.hours)} / {nf(d.expectedHours)} saat
              </div>
              <div className="text-xs text-slate-500">
                %{nf(d.coveragePct, 1)} kapsam{d.lastHour ? ` · son saat ${d.lastHour.slice(8, 10)}.${d.lastHour.slice(5, 7)}.${d.lastHour.slice(0, 4)} ${d.lastHour.slice(11, 16)}` : ""}
              </div>
            </>
          ) : (
            <div className="text-slate-500">Bu yıl için üretim verisi yok</div>
          )}
        </Fact>
      </div>

      {card.years.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Yıl">
          <span className="text-sm text-slate-500">Yıl</span>
          {card.years.map((y) => (
            <Link
              key={y}
              href={`/santraller/${card.id}?year=${y}`}
              aria-current={y === card.year ? "true" : undefined}
              className={`rounded-md border px-3 py-1 text-sm font-medium ${y === card.year ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {y}
            </Link>
          ))}
        </div>
      )}

      {d && (
        <>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <StatusChip kind="exact" />
            <span>
              Gerçekleşen üretim (UEVM) × gün öncesi fiyatı (PTF). Dengesizlik maliyeti ve KÜPST dahil değil.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <Stat label={`${card.year} üretimi`} value={`${nf(d.mwh / 1000, 1)} GWh`} sub={d.capacityFactorPct !== null ? `kapasite faktörü %${nf(d.capacityFactorPct, 1)}` : "kurulu güç tahmin: kapasite faktörü yok"} />
            <Stat label="Ortalama satış fiyatı" value={`${nf(d.capture.capturePriceTl)} TL/MWh`} hint="Σ(üretim × PTF) / Σ üretim" />
            <Stat label="Baz PTF" value={`${nf(d.capture.baseloadPtfTl)} TL/MWh`} hint="Verisi olan saatlerin PTF ortalaması" />
            <Stat
              label="Capture oranı"
              value={d.capture.ratePct === null ? "–" : `%${nf(d.capture.ratePct, 1)}`}
              sub={d.sector ? `${d.sector.groupLabel} santrallerinin %${nf(d.sector.percentile)}'inden iyi (medyan %${nf(d.sector.medianPct, 1)}, ${d.sector.plants} santral)` : "sektör kıyası yok"}
              hint="Ortalama satış fiyatı / baz PTF. %100'ün altı: üretim fiyatın düşük olduğu saatlerde yoğun"
            />
            <Stat label="Profil kaybı" value={mTl(d.capture.profileLossTl)} hint="Baz fiyattan satılsaydı fark" />
            <Stat label="Sıfır fiyatlı saatlerdeki üretim" value={`%${nf(d.capture.zeroSharePct, 1)}`} />
            <Stat label="Düşük fiyatlı saatlerdeki üretim" value={`%${nf(d.capture.lowSharePct, 1)}`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ay ay satış fiyatı</CardTitle>
              <CardDescription>Her ayın baz PTF&apos;si o ayın saatlerinden. Eksik saatli ay yanıltabilir: kapsam için yıl başlığındaki veriye bakın.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ay</TableHead>
                    <TableHead className="text-right">Üretim (MWh)</TableHead>
                    <TableHead className="text-right">Satış fiyatı (TL/MWh)</TableHead>
                    <TableHead className="text-right">Baz PTF (TL/MWh)</TableHead>
                    <TableHead className="text-right">Capture oranı</TableHead>
                    <TableHead className="text-right">Profil kaybı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthRows.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{m.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{nf(m.mwh)}</TableCell>
                      <TableCell className="text-right tabular-nums">{nf(m.capturePriceTl)}</TableCell>
                      <TableCell className="text-right tabular-nums">{nf(m.baseloadPtfTl)}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.ratePct === null ? "–" : `%${nf(m.ratePct, 1)}`}</TableCell>
                      <TableCell className="text-right tabular-nums">{mTl(m.profileLossTl)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Günün hangi saatinde kazanıyor?</CardTitle>
              <CardDescription>
                Üretimin ve gelirin saatlere payı (%). Gelir payı üretim payından düşükse santral o saatlerde ucuza satıyor demektir.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartLegendDots
                items={[
                  { label: "Üretim payı", color: STATUS_COLOR.reference, kind: "rect" },
                  { label: "Gelir payı", color: STATUS_COLOR.forecast, kind: "rect" },
                ]}
              />
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourRows}>
                    <CartesianGrid />
                    <XAxis dataKey="saat" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `%${v}`} width={44} />
                    <Tooltip formatter={(v) => `%${nf(Number(v), 1)}`} labelFormatter={(l) => `Saat ${l}:00`} />
                    <Bar dataKey="Üretim payı" fill={STATUS_COLOR.reference} />
                    <Bar dataKey="Gelir payı" fill={STATUS_COLOR.forecast} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
