import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatToEpiasIso,
  epiasDateToWallClock,
  normalizeSystemDirection,
  getEpiasCredentials,
  getEpiasTgt,
  testEpiasConnection,
} from "@/lib/services/epias-service";

describe("EPİAŞ Service - Tarih ve Yön Dönüşümleri", () => {
  it("formatToEpiasIso fonksiyonu başlangıç ve bitiş saatlerini EPİAŞ saat dilimiyle (+03:00) formatlamalıdır", () => {
    const startIso = formatToEpiasIso("2024-08-01", false);
    expect(startIso).toBe("2024-08-01T00:00:00+03:00");

    const endIso = formatToEpiasIso("2024-08-01", true);
    expect(endIso).toBe("2024-08-01T23:00:00+03:00");

    const dateObj = new Date("2024-10-15T12:00:00Z");
    const formattedObj = formatToEpiasIso(dateObj, false);
    expect(formattedObj).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\+03:00$/);
  });

  it("formatToEpiasIso Date girdisinde makinenin saat diliminden bağımsız olarak UTC gününü kullanmalıdır", () => {
    // Üretim dosyasının son saati (duvar saati konvansiyonu): 31.12.2025 23:00
    expect(formatToEpiasIso(new Date("2025-12-31T23:00:00.000Z"), true)).toBe(
      "2025-12-31T23:00:00+03:00"
    );
  });

  it("epiasDateToWallClock EPİAŞ saatini Türkiye duvar saati olarak UTC alanlarına yazmalıdır", () => {
    const d = epiasDateToWallClock("2025-01-01T00:00:00+03:00");
    expect(d.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(epiasDateToWallClock("2025-06-15T14:00:00+03:00").getUTCHours()).toBe(14);
    // Üretim parser'ının aynı saat için ürettiği zaman damgasıyla birebir eşleşmeli
    expect(d.getTime()).toBe(Date.UTC(2025, 0, 1, 0));
  });

  it("normalizeSystemDirection smpDirectionId değerlerine göre doğru yönü belirlemelidir", () => {
    expect(normalizeSystemDirection("Enerji Açığı", 1)).toBe("DEFICIT");
    expect(normalizeSystemDirection("Enerji Fazlası", 2)).toBe("SURPLUS");
    expect(normalizeSystemDirection("Enerji Fazlası", 3)).toBe("SURPLUS");
    expect(normalizeSystemDirection("Dengede", 0)).toBe("BALANCED");
  });

  it("normalizeSystemDirection metin bazlı Türkçe ve İngilizce sistem yönlerini doğru tespit etmelidir", () => {
    expect(normalizeSystemDirection("Açık")).toBe("DEFICIT");
    expect(normalizeSystemDirection("Enerji Açığı")).toBe("DEFICIT");
    expect(normalizeSystemDirection("ENERGY_DEFICIT")).toBe("DEFICIT");

    expect(normalizeSystemDirection("Fazla")).toBe("SURPLUS");
    expect(normalizeSystemDirection("Enerji Fazlası")).toBe("SURPLUS");
    expect(normalizeSystemDirection("SURPLUS")).toBe("SURPLUS");

    expect(normalizeSystemDirection("Dengede")).toBe("BALANCED");
    expect(normalizeSystemDirection("IN_BALANCE")).toBe("BALANCED");
  });

  it("normalizeSystemDirection yön bilgisi eksik olduğunda SMF ve PTF kıyaslamasıyla fallback yapmalıdır", () => {
    // SMF > PTF -> Sistem enerji açığında
    expect(normalizeSystemDirection(undefined, undefined, 2500, 3000)).toBe("DEFICIT");
    // SMF < PTF -> Sistem enerji fazlasında
    expect(normalizeSystemDirection(undefined, undefined, 3000, 2500)).toBe("SURPLUS");
    // SMF === PTF -> Dengede
    expect(normalizeSystemDirection(undefined, undefined, 2800, 2800)).toBe("BALANCED");
  });
});

describe("EPİAŞ Service - Kimlik Bilgileri ve TGT", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("getEpiasCredentials .env içerisindeki kullanıcı adı ve şifreyi döndürmelidir", () => {
    process.env.EPIAS_USERNAME = "test@example.com";
    process.env.EPIAS_PASSWORD = "SecretPassword123";

    const creds = getEpiasCredentials();
    expect(creds.username).toBe("test@example.com");
    expect(creds.password).toBe("SecretPassword123");
  });

  it("getEpiasCredentials kimlik bilgileri eksikse açıklayıcı hata fırlatmalıdır", () => {
    delete process.env.EPIAS_USERNAME;
    delete process.env.EPIAS_PASSWORD;

    expect(() => getEpiasCredentials()).toThrow(/EPİAŞ kimlik bilgileri bulunamadı/);
  });

  it("testEpiasConnection geçersiz kimlik bilgilerinde ok: false ve hata mesajı dönmelidir", async () => {
    process.env.EPIAS_USERNAME = "invalid_user@test.com";
    process.env.EPIAS_PASSWORD = "wrong_password";

    const result = await testEpiasConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  }, 15000);
});
