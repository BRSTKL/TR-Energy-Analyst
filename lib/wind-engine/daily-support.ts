/** Günlük RES akışının sınırlı süreli veri yenilemesi ve hava çalışma izi. */
import { spawn } from "node:child_process";
export async function windRunMetadata() {
  const rows = await Promise.all(
    ["ecmwf_ifs025", "dwd_icon_eu", "ncep_gfs013", "ncep_gfs025"].map(async (model) => {
      try {
        const response = await fetch(
          `https://api.open-meteo.com/data/${model}/static/meta.json`,
          { signal: AbortSignal.timeout(15_000) }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const meta = await response.json();
        const iso = (n: unknown) =>
          typeof n === "number" && Number.isFinite(n) && n > 0
            ? new Date(n * 1000).toISOString()
            : null;
        return {
          model,
          runInit: iso(meta.last_run_initialisation_time),
          availableAt: iso(meta.last_run_availability_time),
        };
      } catch {
        return { model, runInit: null, availableAt: null };
      }
    })
  );
  return { runInit: rows[0].runInit, extra: rows.slice(1) };
}

/** Süre dolunca tsx dahil tüm süreç grubunu kapatır; ağ hatası eski kullanılabilir girdileri silmez. */
export function runWindInputStep(
  args: string[],
  timeoutMs: number
): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--env-file=.env",
        "node_modules/.bin/tsx",
        "--tsconfig",
        "tsconfig.json",
        ...args,
      ],
      { detached: true, stdio: "ignore" }
    );
    let timedOut = false;
    const kill = (signal: NodeJS.Signals) => {
      if (child.pid)
        try {
          process.kill(-child.pid, signal);
        } catch {
          /* grup bitmiş */
        }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      setTimeout(() => kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      resolve({ code: 1, timedOut });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      kill("SIGKILL");
      resolve({ code, timedOut });
    });
  });
}
export async function refreshWindInputs(cutoff: number): Promise<void> {
  for (const script of [
    "realtime-sync",
    "ptf-recent-sync",
    "wind-forecast-sync",
    "wind-models-sync",
    "wind-sync",
  ]) {
    const left = cutoff - Date.now();
    if (left < 16 * 60_000) {
      console.log(`RES ${script}: kesime az kaldı, atlandı`);
      continue;
    }
    const result = await runWindInputStep(
      [`scripts/${script}.mts`],
      Math.min(6 * 60_000, left - 15 * 60_000)
    );
    console.log(
      `RES ${script}: ${result.code === 0 ? "tamam" : result.timedOut ? "zaman aşımı" : "başarısız; mevcut veri kullanılacak"}`
    );
  }
}
