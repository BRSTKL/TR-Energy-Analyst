"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Plus, Search, X } from "lucide-react";
import type { EpiasPowerPlant } from "@/lib/epias-plant/plant-data";

/** EPİAŞ adı çoğunlukla EIC kodunu da içerir ("BALABANLI RES-40W..."); varsa kısa ad gösterilir */
export const plantDisplayName = (p: EpiasPowerPlant) => p.shortName?.trim() || p.name;

/**
 * EPİAŞ santral arama ve çoklu seçim: kullanıcı ad veya EIC ile arar, sonuçlardan istediği kadar santrali
 * listeye ekler ve listeden çıkarabilir. Yeni proje penceresi ve EPİAŞ santral sayfası birlikte kullanır.
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EpiasPowerPlant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const searchId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const id = ++searchId.current;
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/epias/plants?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => {
          if (id !== searchId.current) return;
          if (!d.success) throw new Error(d.error);
          setResults(d.plants);
          setError(null);
        })
        .catch((e) => id === searchId.current && setError(e instanceof Error ? e.message : "Arama yapılamadı."))
        .finally(() => id === searchId.current && setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const isSelected = (p: EpiasPowerPlant) => selected.some((s) => s.id === p.id);
  const toggle = (p: EpiasPowerPlant) =>
    onChange(isSelected(p) ? selected.filter((s) => s.id !== p.id) : [...selected, p]);

  const text = compact ? "text-xs" : "text-sm";

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          className={`w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 ${text} text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500`}
          placeholder="Santral adı veya EIC kodu, örneğin Balabanlı RES"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        />
      </div>
      {searching && (
        <p className="text-xs text-slate-500">
          EPİAŞ&apos;a bağlanılıyor… İlk aramada santral listesi indirilir; bağlantı yoksa hata 30 saniye kadar sonra
          gösterilir.
        </p>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {results.length > 0 && (
        <div className={`${compact ? "max-h-40" : "max-h-64"} divide-y overflow-y-auto rounded-md border border-slate-200 bg-white`}>
          {results.map((p) => {
            const on = isSelected(p);
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(p)}
                aria-pressed={on}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${text} hover:bg-slate-50 ${
                  on ? "bg-indigo-50 text-indigo-900" : "text-slate-800"
                }`}
              >
                <span className="flex items-center gap-2">
                  {on ? <Check className="h-3.5 w-3.5 text-indigo-600" /> : <Plus className="h-3.5 w-3.5 text-slate-400" />}
                  {p.name}
                </span>
                <span className="text-2xs text-slate-400">{on ? "eklendi" : "ekle"}</span>
              </button>
            );
          })}
        </div>
      )}
      {!searching && !error && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-slate-500">Eşleşen santral yok.</p>
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
