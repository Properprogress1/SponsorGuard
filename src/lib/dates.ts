export function parseUkDate(value: string) {
  const uk = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = uk ? `${uk[3]}-${uk[2]}-${uk[1]}` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso.startsWith("0000-")) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso
    ? null
    : iso;
}

export function formatUkDate(date: string) {
  return date.split("-").reverse().join("/");
}

export function londonDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((part) => parts.find((entry) => entry.type === part)?.value)
    .join("-");
}
