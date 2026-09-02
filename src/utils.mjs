import { createHash } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function collapseWhitespace(value = "") {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function stripOrdinal(value) {
  return value.replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1");
}

export function canonicalLocation(value = "") {
  const upper = collapseWhitespace(value).toUpperCase().replace(/\s/g, "");
  const match = upper.match(/^((?:US|EU|CA)-(?:EAST|WEST|CENTRAL|NORTH|SOUTH))-(\d{1,2})([A-Z]?)$/);
  if (!match) return upper;
  return `${match[1]}-${match[2].padStart(2, "0")}${match[3]}`;
}

export function extractLocations(value = "") {
  const matches = value.toUpperCase().match(/(?:US|EU|CA)-(?:EAST|WEST|CENTRAL|NORTH|SOUTH)-\d{1,2}[A-Z]?/g) ?? [];
  return [...new Set(matches.map(canonicalLocation))];
}

export function locationRegion(value = "") {
  return canonicalLocation(value).split("-").slice(0, 2).join("-");
}

export function baseLocationCode(value = "") {
  return canonicalLocation(value).replace(/[A-Z]$/, "");
}

const MONTHS = new Map([
  ["january", 0], ["february", 1], ["march", 2], ["april", 3],
  ["may", 4], ["june", 5], ["july", 6], ["august", 7],
  ["september", 8], ["october", 9], ["november", 10], ["december", 11],
]);

function strictUtcDateTime(value, fallbackDate = null) {
  const normalized = stripOrdinal(value).replace(/(\d)(AM|PM)/i, "$1 $2");
  const full = normalized.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  const timeOnly = normalized.match(/^(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (!full && (!timeOnly || !fallbackDate)) return null;

  const month = full ? MONTHS.get(full[1].toLowerCase()) : fallbackDate.month;
  const day = full ? Number.parseInt(full[2], 10) : fallbackDate.day;
  const year = full ? Number.parseInt(full[3], 10) : fallbackDate.year;
  const hour12 = Number.parseInt(full ? full[4] : timeOnly[1], 10);
  const minute = Number.parseInt(full ? full[5] : timeOnly[2], 10);
  const meridiem = (full ? full[6] : timeOnly[3]).toUpperCase();
  if (month === undefined || hour12 < 1 || hour12 > 12 || minute > 59) return null;

  const hour = (hour12 % 12) + (meridiem === "PM" ? 12 : 0);
  const date = new Date(Date.UTC(year, month, day, hour, minute));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month
    || date.getUTCDate() !== day
    || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute
  ) return null;
  return { date, year, month, day };
}

export function parseUtcSchedule(value = "") {
  const text = collapseWhitespace(value);
  const match = text.match(/^(.+?)\s+-\s+(.+?)\s+UTC$/i);
  if (!match) return { startAt: null, endAt: null };
  const start = strictUtcDateTime(match[1]);
  const end = start ? strictUtcDateTime(match[2], start) : null;
  if (!start || !end) return { startAt: null, endAt: null };
  return { startAt: start.date.toISOString(), endAt: end.date.toISOString() };
}

export function extractExtendedDate(value = "") {
  const matches = [...collapseWhitespace(value).matchAll(
    /extended\s+(?:till|until|through)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4})/gi,
  )];
  const dates = matches.map((match) => strictUtcDateTime(`${match[1]} 12:00 AM`))
    .filter(Boolean)
    .map((result) => result.date.toISOString().slice(0, 10));
  return dates.sort().at(-1) ?? null;
}

export function uniqueBy(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
