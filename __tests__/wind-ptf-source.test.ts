import { it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), query: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn().mockResolvedValue({ id: "p", name: "p", plants: [] }),
    },
    marketData: { findMany: mocks.query },
  },
}));
vi.mock("@/lib/services/ptf-recent", () => ({ readPtfMap: mocks.read }));
vi.mock("@/lib/services/response-cache", () => ({
  cachedForProject: (_id: string, _key: string, read: () => unknown) => read(),
}));
import { projectWindForecast } from "@/lib/wind-engine/forecast";
it("SMF bekleyen günün yayımlanmış PTF'sini ortak fiyat okuyucusundan alır", async () => {
  const now = Date.UTC(2026, 9, 23, 6),
    target = Date.UTC(2026, 9, 24);
  mocks.read.mockResolvedValue(new Map([[target - 86400000, 100]]));
  await projectWindForecast("p", now, { shadow: true });
  expect(mocks.read).toHaveBeenCalledWith(expect.any(Number), target);
});
