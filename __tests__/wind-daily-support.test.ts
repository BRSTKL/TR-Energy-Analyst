import { it, expect, vi, afterEach } from "vitest";
import { windRunMetadata, refreshWindInputs } from "@/lib/wind-engine/daily-support";
afterEach(() => vi.unstubAllGlobals());
it("hava metadata hatasını bilinmeyen olarak saklar, çalışma uydurmaz", async () => {
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.includes("ecmwf")) throw new Error("offline");
    return { ok: true, json: async () => ({ last_run_initialisation_time: 1792800000 }) };
  });
  const result = await windRunMetadata();
  expect(result.runInit).toBeNull();
  expect(result.extra).toHaveLength(3);
  expect(result.extra[0].availableAt).toBeNull();
});
it("kesime 15 dakika kala yenileme süreci başlatmaz", async () => {
  await expect(refreshWindInputs(Date.now() + 15 * 60000)).resolves.toBeUndefined();
});
