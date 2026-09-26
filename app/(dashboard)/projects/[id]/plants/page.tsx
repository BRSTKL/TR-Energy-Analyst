"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, CloudDownload, Factory, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettlementUnitCard } from "@/components/settlement-unit-card";
import { PLANT_TYPES } from "@/lib/plants/validation";

interface Plant {
  id: string;
  name: string;
  type: string;
  capacityMw: number;
  recordCount: number;
}

/** Düzenleme formundaki taslak (kurulu güç metin olarak tutulur: "12,5" yazılabilsin) */
interface Draft {
  name: string;
  type: string;
  capacityMw: string;
}

type RowMessage = { kind: "error" | "warning" | "success"; text: string };

const toDraft = (p: Plant): Draft => ({ name: p.name, type: p.type, capacityMw: String(p.capacityMw) });
const parseCapacity = (v: string) => Number(v.replace(",", "."));
const isDirty = (p: Plant, d: Draft) =>
  d.name.trim() !== p.name || d.type !== p.type || parseCapacity(d.capacityMw) !== p.capacityMw;

const EMPTY_DRAFT: Draft = { name: "", type: "RES", capacityMw: "" };

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function PlantsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [projectName, setProjectName] = useState("");
  const [plants, setPlants] = useState<Plant[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [messages, setMessages] = useState<Record<string, RowMessage>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Çift tıklamada aynı isteğin iki kez gitmesini engeller (state güncellemesi gelmeden ikinci tık)
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Proje yüklenemedi.");
      setProjectName(data.project.name);
      setPlants(data.project.plants);
      setDrafts(Object.fromEntries(data.project.plants.map((p: Plant) => [p.id, toDraft(p)])));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Proje yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(key);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const setMessage = (key: string, msg: RowMessage | null) =>
    setMessages((prev) => {
      const next = { ...prev };
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });

  const savePlant = (plant: Plant) =>
    run(plant.id, async () => {
      const draft = drafts[plant.id];
      const res = await fetch(`/api/projects/${projectId}/plants/${plant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, type: draft.type, capacityMw: parseCapacity(draft.capacityMw) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage(plant.id, { kind: "error", text: data.error || "Kaydedilemedi." });
        return;
      }
      setPlants((prev) => prev.map((p) => (p.id === plant.id ? data.plant : p)));
      setDrafts((prev) => ({ ...prev, [plant.id]: toDraft(data.plant) }));
      setMessage(
        plant.id,
        data.warnings?.length ? { kind: "warning", text: data.warnings.join(" ") } : { kind: "success", text: "Kaydedildi." }
      );
    });

  const deletePlant = (plant: Plant) =>
    run(plant.id, async () => {
      const res = await fetch(`/api/projects/${projectId}/plants/${plant.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      // 404: başka bir sekmede zaten silinmiş; listeden kaldırmak doğru sonuç
      if (!res.ok && res.status !== 404) {
        setMessage(plant.id, { kind: "error", text: data.error || "Silinemedi." });
        return;
      }
      setConfirmDelete(null);
      setPlants((prev) => prev.filter((p) => p.id !== plant.id));
      setMessage(plant.id, null);
      setMessage("list", { kind: "success", text: data.message || `"${plant.name}" silindi.` });
    });

  const addPlant = () =>
    run("new", async () => {
      const res = await fetch(`/api/projects/${projectId}/plants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newDraft, capacityMw: parseCapacity(newDraft.capacityMw) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage("new", { kind: "error", text: data.error || "Eklenemedi." });
        return;
      }
      setPlants((prev) => [...prev, data.plant]);
      setDrafts((prev) => ({ ...prev, [data.plant.id]: toDraft(data.plant) }));
      setNewDraft(EMPTY_DRAFT);
      setMessage("new", null);
      setMessage("list", { kind: "success", text: `"${data.plant.name}" eklendi. Verisini içe aktarma ekranından yükleyebilirsiniz.` });
    });

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setMessage(id, null);
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs">
            <Link href="/projects" className="flex items-center gap-1 text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-3 w-3" /> Projelerim
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-slate-700">{projectName}</span>
          </div>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Santraller</h1>
              <p className="mt-1 text-sm text-slate-600">
                Santral ekleyin, adını, türünü veya kurulu gücünü düzeltin ya da kaldırın. Saatlik veriler
                içe aktarma ekranından yüklenir.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="bg-sky-600 text-white hover:bg-sky-700">
                <Link href={`/projects/epias?projectId=${projectId}`}>
                  <CloudDownload className="mr-1.5 h-3.5 w-3.5" /> EPİAŞ&apos;tan santral ekle
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/projects/${projectId}/import`}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Veri Yükle
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/projects/${projectId}/results`}>Sonuçlar</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        {loadError && <Notice msg={{ kind: "error", text: loadError }} />}
        {messages.list && <Notice msg={messages.list} />}

        <SettlementUnitCard projectId={projectId} />

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Factory className="h-4 w-4 text-indigo-600" /> Mevcut santraller
            </CardTitle>
            <CardDescription>
              Ad değişikliği mevcut kayıtları etkilemez. Silme, santralin tüm saatlik kayıtlarını da siler
              (öncesinde veritabanı yedeklenir).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-slate-500">Yükleniyor...</p>}
            {!loading && plants.length === 0 && !loadError && (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                Bu projede henüz santral yok. Aşağıdan ekleyin.
              </p>
            )}

            {plants.map((plant) => {
              const draft = drafts[plant.id] ?? toDraft(plant);
              const dirty = isDirty(plant, draft);
              const rowBusy = busy === plant.id;
              return (
                <div key={plant.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px_140px_auto] sm:items-end">
                    <Field label="Santral adı">
                      <input
                        className={inputClass}
                        value={draft.name}
                        onChange={(e) => updateDraft(plant.id, { name: e.target.value })}
                      />
                    </Field>
                    <Field label="Tür">
                      <TypeSelect value={draft.type} onChange={(type) => updateDraft(plant.id, { type })} />
                    </Field>
                    <Field label="Kurulu güç (MW)">
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={draft.capacityMw}
                        onChange={(e) => updateDraft(plant.id, { capacityMw: e.target.value })}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => savePlant(plant)}
                        disabled={!dirty || busy !== null}
                        className="bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" /> {rowBusy && dirty ? "Kaydediliyor..." : "Kaydet"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDelete(plant.id)}
                        disabled={busy !== null}
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        aria-label={`${plant.name} santralini sil`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    {plant.recordCount > 0
                      ? `${plant.recordCount.toLocaleString("tr-TR")} saatlik kayıt`
                      : "Henüz veri yüklenmedi"}
                  </div>

                  {confirmDelete === plant.id && (
                    <div className="mt-3 flex flex-col gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        <strong>{plant.name}</strong> ve{" "}
                        {plant.recordCount > 0
                          ? `${plant.recordCount.toLocaleString("tr-TR")} saatlik kaydı`
                          : "tanımı"}{" "}
                        silinecek. Emin misiniz?
                      </span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)} disabled={rowBusy}>
                          Vazgeç
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => deletePlant(plant)}
                          disabled={rowBusy}
                          className="bg-rose-600 text-white hover:bg-rose-700"
                        >
                          {rowBusy ? "Siliniyor..." : "Evet, sil"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {messages[plant.id] && <Notice msg={messages[plant.id]} compact />}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-emerald-600" /> Santral ekle
            </CardTitle>
            <CardDescription>
              Santrali elle tanımlayıp verisini dosyadan yükleyin ya da{" "}
              <Link href={`/projects/epias?projectId=${projectId}`} className="font-medium text-sky-700 underline">
                EPİAŞ&apos;tan adıyla arayıp ekleyin
              </Link>{" "}
              (veri otomatik çekilir).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px_140px_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                addPlant();
              }}
            >
              <Field label="Santral adı">
                <input
                  className={inputClass}
                  placeholder="Örn: RES_3"
                  value={newDraft.name}
                  onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </Field>
              <Field label="Tür">
                <TypeSelect value={newDraft.type} onChange={(type) => setNewDraft((d) => ({ ...d, type }))} />
              </Field>
              <Field label="Kurulu güç (MW)">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="Örn: 45"
                  value={newDraft.capacityMw}
                  onChange={(e) => setNewDraft((d) => ({ ...d, capacityMw: e.target.value }))}
                />
              </Field>
              <Button type="submit" size="sm" disabled={busy !== null} className="bg-emerald-600 text-white hover:bg-emerald-700">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> {busy === "new" ? "Ekleniyor..." : "Ekle"}
              </Button>
            </form>
            {messages.new && <Notice msg={messages.new} compact />}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function TypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {PLANT_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function Notice({ msg, compact }: { msg: RowMessage; compact?: boolean }) {
  const styles = {
    error: { cls: "border-rose-200 bg-rose-50 text-rose-700", Icon: AlertCircle },
    warning: { cls: "border-amber-200 bg-amber-50 text-amber-800", Icon: AlertTriangle },
    success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: CheckCircle2 },
  }[msg.kind];
  return (
    <div className={`flex items-start gap-2 rounded-md border ${styles.cls} ${compact ? "mt-2 p-2 text-xs" : "p-3 text-sm"}`}>
      <styles.Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{msg.text}</span>
    </div>
  );
}
