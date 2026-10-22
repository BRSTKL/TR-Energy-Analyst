/**
 * Kayıtlı EPİAŞ şifresinin şifrelenmesi: AES-256-GCM, anahtar `CREDENTIALS_KEY` (64 hex karakter). Anahtar veritabanında
 * değil `.env`'de durur: veritabanı kopyası (yedek) tek başına şifreyi açmaz. Biçim: `v1:iv:etiket:şifreli` (base64).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(hex?: string): Buffer {
  const k = hex ?? process.env.CREDENTIALS_KEY;
  if (!k || !/^[0-9a-fA-F]{64}$/.test(k)) throw new Error("CREDENTIALS_KEY tanımlı değil ya da 64 hex karakter değil.");
  return Buffer.from(k, "hex");
}

export function sealSecret(plain: string, keyHex?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(keyHex), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function openSecret(sealed: string, keyHex?: string): string {
  const [v, iv, tag, data] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Şifreli kayıt biçimi tanınmadı.");
  const decipher = createDecipheriv("aes-256-gcm", key(keyHex), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
