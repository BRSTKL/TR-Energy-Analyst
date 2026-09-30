"use client";

import React from "react";
import { Layers, Sun, Wind, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Bu sayıdan fazla santralde düğmeler yerine açılır liste (toplayıcı portföyünde 60+ düğme sayfayı dolduruyordu) */
export const PLANT_BUTTONS_MAX = 8;

const TypeIcon = ({ type }: { type: string }) =>
  type === "RES" ? (
    <Wind className="h-3.5 w-3.5 text-cyan-600" />
  ) : type === "GES" ? (
    <Sun className="h-3.5 w-3.5 text-amber-500" />
  ) : type === "HES" ? (
    <Zap className="h-3.5 w-3.5 text-blue-600" />
  ) : null;

/**
 * Sayfaların "Tüm portföy / santral" seçicisi: az santralde düğmeler, çok santralde "Tüm portföy" düğmesi ve
 * alfabetik açılır liste.
 */
export function PlantScopePicker({
  allId,
  allLabel,
  plants,
  value,
  onChange,
  label = "Analiz Kapsamı:",
}: {
  allId: string;
  allLabel: string;
  plants: Array<{ id: string; name: string; type?: string; detail?: string }>;
  value: string;
  onChange: (id: string) => void;
  label?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>}
      <Button variant={value === allId ? "default" : "outline"} size="sm" onClick={() => onChange(allId)} className="h-8 gap-1.5 text-xs">
        <Layers className="h-3.5 w-3.5" />
        {allLabel}
      </Button>
      {plants.length > PLANT_BUTTONS_MAX ? (
        <select
          aria-label="Santral seç"
          value={value === allId ? "" : value}
          onChange={(e) => onChange(e.target.value || allId)}
          className="h-8 max-w-xs rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 shadow-sm"
        >
          <option value="">Santral seçin… ({plants.length})</option>
          {[...plants]
            .sort((a, b) => a.name.localeCompare(b.name, "tr"))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {[p.name, p.type, p.detail].filter(Boolean).join(" · ")}
              </option>
            ))}
        </select>
      ) : (
        plants.map((p) => (
          <Button
            key={p.id}
            variant={value === p.id ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(p.id)}
            className="h-8 gap-1.5 text-xs"
          >
            {p.type && <TypeIcon type={p.type} />}
            {p.name}
            {p.detail ? ` (${p.detail})` : ""}
          </Button>
        ))
      )}
    </div>
  );
}
