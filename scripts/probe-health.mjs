try {
  const origin = new URL(process.env.MONITOR_ORIGIN ?? "");
  const localHttp =
    origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    (origin.protocol !== "https:" && !localHttp) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("invalid_origin");
  }

  const response = await fetch(new URL("/api/health", origin), {
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (
    response.status !== 200 ||
    !response.headers.get("content-type")?.startsWith("application/json") ||
    !response.headers
      .get("cache-control")
      ?.split(",")
      .some((directive) => directive.trim().toLowerCase() === "no-store") ||
    (await response.json())?.status !== "ok"
  ) {
    throw new Error("invalid_response");
  }

  console.log(JSON.stringify({ event: "liveness_probe", outcome: "ok" }));
} catch {
  console.error(JSON.stringify({ event: "liveness_probe", outcome: "failed" }));
  process.exitCode = 1;
}
