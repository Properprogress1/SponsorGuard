import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";

const port = 3100;
const url = new URL(process.env.LIGHTHOUSE_URL ?? `http://127.0.0.1:${port}`);
const paths = ["/", "/pricing", "/health-check", "/terms", "/privacy", "/dpa"];
const next = process.env.LIGHTHOUSE_URL
  ? null
  : spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { stdio: "inherit" },
    );

let chrome;
try {
  for (let attempt = 0; ; attempt++) {
    const ready = await fetch(new URL("/api/health", url))
      .then((response) => response.ok)
      .catch(() => false);
    if (ready) break;
    if (attempt >= 60 || (next && next.exitCode !== null)) {
      throw new Error(
        "The production server did not start. Run npm run build first.",
      );
    }
    await pause(500);
  }

  const installed = chromium.executablePath();
  chrome = await launch({
    chromePath:
      process.env.CHROME_PATH ||
      (existsSync(installed) ? installed : undefined),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
    logLevel: "silent",
  });

  for (const path of paths) {
    const results = await lighthouse(new URL(path, url).href, {
      port: chrome.port,
      onlyCategories: ["accessibility"],
      logLevel: "error",
    });
    const accessibility = results?.lhr.categories.accessibility;
    const score = Math.round((accessibility?.score ?? 0) * 100);
    console.log(`${path} Lighthouse accessibility ${score}/100`);
    if (score < 95 || results?.lhr.runtimeError) {
      for (const audit of accessibility?.auditRefs ?? []) {
        const detail = results.lhr.audits[audit.id];
        if (detail?.score !== null && detail?.score !== 1)
          console.error(detail?.title, detail?.explanation ?? "");
      }
      process.exitCode = 1;
    }
  }
} finally {
  await chrome?.kill();
  next?.kill();
}
