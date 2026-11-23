import type { DocumentMime } from "./model";

export type ScanVerdict = "clean" | "infected" | "unavailable" | "not_scanned";

export interface DocumentScanner {
  // Providers receive bytes and the validated MIME type. Never log either input.
  scan(
    document: Readonly<{ bytes: Uint8Array; contentType: DocumentMime }>,
  ): Promise<ScanVerdict>;
}

export const documentScanner: DocumentScanner = {
  async scan() {
    return "not_scanned";
  },
};
