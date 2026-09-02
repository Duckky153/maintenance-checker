import { baseLocationCode, canonicalLocation } from "./utils.mjs";

function finding(rule, severity, title, eventIds, detail, evidence) {
  return { id: `${rule}:${eventIds.join(":")}`, rule, severity, title, eventIds, detail, evidence };
}

function compareLocations(event) {
  if (!event.titleLocation || !event.fieldLocation) return null;
  const title = canonicalLocation(event.titleLocation);
  const field = canonicalLocation(event.fieldLocation);
  if (title === field) return null;
  if (baseLocationCode(title) !== baseLocationCode(field)) {
    return finding(
      "location-conflict",
      "high",
      "Location conflict",
      [event.id],
      `The title names ${title}, while the structured location field names ${field}.`,
      { titleLocation: title, fieldLocation: field },
    );
  }
  return null;
}

function twelveHourMinutes(hourText, minuteText, meridiemText) {
  const hour12 = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;
  return (hour12 % 12) * 60 + minute + (meridiemText.toUpperCase() === "PM" ? 12 * 60 : 0);
}

function findLocalUtcConflict(event) {
  const text = event.description || "";
  const pattern = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*ET\s*\(\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*UTC\s*\)/gi;
  for (const match of text.matchAll(pattern)) {
    const localMinutes = twelveHourMinutes(match[1], match[2], match[3]);
    const utcMinutes = twelveHourMinutes(match[4], match[5], match[6]);
    if (localMinutes === null || utcMinutes === null) continue;
    const offsetMinutes = (utcMinutes - localMinutes + 24 * 60) % (24 * 60);
    if (![240, 300].includes(offsetMinutes)) {
      const localTime = `${match[1]}:${match[2]} ${match[3].toUpperCase()} ET`;
      const utcTime = `${match[4]}:${match[5]} ${match[6].toUpperCase()} UTC`;
      return finding(
        "local-utc-time-conflict",
        "high",
        "Local and UTC times conflict",
        [event.id],
        `${localTime} cannot correspond to ${utcTime}; Eastern Time is four or five hours behind UTC.`,
        { localTime, utcTime, validOffsetsHours: [4, 5] },
      );
    }
  }
  return null;
}

function dateOnly(value) {
  return value ? value.slice(0, 10) : null;
}

export function validateEvents(events, now = new Date()) {
  const findings = [];

  for (const event of events) {
    const locationFinding = compareLocations(event);
    if (locationFinding) findings.push(locationFinding);

    if (event.kind === "maintenance") {
      const timeFinding = findLocalUtcConflict(event);
      if (timeFinding) findings.push(timeFinding);

      const missing = [
        ["schedule", event.scheduleText],
        ["component", event.component],
        ["location", event.fieldLocation || event.titleLocation],
        ["description", event.description],
      ].filter(([, value]) => !value).map(([field]) => field);
      if (missing.length && event.sourceKinds.includes("status-page")) {
        findings.push(finding(
          "missing-fields",
          "medium",
          "Handoff fields missing",
          [event.id],
          `Missing ${missing.join(", ")}.`,
          { missing },
        ));
      }

      if (event.extendedThroughDate && event.endAt && event.extendedThroughDate > dateOnly(event.endAt)) {
        findings.push(finding(
          "extension-not-in-schedule",
          "high",
          "Extension is not reflected in the schedule field",
          [event.id],
          `An update extends the work through ${event.extendedThroughDate}, but the schedule field ends ${dateOnly(event.endAt)}.`,
          { extendedThroughDate: event.extendedThroughDate, scheduleEnd: event.endAt },
        ));
      }

      if (event.startAt && event.endAt && event.endAt <= event.startAt) {
        findings.push(finding(
          "invalid-window",
          "high",
          "Maintenance window is invalid",
          [event.id],
          "The parsed end time is not after the start time.",
          { startAt: event.startAt, endAt: event.endAt },
        ));
      }

      const extensionStillCurrent = event.extendedThroughDate && event.extendedThroughDate >= dateOnly(now.toISOString());
      if (event.phase === "active" && event.endAt && new Date(event.endAt) < now && !extensionStillCurrent) {
        findings.push(finding(
          "active-after-end",
          "medium",
          "Active notice is past its scheduled end",
          [event.id],
          `The notice is active although its schedule ended at ${event.endAt}.`,
          { endAt: event.endAt },
        ));
      }
    }

    const lifecycle = event.updates.map((update) => update.status.toLowerCase());
    const monitoringIndex = lifecycle.indexOf("monitoring");
    const laterInvestigating = monitoringIndex >= 0 && lifecycle.slice(monitoringIndex + 1).includes("investigating");
    if (laterInvestigating) {
      findings.push(finding(
        "reopened-after-monitoring",
        "medium",
        "Incident returned to investigating",
        [event.id],
        "The update history moved from monitoring back to investigating before resolution.",
        { lifecycle: event.updates.map((update) => update.status) },
      ));
    }
  }

  const scheduled = events.filter((event) =>
    event.kind === "maintenance"
    && ["active", "upcoming"].includes(event.phase)
    && event.startAt
    && event.endAt
    && !compareLocations(event),
  );
  for (let leftIndex = 0; leftIndex < scheduled.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < scheduled.length; rightIndex += 1) {
      const left = scheduled[leftIndex];
      const right = scheduled[rightIndex];
      if (left.id === right.id) continue;
      const site = (event) => baseLocationCode(event.fieldLocation || event.titleLocation || "");
      const leftLocation = site(left);
      const rightLocation = site(right);
      const overlap = left.startAt < right.endAt && right.startAt < left.endAt;
      if (leftLocation && leftLocation === rightLocation && overlap) {
        findings.push(finding(
          "overlapping-windows",
          "medium",
          "Maintenance windows share a location and time",
          [left.id, right.id],
          `${left.title} overlaps ${right.title}.`,
          { locationCode: leftLocation, left: [left.startAt, left.endAt], right: [right.startAt, right.endAt] },
        ));
      }
    }
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title));
}
