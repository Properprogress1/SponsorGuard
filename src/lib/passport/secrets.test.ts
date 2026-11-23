import { expect, it } from "vitest";
import {
  createShareToken,
  hashSharePasscode,
  hashShareToken,
  validShareToken,
} from "./secrets";

it("generates distinct 32-byte bearer tokens with fixed-width verifiers", () => {
  const first = createShareToken();
  expect(validShareToken(first)).toBe(true);
  expect(Buffer.from(first, "base64url").byteLength).toBe(32);
  expect(first).not.toBe(createShareToken());
  expect(hashShareToken(first)).toMatch(/^[a-f0-9]{64}$/);
  expect(validShareToken(hashShareToken(first))).toBe(false);
});

it("salts the passcode verifier per link", async () => {
  const a = hashShareToken(createShareToken());
  const b = hashShareToken(createShareToken());
  expect(await hashSharePasscode("example passcode", a)).toBe(
    await hashSharePasscode("example passcode", a),
  );
  expect(await hashSharePasscode("example passcode", a)).not.toBe(
    await hashSharePasscode("example passcode", b),
  );
});
