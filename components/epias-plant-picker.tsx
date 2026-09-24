"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Building2, Check, ChevronDown, ChevronRight, Loader2, Plus, Search, X } from "lucide-react";
import { guessTechnologyFromName, type EpiasOrganization, type EpiasPowerPlant } from "@/lib/epias-plant/plant-data";

/** EPİAŞ adı çoğunlukla EIC kodunu da içerir ("BALABANLI RES-40W..."); varsa kısa ad gösterilir */
export const plantDisplayName = (p: EpiasPowerPlant) => p.shortName?.trim() || p.name;

type Mode = "plant" | "company";

/** Arama kutusunu 400 ms bekleyip EPİAŞ'a sorar; eski cevaplar yeni aramanın üstüne yazılmaz. */
function useDebouncedSearch<T>(query: string, url: (q: string) => string, pick: (d: any) => T[]) {
  const [results, setResults] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const searchId = useRef(0);
  const urlRef = useRef(url);
  const pickRef = useRef(pick);
  urlRef.current = url;
  pickRef.current = pick;

  useEffect(() => {
    const q = query.trim();
    const id = ++searchId.current;
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(urlRef.current(q))
        .then((r) => r.json())
        .then((d) => {
          if (id !== searchId.current) return;
          if (!d.success) throw new Error(d.error);
          setResults(pickRef.current(d));
          setError(null);
        })
        .catch((e) => id === searchId.current && setError(e instanceof Error ? e.message : "Arama yapılamadı."))
        .finally(() => id === searchId.current && setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  return { results, error, searching };
}

const techTag = (p: EpiasPowerPlant) => {
  const t = guessTechnologyFromName(p.name);
  if (t === "OTHER") return { label: "desteklenmiyor", addable: false, sure: false, className: "bg-slate-100 text-slate-500" };
  if (t) return { label: t, addable: true, sure: true, className: "bg-emerald-50 text-emerald-700" };
  // Addan anlaşılamayan santral tek tek eklenebilir, toplu eklemeye girmez (ör. "ENERJISA BANDIRMA SANTRALI" doğalgazdır)
  return { label: "tür belirsiz", addable: true, sure: false, className: "bg-amber-50 text-amber-700" };
};

/**
 * EPİAŞ santral arama ve çoklu seçim. İki yol:
 * - Santral adı: ad veya EIC ile arama, sonuçlardan tek tek ekleme
 * - Şirket adı: şirket (tüzel kişi) arama, şirketin santrallerini tek tek ya da hepsini birden ekleme
 * Uygulama RES, HES ve GES analiz eder; adından başka türde olduğu anlaşılan santraller (doğalgaz, kömür…) eklenemez.
 */
export function EpiasPlantPicker({
  selected,
  onChange,
  disabled = false,
  compact = false,
}: {
  selected: EpiasPowerPlant[];
  onChange: (plants: EpiasPowerPlant[]) => void;
  disabled?: boolean;
  /** Pencere içinde daha küçük yazı ve sonuç listesi */
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("plant");
  const [query, setQuery] = useState("");
  const plantSearch = useDebouncedSearch<EpiasPowerPlant>(
    mode === "plant" ? query : "",
    (q) => `/api/epias/plants?q=${encodeURIComponent(q)}`,
    (d) => d.plants
  );
  const orgSearch = useDebouncedSearch<EpiasOrganization>(
    mode === "company" ? query : "",
    (q) => `/api/epias/organizations?q=${encodeURIComponent(q)}`,
    (d) => d.organizations
  );
  const { error, searching } = mode === "plant" ? plantSearch : orgSearch;

  // Açılan şirketler ve santral listeleri
  const [openOrg, setOpenOrg] = useState<number | null>(null);
  const [orgPlants, setOrgPlants] = useState<Record<number, { plants: EpiasPowerPlant[]; withoutUevm: number } | "loading" | { error: string }>>({});

  const toggleOrg = (o: EpiasOrganization) => {
    if (openOrg === o.id) return setOpenOrg(null);
    setOpenOrg(o.id);
    const cur = orgPlants[o.id];
    if (cur && cur !== "loading" && !("error" in cur)) return;
    setOrgPlants((prev) => ({ ...prev, [o.id]: "loading" }));
    fetch(`/api/epias/organizations/${o.id}/plants`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setOrgPlants((prev) => ({ ...prev, [o.id]: { plants: d.plants, withoutUevm: d.withoutUevm } }));
      })
      .catch((e) => setOrgPlants((prev) => ({ ...prev, [o.id]: { error: e instanceof Error ? e.message : "Santraller alınamadı." } })));
  };

  const isSelected = (p: EpiasPowerPlant) => selected.some((s) => s.id === p.id);
  const toggle = (p: EpiasPowerPlant) => onChange(isSelected(p) ? selected.filter((s) => s.id !== p.id) : [...selected, p]);
  const addAll = (plants: EpiasPowerPlant[]) => onChange([...selected, ...plants.filter((p) => !isSelected(p))]);

  const text = compact ? "text-xs" : "text-sm";
  const listClass = `${compact ? "max-h-48" : "max-h-72"} divide-y overflow-y-auto overflow-x-hidden rounded-md border border-slate-200 bg-white`;

  const plantRow = (p: EpiasPowerPlant, showTag: boolean) => {
    const on = isSelected(p);
    const tag = techTag(p);
    return (
      <button
        key={p.id}
        type="button"
        disabled={disabled || (!tag.addable && !on)}
        onClick={() => toggle(p)}
        aria-pressed={on}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${text} hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${
          on ? "bg-indigo-50 text-indigo-900" : "text-slate-800"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2 break-words">
          {on ? <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" /> : <Plus className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          {showTag ? plantDisplayName(p) : p.name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {showTag && <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${tag.className}`}>{tag.label}</span>}
          <span className="text-2xs text-slate-400">{on ? "eklendi" : tag.addable ? "ekle" : ""}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="radiogroup" aria-label="Arama türü">
        {(
          [
            ["plant", "Santral adıyla"],
            ["company", "Şirket adıyla"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            disabled={disabled}
            onClick={() => {
              setMode(value);
              setQuery("");
            }}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              mode === value ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative">
        {mode === "plant" ? (
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        ) : (
          <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        )}
        <input
          className={`w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 ${text} text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500`}
          placeholder={mode === "plant" ? "Santral adı veya EIC kodu, örneğin Balabanlı RES" : "Şirket unvanı, örneğin Enerjisa Üretim"}
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        />
      </div>
      {mode === "company" && (
        <p className="text-2xs text-slate-500">
          EPİAŞ&apos;ta her tüzel kişi ayrı şirkettir; büyük gruplar santrallerini farklı şirketlerde tutabilir. Grubun
          tüm santralleri için birden çok şirketi açıp ekleyin.
        </p>
      )}
      {searching && (
        <p className="text-xs text-slate-500">
          EPİAŞ&apos;a bağlanılıyor… İlk aramada liste indirilir; bağlantı yoksa hata 30 saniye kadar sonra gösterilir.
        </p>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {mode === "plant" && plantSearch.results.length > 0 && (
        <div className={listClass}>{plantSearch.results.map((p) => plantRow(p, false))}</div>
      )}

      {mode === "company" && orgSearch.results.length > 0 && (
        <div className={listClass}>
          {orgSearch.results.map((o) => {
            const open = openOrg === o.id;
            const state = orgPlants[o.id];
            const loaded = state && state !== "loading" && !("error" in state) ? state : null;
            const addable = loaded?.plants.filter((p) => techTag(p).sure && !isSelected(p)) ?? [];
            return (
              <div key={o.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleOrg(o)}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${text} font-medium text-slate-800 hover:bg-slate-50`}
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 break-words">{o.name}</span>
                </button>
                {open && (
                  <div className="border-t bg-slate-50/60 pb-1 pl-5">
                    {state === "loading" && (
                      <p className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Şirketin santralleri alınıyor…
                      </p>
                    )}
                    {state && state !== "loading" && "error" in state && <p className="px-3 py-2 text-xs text-rose-700">{state.error}</p>}
                    {loaded && loaded.plants.length === 0 && (
                      <p className="px-3 py-2 text-xs text-slate-500">
                        Bu şirketin EPİAŞ&apos;ın santral bazında üretim yayımladığı santrali yok.
                      </p>
                    )}
                    {loaded && loaded.plants.length > 0 && (
                      <>
                        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span className="text-2xs text-slate-500">
                            {loaded.plants.length} santral
                            {loaded.withoutUevm > 0 && ` · ${loaded.withoutUevm} santralin üretimi yayımlanmıyor`}
                          </span>
                          <button
                            type="button"
                            disabled={disabled || addable.length === 0}
                            onClick={() => addAll(addable)}
                            className="rounded border border-indigo-200 bg-white px-2 py-0.5 text-2xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                          >
                            RES/HES/GES olanları ekle ({addable.length})
                          </button>
                        </div>
                        <div className="divide-y">{loaded.plants.map((p) => plantRow(p, true))}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!searching && !error && query.trim().length >= 2 && (mode === "plant" ? plantSearch.results : orgSearch.results).length === 0 && (
        <p className="text-xs text-slate-500">{mode === "plant" ? "Eşleşen santral yok." : "Eşleşen şirket yok."}</p>
      )}

      {selected.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-700">Seçilen santraller ({selected.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-indigo-800"
              >
                {plantDisplayName(p)}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`${plantDisplayName(p)} santralini listeden çıkar`}
                  onClick={() => toggle(p)}
                  className="rounded-full p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
