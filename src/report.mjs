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
  return {
    schemaVersion: 1,
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
    },
    events: events.sort((a, b) => (a.startAt || a.postedAt || "").localeCompare(b.startAt || b.postedAt || "")),
    findings,
    calendar: upcoming
      .filter((event) => event.startAt)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map((event) => ({
        id: event.id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.extendedTo && event.extendedTo > event.endAt ? event.extendedTo : event.endAt,
        scheduledEndAt: event.endAt,
        usesExtension: Boolean(event.extendedTo && event.extendedTo > event.endAt),
        location: event.titleLocation || event.fieldLocation,
        component: event.component,
        status: event.status,
        sourceUrl: event.sourceUrl,
      })),
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
    lines.push("No active or upcoming maintenance with a parseable schedule was found.", "");
  } else {
    for (const item of report.calendar) {
      lines.push(
        `### ${item.title}`,
        "",
        `- Window: ${displayDate(item.startAt)} to ${displayDate(item.endAt)}`,
        `- Location: ${item.location || "Not stated"}`,
        `- Component: ${item.component || "Not stated"}`,
        `- Status: ${item.status}`,
        `- Source: ${item.sourceUrl}`,
        "",
      );
    }
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

  lines.push(
    "This summary uses public status notices. It does not contain private telemetry or internal operating instructions.",
    "",
  );
  return lines.join("\n");
}
