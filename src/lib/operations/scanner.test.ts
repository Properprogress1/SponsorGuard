// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { evidenceScanner } from "./scanner";

const file = {
  bytes: Uint8Array.from([37, 80, 68, 70, 45]),
  contentType: "application/pdf" as const,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("fails closed for unavailable scanners, ambiguous verdicts and redirects", async () => {
  vi.stubEnv("EVIDENCE_SCANNER_TOKEN", "test-only");
  vi.stubEnv("EVIDENCE_SCANNER_URL", "http://scanner.example.test");
  expect(evidenceScanner()).toBeNull();
  vi.stubEnv("EVIDENCE_SCANNER_URL", "https://scanner.example.test/scan");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ verdict: "unknown" }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(Response.json({ verdict: "infected" }))
    .mockResolvedValueOnce(Response.json({ verdict: "clean" }));
  vi.stubGlobal("fetch", fetcher);
  const scanner = evidenceScanner();
  if (!scanner) throw new Error("Scanner fixture is missing.");
  for (const verdict of [
    "unavailable",
    "unavailable",
    "unavailable",
    "infected",
    "clean",
  ])
    expect(await scanner.scan(file)).toBe(verdict);
  expect(fetcher).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({
      redirect: "error",
      cache: "no-store",
      method: "POST",
    }),
  );
});
