import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nearestCell, serviceAccountAssertion, turkeyBoxWkt, weathernextQuery, weathernextRunsForTargetDay } from "@/lib/weather/weathernext";
import { WEATHER_RUN_RULES } from "@/lib/forecast/info-time";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wn-"));
const keyFile = path.join(dir, "sa.json");
const prev = process.env.WEATHERNEXT_KEY_FILE;

beforeAll(() => {
  fs.writeFileSync(keyFile, JSON.stringify({ client_email: "sa@test.iam", private_key: pem, token_uri: "https://token.test/t", project_id: "p1" }));
  process.env.WEATHERNEXT_KEY_FILE = keyFile;
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  if (prev === undefined) delete process.env.WEATHERNEXT_KEY_FILE;
  else process.env.WEATHERNEXT_KEY_FILE = prev;
});

describe("WeatherNext istemcisi", () => {
  it("servis hesabı JWT'si yalnız BigQuery okuma kapsamıyla imzalanır", () => {
    const jwt = serviceAccountAssertion({ client_email: "sa@test.iam", private_key: pem, token_uri: "https://token.test/t" }, 1000);
    const [h, p, s] = jwt.split(".");
    expect(crypto.createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims.scope).toBe("https://www.googleapis.com/auth/bigquery.readonly");
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it("sorgu: kota sınırını iletir, bitmemiş işi ve sayfaları toplar", async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      const json = (b: unknown) => ({ json: async () => b, status: 200 }) as Response;
      if (url.startsWith("https://token.test")) return json({ access_token: "tok", expires_in: 3600 });
      if (url.endsWith("/queries")) return json({ jobComplete: false, jobReference: { jobId: "j1", location: "US" }, totalBytesBilled: "10485760" });
      if (!url.includes("pageToken")) return json({ jobComplete: true, schema: { fields: [{ name: "a" }] }, rows: [{ f: [{ v: "1" }] }], pageToken: "p2" });
      return json({ jobComplete: true, schema: { fields: [{ name: "a" }] }, rows: [{ f: [{ v: "2" }] }] });
    }) as unknown as typeof fetch;
    const r = await weathernextQuery("SELECT 1", { maxBytesBilled: 5e9, fetchImpl: fake });
    expect(r.rows).toEqual([["1"], ["2"]]);
    expect(r.fields).toEqual(["a"]);
    expect(r.bytesBilled).toBe(10485760);
    const sent = JSON.parse(calls.find((c) => c.url.endsWith("/queries"))!.body!);
    expect(sent.maximumBytesBilled).toBe("5000000000");
    expect(sent.location).toBe("US");
  });

  it("BigQuery hatası açık mesajla yükselir", async () => {
    const fake = (async (url: string) =>
      ({ json: async () => (url.startsWith("https://token.test") ? { access_token: "tok" } : { error: { code: 403, message: "Quota exceeded" } }) }) as Response) as unknown as typeof fetch;
    await expect(weathernextQuery("SELECT 1", { fetchImpl: fake })).rejects.toThrow(/403: Quota exceeded/);
  });

  it("en yakın hücre 0,1° katı; Türkiye kutusu kapalı çokgen", () => {
    expect(nearestCell(39.93, 32.85)).toEqual({ latitude: 39.9, longitude: 32.9 });
    expect(nearestCell(36.04, 27.96)).toEqual({ latitude: 36, longitude: 28 });
    expect(turkeyBoxWkt()).toMatch(/^POLYGON\(\(25\.5 35\.5, .* 25\.5 35\.5\)\)$/);
  });
});

describe("WeatherNext bilgi zamanı", () => {
  it("hedef gün için kesimden önce elde olan çalışma D-1 00 UTC, yedeği D-2 18 UTC", () => {
    const [a, b] = weathernextRunsForTargetDay("2026-11-18", WEATHER_RUN_RULES.weathernext3.publishDelayMs);
    expect(new Date(a).toISOString()).toBe("2026-11-17T00:00:00.000Z");
    expect(new Date(b).toISOString()).toBe("2026-11-16T18:00:00.000Z");
    // Çalışma + yayım gecikmesi kesimden (D-1 09:30 UTC) önce
    expect(a + WEATHER_RUN_RULES.weathernext3.publishDelayMs).toBeLessThanOrEqual(Date.parse("2026-11-17T09:30:00Z"));
  });
  it("gecikme 9,5 saati aşarsa bir önceki çalışmaya düşer", () => {
    const [a] = weathernextRunsForTargetDay("2026-11-18", 9.6 * 3_600_000);
    expect(new Date(a).toISOString()).toBe("2026-11-16T18:00:00.000Z");
  });
});
