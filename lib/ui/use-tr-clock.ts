"use client";

import { useEffect, useState } from "react";
import { trNowMinutes } from "./day-phase";

/** Türkiye saati (gün başından dakika); sunucuda ve ilk çizimde null (taşma uyuşmazlığı olmasın), sonra `everyMs`'de bir güncellenir */
export function useTrMinutes(everyMs = 30_000): number | null {
  const [m, setM] = useState<number | null>(null);
  useEffect(() => {
    setM(trNowMinutes());
    const t = setInterval(() => setM(trNowMinutes()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return m;
}
