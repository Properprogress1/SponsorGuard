import type { DocumentScanner } from "@/lib/documents/scanner";

export function evidenceScanner(): DocumentScanner | null {
  const address = process.env.EVIDENCE_SCANNER_URL;
  const secret = process.env.EVIDENCE_SCANNER_TOKEN;
  if (!address || !secret) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(address);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password
    )
      return null;
  } catch {
    return null;
  }

  return {
    async scan({ bytes, contentType }) {
      try {
        const result = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": contentType,
          },
          body: Buffer.from(bytes),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        if (!result.ok) return "unavailable";
        const body: unknown = await result.json();
        if (
          body &&
          typeof body === "object" &&
          "verdict" in body &&
          (body.verdict === "infected" || body.verdict === "clean")
        )
          return body.verdict;
      } catch {
        return "unavailable";
      }
      return "unavailable";
    },
  };
}
