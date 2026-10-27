import { describe, expect, it } from "vitest";
import { errorsAgainst, firstSeen, hourly, meanAbsDiff, revisions, versionsByDay } from "@/lib/analysis/snapshot-report";
import type { Snapshot, SnapshotSeries } from "@/lib/pool/snapshot-store";

const series = (day: string, id: SnapshotSeries["id"], values: number[] | null, target: "tomorrow" | "today" = "tomorrow"): SnapshotSeries => ({
  id,
  target,
  day,
  endpoint: "/x",
  ok: values !== null,
  status: values === null ? 400 : null,
  error: values === null ? "HTTP 400" : null,
  count: values?.length ?? 0,
  items: (values ?? []).map((v, h) => ({ time: `${day}T${String(h).padStart(2, "0")}:00:00+03:00`, forecast: v })),
});
const snap = (wall: string, s: SnapshotSeries[]): Snapshot => ({ format: 1, takenAt: new Date(wall).toISOString(), wall, today: wall.slice(0, 10), tomorrow: "x", series: s });
const flat = (v: number) => Array(24).fill(v);

describe("snapshot-report", () => {
  const snaps = [
    snap("2026-10-27T08:02:00+03:00", [series("2026-10-28", "res-forecast", null)]),
    snap("2026-10-27T10:02:00+03:00", [series("2026-10-28", "res-forecast", flat(1000))]),
    snap("2026-10-27T12:25:00+03:00", [series("2026-10-28", "res-forecast", flat(1300))]),
    snap("2026-10-28T08:02:00+03:00", [series("2026-10-28", "res-forecast", flat(1100), "today")]),
  ];

  it("ilk dolu görülen çekimi bulur, ertesi günkü 'bugün' çekimini aynı güne katar", () => {
    const versions = versionsByDay(snaps).get("2026-10-28")!.get("res-forecast")!;
    expect(versions).toHaveLength(4);
    expect(firstSeen(versions, 24)!.wall).toBe("2026-10-27T10:02:00+03:00");
    expect(firstSeen([versions[0]])).toBeNull();
  });

  it("saatlik ortalama ve sürümler arası değişimi hesaplar", () => {
    const versions = versionsByDay(snaps).get("2026-10-28")!.get("res-forecast")!;
    const rev = revisions(versions, "forecast", "time");
    expect(rev.map((r) => r.meanAbsDiff)).toEqual([300, 200]);
    expect(rev[0].from).toBe("2026-10-27T10:02:00+03:00");
  });

  it("gerçekleşene hatayı sürüm sürüm verir", () => {
    const versions = versionsByDay(snaps).get("2026-10-28")!.get("res-forecast")!;
    const err = errorsAgainst(versions, "forecast", "time", flat(1200));
    expect(err.map((e) => e.mae)).toEqual([200, 100, 100]);
  });

  it("hourly 15 dakikalıkları saate ortalar, eksik saat null", () => {
    const items = [0, 15, 30, 45].map((m, i) => ({ time: `2026-10-28T03:${String(m).padStart(2, "0")}:00+03:00`, forecast: 100 * (i + 1) }));
    const h = hourly(items, "forecast", "time");
    expect(h[3]).toBe(250);
    expect(h[4]).toBeNull();
    expect(meanAbsDiff(h, h)).toBe(0);
    expect(meanAbsDiff(Array(24).fill(null), h)).toBeNull();
  });
});
