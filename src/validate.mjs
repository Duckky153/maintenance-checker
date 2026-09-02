import { canonicalLocation, locationRegion } from "./utils.mjs";

function finding(rule, severity, title, eventIds, detail, evidence) {
  return { id: `${rule}:${eventIds.join(":")}`, rule, severity, title, eventIds, detail, evidence };
}

function compareLocations(event) {
  if (!event.titleLocation || !event.fieldLocation) return null;
  const title = canonicalLocation(event.titleLocation);
  const field = canonicalLocation(event.fieldLocation);
  if (title === field) return null;
  if (locationRegion(title) !== locationRegion(field)) {
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

function dateOnly(value) {
  return value ? value.slice(0, 10) : null;
}

export function validateEvents(events, now = new Date()) {
  const findings = [];

  for (const event of events) {
    const locationFinding = compareLocations(event);
    if (locationFinding) findings.push(locationFinding);

    if (event.kind === "maintenance") {
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
          "Required fields missing",
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

      if (event.phase === "active" && event.endAt && new Date(event.endAt) < now && !event.extendedThroughDate) {
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
      const site = (event) => canonicalLocation(event.fieldLocation || event.titleLocation || "").replace(/(\d)[A-Z]$/, "$1");
      const leftRegion = site(left);
      const rightRegion = site(right);
      const overlap = left.startAt < right.endAt && right.startAt < left.endAt;
      if (leftRegion && leftRegion === rightRegion && overlap) {
        findings.push(finding(
          "overlapping-windows",
          "medium",
          "Maintenance windows overlap at the same site",
          [left.id, right.id],
          `${left.title} overlaps ${right.title}.`,
          { region: leftRegion, left: [left.startAt, left.endAt], right: [right.startAt, right.endAt] },
        ));
      }
    }
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title));
}
