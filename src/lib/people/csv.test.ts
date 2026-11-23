import { describe, expect, it, vi } from "vitest";
import { importCsv, parseCsv, prepareCsv, readCsv } from "./csv";

const mapping = { full_name: "1", reference: "0", status: "2" };
const header = "Code,Name,State\r\n";

describe("people CSV import", () => {
  it("maps quoted fields and commits all validated rows in one call", async () => {
    const write = vi.fn().mockResolvedValue("done");
    await expect(
      importCsv(
        "workers",
        "\uFEFF" +
          header +
          'A1,"Synthetic, Worker",Active\r\nA2,Another Example,inactive',
        mapping,
        write,
      ),
    ).resolves.toEqual({ result: "done" });
    expect(write).toHaveBeenCalledExactlyOnceWith([
      { full_name: "Synthetic, Worker", reference: "A1", status: "active" },
      { full_name: "Another Example", reference: "A2", status: "inactive" },
    ]);
  });

  it.each(['A2,"Unclosed,active', "A2,Missing", "A2,Extra,active,ignored"])(
    "rejects malformed late records without calling the writer (%s)",
    async (invalid) => {
      const write = vi.fn();
      await expect(
        importCsv(
          "workers",
          header + "A1,Synthetic,active\r\n" + invalid,
          mapping,
          write,
        ),
      ).rejects.toThrow("Malformed CSV");
      expect(write).not.toHaveBeenCalled();
    },
  );

  it("rejects duplicate headers, ambiguous mappings and oversized row sets", () => {
    expect(() => parseCsv("Code,code\nA,B")).toThrow("distinct");
    expect(() =>
      prepareCsv("workers", header + "A1,Synthetic,active", {
        ...mapping,
        status: "1",
      }),
    ).toThrow("at most one");
    expect(() =>
      parseCsv(header + "A1,Synthetic,active\r\n".repeat(501)),
    ).toThrow("500");
  });

  it("reports row-level errors without logging field values or writing records", async () => {
    const write = vi.fn();
    const result = await importCsv(
      "workers",
      header + "A1,Synthetic,active\r\nA1,Another Example,unknown",
      mapping,
      write,
    );
    expect(result.errors).toEqual([
      expect.stringMatching(
        /^CSV record 3\. Status must .* Reference appears more than once/,
      ),
    ]);
    expect(write).not.toHaveBeenCalled();
  });

  it("validates RTW person selection and date order and normalises UK dates", () => {
    const header = "Worker,Individual,When,Method,Follow-up\n";
    const worker = "00000000-0000-4000-8000-000000002001";
    const mapping = {
      sponsored_worker_id: "0",
      engaged_individual_id: "1",
      checked_on: "2",
      method: "3",
      follow_up_on: "4",
    };
    const result = prepareCsv(
      "rtw",
      header + `${worker},,04/10/2026,online,01/10/2026\n,,31/02/2026,manual,`,
      mapping,
    );
    expect(result.values[0].checked_on).toBe("2026-10-04");
    expect(result.errors).toEqual([
      expect.stringContaining("before the check date"),
      expect.stringContaining("Choose exactly one"),
    ]);
    expect(result.errors[1]).toContain("must be a real date");
  });

  it("rejects invalid UTF-8 before parsing", async () => {
    const file = {
      size: 1,
      arrayBuffer: async () => Uint8Array.of(0xff).buffer,
    } as File;
    await expect(readCsv(file)).rejects.toThrow("UTF-8");
  });
});
