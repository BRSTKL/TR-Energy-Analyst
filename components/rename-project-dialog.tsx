"use client";

import React, { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil, RefreshCw } from "lucide-react";
import { normalizeProjectName, PROJECT_NAME_MAX } from "@/lib/projects/name";

interface RenameProjectDialogProps {
  projectId: string;
  projectName: string;
  /** Ekranda görünen açıklama (teknik notlar ayıklanmış) */
  projectDescription?: string | null;
  onRenamed?: (name: string) => void;
}

/** Proje adını ve açıklamasını değiştirir: rapor kapağı ve indirilen dosyanın adı proje adıdır. */
export function RenameProjectDialog({ projectId, projectName, projectDescription, onRenamed }: RenameProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(projectName);
  const [desc, setDesc] = useState(projectDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const checked = normalizeProjectName(value);
  const unchanged = checked.ok && checked.value === projectName && desc.trim() === (projectDescription ?? "").trim();

  const handleSave = async () => {
    if (!checked.ok || unchanged || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: checked.value, description: desc }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Proje adı değiştirilemedi.");
      setOpen(false);
      onRenamed?.(json.project.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proje adı değiştirilemedi.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        setOpen(next);
        if (next) {
          setValue(projectName);
          setDesc(projectDescription ?? "");
        }
        else setError(null);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          title="Proje adını değiştir"
          aria-label="Proje adını değiştir"
          className="ml-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 align-middle hover:bg-slate-100 hover:text-slate-700"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Proje adını değiştir</DialogTitle>
          <DialogDescription className="text-xs text-slate-600">
            Rapor kapağında ve indirilen dosyanın adında proje adı görünür; açıklama yalnız proje kartında. Santraller ve
            hesaplar değişmez.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Proje adı</span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={PROJECT_NAME_MAX + 20}
              autoFocus
              autoComplete="off"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Açıklama (isteğe bağlı)</span>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </label>
          {!checked.ok && value.length > 0 && <p className="text-xs text-rose-700">{checked.error}</p>}
          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={!checked.ok || unchanged || saving} className="gap-1.5">
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                "Kaydet"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
