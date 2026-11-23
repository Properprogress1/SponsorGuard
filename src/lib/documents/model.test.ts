import { describe, expect, it, vi } from "vitest";
import { maxDocumentBytes, validateDocumentFile } from "./model";
import { documentScanner } from "./scanner";

function file(type: string, contents: number[]) {
  return {
    size: contents.length,
    type,
    arrayBuffer: async () => Uint8Array.from(contents).buffer,
  } as File;
}

describe("validateDocumentFile", () => {
  it.each([
    ["application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]],
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ])("recognises the signature for %s", async (mime, bytes) => {
    await expect(
      validateDocumentFile(file(mime, bytes)),
    ).resolves.toMatchObject({ contentType: mime });
  });

  it("rejects an executable claiming to be a PDF and a truncated image signature", async () => {
    for (const invalid of [
      file("application/pdf", [0x4d, 0x5a]),
      file("image/png", [0x89, 0x50]),
    ]) {
      await expect(validateDocumentFile(invalid)).resolves.toEqual({
        error: expect.stringContaining("contents"),
      });
    }
  });

  it("rejects absent or unsupported MIME types even with a known signature", async () => {
    for (const mime of ["", "image/svg+xml", "text/plain"]) {
      await expect(
        validateDocumentFile(file(mime, [0xff, 0xd8, 0xff])),
      ).resolves.toMatchObject({ error: expect.stringContaining("PDF") });
    }
  });

  it.each([0, maxDocumentBytes + 1])(
    "rejects size %i without buffering bytes",
    async (size) => {
      const arrayBuffer = vi.fn();
      await expect(
        validateDocumentFile({
          size,
          type: "application/pdf",
          arrayBuffer,
        } as unknown as File),
      ).resolves.toMatchObject({ error: expect.stringContaining("5 MiB") });
      expect(arrayBuffer).not.toHaveBeenCalled();
    },
  );

  it("the stub reports that it did not scan the file", async () => {
    await expect(
      documentScanner.scan({
        bytes: new Uint8Array(),
        contentType: "application/pdf",
      }),
    ).resolves.toBe("not_scanned");
  });
});
