"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DsgScenarioResult } from "@/lib/analysis/dsg-scenarios";

import { MethodLink } from "@/components/method-link";
interface PlantOption {
  plantId: string;
  plantName: string;
  plantType: string;
  capacityMw: number;
  hasData: boolean;
  selected: boolean;
  /** Üye bir şirketse santralleri (üye = piyasa katılımcısı) */
  memberPlants: string[];
  isCompany: boolean;
}

interface DsgResponse extends DsgScenarioResult {
  success: boolean;
  error?: string;
  project: { id: string; name: string };
  /** Grup üyeleri şirketlerdir (sahibi bilinmeyen santral kendi başına üye) */
  plants: PlantOption[];
  unknownOwnerPlants: string[];
  /** Veri döneminde YEKDEM'de olan santraller (bilgi; dengesizlikleri de kendilerine aittir) */
  yekdemPlants: string[];
}

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const monthLabel = (m: string) => `${MONTHS_TR[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const tl = (v: number) => `${v < -0.5 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("tr-TR")} ₺`;
const pct = (ratio: number, digits = 1) =>
  `${ratio < 0 ? "−" : ""}%${Math.abs(ratio * 100).toLocaleString("tr-TR", { maximumFractionDigits: digits })}`;

/** Uzun ad listeleri (toplayıcı portföyünde onlarca santral): ilk birkaç ad ve kalan sayısı */
const shortList = (names: string[], max = 5) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} ve ${names.length - max} santral daha`;

export default function DsgScenarioPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [data, setData] = useState<DsgResponse | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Hızlı art arda seçimlerde yalnızca son isteğin sonucu gösterilsin
  const requestId = useRef(0);

  const load = useCallback(
    async (ids: string[] | null) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (ids) params.set("plants", ids.join(","));
        const query = params.size ? `?${params}` : "";
        const res = await fetch(`/api/projects/${projectId}/dsg${query}`, { cache: "no-store" });
        const d: DsgResponse = await res.json();
        if (id !== requestId.current) return;
        if (!d.success) throw new Error(d.error || "DSG senaryosu hesaplanamadı.");
        setData(d);
        setSelected(d.plants.filter((p) => p.selected).map((p) => p.plantId));
        setError(null);
      } catch (err) {
        if (id === requestId.current) setError(err instanceof Error ? err.message : "DSG senaryosu hesaplanamadı.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [projectId]
  );

  // İlk açılışta tüm üyelerle hesapla
  useEffect(() => {
    load(null);
  }, [load]);

  const choose = (ids: string[]) => {
    setSelected(ids);
    load(ids);
  };
  const toggle = (id: string) => {
    const current = selected ?? [];
    choose(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

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
            <Network className="h-6 w-6 text-indigo-600" /> DSG Senaryoları
          </h1>
          <MethodLink section="adil-prim" label="Yöntem ve varsayımlar" />
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Dengeden sorumlu grubu şirketler (piyasa katılımcıları) kurar. Aynı şirketin santralleri zaten birlikte
            uzlaştırıldığından her şirket tek üyedir; fayda yalnızca şirketler arasındaki ek netleşmedir. Grubu seçin;
            netleşme faydasını, her üyenin katkısını ve faydanın nasıl paylaştırılabileceğini görün.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {!data && loading && <p className="text-sm text-slate-500">Hesaplanıyor...</p>}

        {data && (
          <>
            {/* Grup seçimi */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Grup</CardTitle>
                <CardDescription>
                  En az iki üye (şirket) seçin. {loading && "Hesaplanıyor..."}
                </CardDescription>
                {data.yekdemPlants.length > 0 && (
                  <p className="mt-2 text-xs text-slate-600">
                    YEKDEM&apos;deki {data.yekdemPlants.length} santral ({shortList(data.yekdemPlants)}) de gruba dahildir: YEKDEM katılımcısı üretimini serbest
                    piyasada kendisi satar, dengesizliği kendisine aittir (YEK Yönetmeliği md. 15/1, 23/1).
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.plants.map((p) => {
                  const on = selected?.includes(p.plantId) ?? false;
                  return (
                    <button
                      key={p.plantId}
                      type="button"
                      disabled={!p.hasData}
                      onClick={() => toggle(p.plantId)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        on
                          ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <div className="font-semibold">{p.plantName}</div>
                      <div className="text-xs text-slate-500">
                        {p.plantType} · {p.capacityMw.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} MW
                        {p.isCompany && ` · ${p.memberPlants.length} santral`}
                        {!p.isCompany && " · sahibi bilinmiyor"}
                        {!p.hasData && " · veri yok"}
                      </div>
                      {p.isCompany && p.memberPlants.length > 1 && (
                        <div className="mt-0.5 max-w-xs text-2xs text-slate-400">{p.memberPlants.join(", ")}</div>
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {data.plants.filter((p) => p.hasData).length === 1 ? (
              <div className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Projedeki tüm santraller aynı şirkete ait ({data.plants.find((p) => p.hasData)?.plantName}). Bu santraller
                  uzlaştırmada zaten birlikte netleşiyor; DSG ancak başka şirketlerle kurulabilir. Aday şirketlerin
                  santrallerini{" "}
                  <Link href={`/projects/epias?projectId=${projectId}`} className="font-semibold underline">
                    EPİAŞ&apos;tan ekleyerek
                  </Link>{" "}
                  birlikte kuracağınız grubun faydasını burada görebilirsiniz.
                </span>
              </div>
            ) : (
              data.plants.filter((p) => p.hasData).length < 3 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Projede verisi olan {data.plants.filter((p) => p.hasData).length} üye (şirket) var; grup seçenekleri ve
                  paylaştırma karşılaştırması üç veya daha fazla üyede anlam kazanır.
                </div>
              )
            )}
            {data.unknownOwnerPlants.length > 0 && (
              <p className="text-xs text-slate-500">
                Sahibi bilinmeyen {data.unknownOwnerPlants.length} santral ayrı üye sayıldı: {shortList(data.unknownOwnerPlants)}. Aynı şirketin
                santralleriyse sonuç sayfasındaki &ldquo;EPİAŞ bilgilerini güncelle&rdquo; ile sahiplerini doldurun.
              </p>
            )}

            {data.selection ? (
              <>
                {/* Özet */}
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Tek başına toplam maliyet", tl(data.selection.standaloneCost), "Üyelerin ayrı ayrı ödediği (şirket bazında)"],
                    ["Grup içinde maliyet", tl(data.selection.nettedCost), "Saatlik netleşmiş dengesizlik"],
                    [
                      "Netleşme faydası",
                      tl(data.selection.benefitTl),
                      `Maliyetin ${pct(data.selection.benefitRatio)} payı`,
                    ],
                    [
                      "Zıt yönlü saatler",
                      pct(data.offsettingHourShare, 0),
                      "En az bir üye fazla, biri eksik üretti",
                    ],
                  ].map(([title, value, note], i) => (
                    <Card key={title} className={i === 2 ? "border-emerald-200 bg-emerald-50/50" : ""}>
                      <CardContent className="p-4">
                        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>
                        <div className={`mt-1 text-2xl font-bold ${i === 2 ? "text-emerald-700" : "text-slate-900"}`}>
                          {value}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{note}</div>
                      </CardContent>
                    </Card>
                  ))}
                </section>

                {/* Aylık istikrar */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Aylık fayda oranı</CardTitle>
                    <CardDescription>Faydanın her ay sürüp sürmediği</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                      {data.monthly.map((m) => (
                        <div key={m.month} className="rounded-md border border-slate-200 bg-white p-2 text-center">
                          <div className="text-2xs text-slate-500">{monthLabel(m.month)}</div>
                          <div className="text-sm font-semibold text-slate-900">{pct(m.benefitRatio, 0)}</div>
                          <div className="mt-1 h-1.5 rounded bg-slate-100">
                            <div
                              className="h-1.5 rounded bg-emerald-500"
                              style={{ width: `${Math.max(0, Math.min(100, m.benefitRatio * 100))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <section className="grid gap-6 lg:grid-cols-2">
                  {/* Marjinal değer */}
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Üyelerin katkısı</CardTitle>
                      <CardDescription>
                        Gruptakiler: ayrılırsa kaybedilecek fayda · Dışarıdakiler: eklenirse kazanılacak fayda
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <table className="w-full text-sm">
                        <tbody>
                          {[...data.marginal]
                            .sort((a, b) => Number(b.inGroup) - Number(a.inGroup) || b.benefitChangeTl - a.benefitChangeTl)
                            .map((m) => (
                              <tr key={m.plantId} className="border-b last:border-0">
                                <td className="py-2 pr-2">
                                  <span className="font-medium text-slate-900">{m.plantName}</span>{" "}
                                  <span className="text-xs text-slate-500">{m.plantType}</span>
                                </td>
                                <td className="py-2 pr-2 text-xs text-slate-500">
                                  {m.inGroup ? "Grupta" : "Grup dışında"}
                                </td>
                                <td className="py-2 text-right font-semibold text-slate-900">
                                  {m.inGroup ? "" : "+"}
                                  {tl(m.benefitChangeTl)}
                                </td>
                                <td className="py-2 pl-2 text-right">
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggle(m.plantId)}>
                                    {m.inGroup ? "Çıkar" : "Ekle"}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>

                  {/* En iyi gruplar */}
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">En faydalı gruplar</CardTitle>
                      <CardDescription>
                        {data.subsetsExhaustive
                          ? "Tüm olası gruplar içinden"
                          : "Üye sayısı fazla olduğundan çiftler (ve 12 üyeye kadar üçlüler) içinden"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <table className="w-full text-sm">
                        <tbody>
                          {data.topSubsets.map((s, i) => {
                            const isCurrent =
                              s.plantIds.length === (selected?.length ?? 0) &&
                              s.plantIds.every((id) => selected?.includes(id));
                            return (
                              <tr key={`${i}-${s.plantIds.join(",")}`} className="border-b last:border-0">
                                <td className="py-2 pr-2 text-slate-900">{s.plantNames.join(" + ")}</td>
                                <td className="py-2 pr-2 text-right font-semibold text-emerald-700">{tl(s.benefitTl)}</td>
                                <td className="py-2 pr-2 text-right text-xs text-slate-500">{pct(s.benefitRatio)}</td>
                                <td className="py-2 text-right">
                                  {isCurrent ? (
                                    <span className="text-xs text-indigo-600">Seçili</span>
                                  ) : (
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => choose(s.plantIds)}>
                                      Seç
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </section>

                {/* Paylaştırma */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Netleşen maliyetin paylaştırılması</CardTitle>
                    <CardDescription>
                      Her üyenin grup içinde ödeyeceği maliyet ve tek başına kalmaya göre indirimi. Paylaştırma DSG
                      sözleşmesiyle belirlenir; tablo seçenekleri karşılaştırır.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    {data.allocation ? (
                      <>
                        <table className="w-full min-w-[720px] text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                              <th className="py-2 pr-3">Üye</th>
                              <th className="py-2 pr-3 text-right">Tek başına</th>
                              {data.allocation.map((m) => (
                                <th key={m.id} className="py-2 pr-3 text-right">
                                  {m.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {data.allocation[0].shares.map((share, row) => (
                              <tr key={share.plantId} className="border-b last:border-0">
                                <td className="py-2 pr-3 font-medium text-slate-900">{share.plantName}</td>
                                <td className="py-2 pr-3 text-right text-slate-700">{tl(share.standaloneCost)}</td>
                                {data.allocation!.map((m) => {
                                  const s = m.shares[row];
                                  return (
                                    <td key={m.id} className="py-2 pr-3 text-right">
                                      <div className="text-slate-900">{tl(s.allocatedCost)}</div>
                                      <div className={`text-xs ${s.discountRatio < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                                        {pct(s.discountRatio, 0)} indirim
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          {data.allocation.map((m) => (
                            <div key={m.id} className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600">
                              <div className="mb-1 font-semibold text-slate-800">{m.label}</div>
                              <p>{m.description}</p>
                              {m.unstableSubgroups.length === 0 ? (
                                <p className="mt-2 flex items-center gap-1 text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> İstikrarlı: hiçbir alt grup ayrılarak daha ucuza
                                  gelmez.
                                </p>
                              ) : (
                                <p className="mt-2 flex items-start gap-1 text-rose-700">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  Ayrılmak isteyebilecek: {m.unstableSubgroups.map((g) => g.join(" + ")).join("; ")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-600">{data.allocationNote}</p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center text-sm text-slate-600">
                  Grup sonucu için en az iki üye (şirket) seçin.
                  {data.topSubsets[0] && (
                    <>
                      {" "}
                      En faydalı grup: <strong>{data.topSubsets[0].plantNames.join(" + ")}</strong> (
                      {tl(data.topSubsets[0].benefitTl)}).{" "}
                      <Button size="sm" variant="outline" className="ml-1 h-7" onClick={() => choose(data.topSubsets[0].plantIds)}>
                        Seç
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200 bg-slate-50/60 shadow-none">
              <CardContent className="space-y-1.5 p-4 text-xs leading-relaxed text-slate-600">
                <p>
                  <strong>Varsayımlar.</strong> Grup düzeyinde aynı dengesizlik fiyat formülü ve katsayıları uygulanır.
                  Her üyenin maliyeti şirket bazında uzlaştırılmış dengesizliktir. DSG kurma ve üyelik şartları
                  modellenmez; KÜPST santral bazında olduğundan DSG ile değişmez.
                </p>
                <p>
                  Fayda geçmiş verinin aynı üye bileşimiyle hesaplanır. Grup içinde GİP&apos;te yalnızca netleşmiş
                  pozisyon kapatılacağından, GİP senaryosunun faydası bu faydaya eklenemez.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
