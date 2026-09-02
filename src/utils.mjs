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

export function parseUtcSchedule(value = "") {
  const text = collapseWhitespace(value);
  const match = text.match(/^(.+?)\s+-\s+(.+?)\s+UTC$/i);
  if (!match) return { startAt: null, endAt: null };
  if (!/\d{1,2}:\d{2}\s?(?:AM|PM)$/i.test(match[1]) || !/\d{1,2}:\d{2}\s?(?:AM|PM)$/i.test(match[2])) {
    return { startAt: null, endAt: null };
  }

  const normalize = (part) => stripOrdinal(part).replace(/(\d)(AM|PM)/i, "$1 $2");
  const startText = normalize(match[1]);
  const endHasDate = /[A-Za-z]+\s+\d{1,2},\s+\d{4}/.test(match[2]);
  const startDate = startText.match(/^([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
  const endText = endHasDate ? normalize(match[2]) : `${startDate} ${normalize(match[2])}`;
  const start = new Date(`${startText} UTC`);
  const end = new Date(`${endText} UTC`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { startAt: null, endAt: null };
  }
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function extractExtendedDate(value = "") {
  const match = collapseWhitespace(value).match(
    /extended\s+(?:till|until|through)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4})/i,
  );
  if (!match) return null;
  const date = new Date(`${stripOrdinal(match[1])} 00:00:00 UTC`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
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
