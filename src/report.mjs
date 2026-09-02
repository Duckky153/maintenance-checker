function displayDate(value) {
  if (!value) return "Time not available";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function createReport({ events, findings, manifest, generatedAt }) {
  const maintenance = events.filter((event) => event.kind === "maintenance");
  const incidents = events.filter((event) => event.kind === "incident");
  const upcoming = maintenance.filter((event) => ["active", "upcoming"].includes(event.phase));
  const highFindings = findings.filter((item) => item.severity === "high");
  const calendarReview = upcoming.map((event) => {
    const reasons = highFindings
      .filter((item) => item.eventIds.includes(event.id))
      .map((item) => item.title);
    if (!event.startAt || !event.endAt) reasons.push("Schedule could not be parsed into a complete window");
    if (event.startAt && event.endAt && event.endAt <= event.startAt) reasons.push("Schedule end is not after its start");
    if (!event.fieldLocation && !event.titleLocation) reasons.push("Location is not available");
    return { event, reasons: [...new Set(reasons)] };
  });
  const calendar = calendarReview
    .filter((item) => item.reasons.length === 0)
    .map(({ event }) => ({
      id: event.id,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      location: event.fieldLocation || event.titleLocation,
      component: event.component,
      status: event.status,
      phase: event.phase,
      sourceUrl: event.sourceUrl,
    }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const heldFromCalendar = calendarReview
    .filter((item) => item.reasons.length > 0)
    .map(({ event, reasons }) => ({
      id: event.id,
      title: event.title,
      startAt: event.startAt,
      sourceUrl: event.sourceUrl,
      reasons,
    }));
  return {
    schemaVersion: 2,
    generatedAt,
    source: {
      name: "CoreWeave public status page and RSS feed",
      manifest,
    },
    counts: {
      notices: events.length,
      maintenance: maintenance.length,
      incidents: incidents.length,
      active: events.filter((event) => event.phase === "active").length,
      upcoming: events.filter((event) => event.phase === "upcoming").length,
      findings: findings.length,
      highFindings: highFindings.length,
      calendarReady: calendar.length,
      calendarHeld: heldFromCalendar.length,
    },
    events: events.sort((a, b) => (a.startAt || a.postedAt || "").localeCompare(b.startAt || b.postedAt || "")),
    findings,
    calendar,
    heldFromCalendar,
  };
}

export function createMaintenanceSummary(report) {
  const lines = [
    "# Maintenance summary",
    "",
    `Generated from CoreWeave's public status records at ${displayDate(report.generatedAt)}.`,
    "",
    `Notices reviewed: ${report.counts.notices}`,
    `Items requiring review: ${report.counts.findings}`,
    "",
    "## Active and upcoming maintenance",
    "",
  ];

  if (!report.calendar.length) {
    lines.push("No active or upcoming maintenance passed the calendar readiness checks.", "");
  } else {
    for (const item of report.calendar) {
      lines.push(
        `### ${item.title}`,
        "",
        `- Window: ${displayDate(item.startAt)} to ${displayDate(item.endAt)}`,
        `- Location: ${item.location || "Not stated"}`,
        `- Component: ${item.component || "Not stated"}`,
        `- Status: ${item.status}`,
        `- Page section: ${item.phase}`,
        `- Source: ${item.sourceUrl}`,
        "",
      );
    }
  }

  lines.push("## Held from calendar", "");
  if (!report.heldFromCalendar.length) {
    lines.push("No active or upcoming maintenance was held for review.", "");
  } else {
    for (const item of report.heldFromCalendar) {
      lines.push(
        `- ${item.title}: ${item.reasons.join("; ")} (${item.sourceUrl})`,
      );
    }
    lines.push("");
  }

  lines.push("## Items requiring review", "");
  const selected = report.findings.filter((item) => item.severity !== "low");
  if (!selected.length) {
    lines.push("No validation findings were recorded.", "");
  } else {
    for (const item of selected) {
      lines.push(`- ${item.title}: ${item.detail}`);
    }
    lines.push("");
  }

  lines.push("Prepared from public CoreWeave status records.", "");
  return lines.join("\n");
}

function icsText(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line) {
  const chunks = [];
  let rest = line;
  while (rest.length > 73) {
    chunks.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

export function createCalendarIcs(report) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Maintenance Notice Checker//Public Status Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:CoreWeave public maintenance review",
  ];
  for (const item of report.calendar) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsText(item.id)}@maintenance-notice-checker.local`,
      `DTSTAMP:${icsDate(report.generatedAt)}`,
      `DTSTART:${icsDate(item.startAt)}`,
      `DTEND:${icsDate(item.endAt)}`,
      `SUMMARY:${icsText(item.title)}`,
      `LOCATION:${icsText(item.location || "Not stated")}`,
      `DESCRIPTION:${icsText(`${item.status} (${item.phase}). Source: ${item.sourceUrl}`)}`,
      `URL:${icsText(item.sourceUrl)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
