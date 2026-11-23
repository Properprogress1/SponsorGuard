import { createHash, randomBytes, scrypt } from "node:crypto";
export const validShareToken = (value: string) =>
  /^[A-Za-z0-9_-]{43}$/.test(value);

export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createShareToken() {
  return randomBytes(32).toString("base64url");
}

export async function hashSharePasscode(passcode: string, tokenDigest: string) {
  return new Promise<string>((resolve, reject) => {
    scrypt(passcode, Buffer.from(tokenDigest, "hex"), 32, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString("hex"));
    });
  });
}
