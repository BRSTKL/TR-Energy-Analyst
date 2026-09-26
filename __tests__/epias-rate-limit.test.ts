import { describe, it, expect, vi, afterEach } from "vitest";
import { acquireEpiasSlot } from "@/lib/services/epias-service";

afterEach(() => vi.useRealTimers());

describe("EPİAŞ hız sınırı", () => {
  it("60 saniyede en fazla 70 istek; 71. istek pencere açılınca geçer", async () => {
    vi.useFakeTimers();
    let t = 0;
    const now = () => t;
    for (let i = 0; i < 70; i++) await acquireEpiasSlot(now);

    let passed = false;
    const next = acquireEpiasSlot(now).then(() => {
      passed = true;
    });
    await vi.advanceTimersByTimeAsync(30_000);
    t = 30_000;
    expect(passed).toBe(false);

    t = 60_000;
    await vi.advanceTimersByTimeAsync(31_000);
    await next;
    expect(passed).toBe(true);
  });
});
