const app = document.querySelector("#app");
const refreshButton = document.querySelector("#refresh-button");
const noticeDialog = document.querySelector("#notice-dialog");
const dialogContent = document.querySelector("#dialog-content");
let report;

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child) node.append(child);
  }
  return node;
}

function formatDate(value, includeTime = true) {
  if (!value) return "Not available";
  const options = { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" };
  if (includeTime) Object.assign(options, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return new Intl.DateTimeFormat("en-US", options).format(new Date(value));
}

function heading(title, description) {
  return el("div", { className: "view-heading" }, [
    el("div", {}, [el("h2", { text: title }), el("p", { text: description })]),
  ]);
}

function sourceLink(event, label = "Open source") {
  return el("a", {
    href: event.sourceUrl,
    target: "_blank",
    rel: "noreferrer",
    "aria-label": `${label} (opens in a new tab)`,
    text: label,
  });
}

function windowText(event) {
  return event.scheduleText || (event.kind === "maintenance" ? "No scheduled window" : "Not provided in RSS");
}

function reviewState(event) {
  const findings = report.findings.filter((finding) => finding.eventIds.includes(event.id));
  if (findings.some((finding) => finding.severity === "high")) return { label: "Held", findings };
  if (findings.length) return { label: "Needs review", findings };
  if (report.calendar.some((item) => item.id === event.id)) return { label: "Calendar-ready", findings };
  return { label: "Checked", findings };
}

function eventDetails(event) {
  const state = reviewState(event);
  return [
    ["Window", windowText(event)],
    ["Location", event.fieldLocation || event.titleLocation || "Not stated"],
    ["Component", event.component || "Not stated"],
    ["Source state", `${event.status} · ${event.phase}`],
    ["Review", state.label],
  ];
}

function noticesView() {
  const rank = { active: 0, upcoming: 1, current: 2, recent: 3, history: 4 };
  const events = [...report.events].sort((a, b) =>
    (rank[a.phase] ?? 9) - (rank[b.phase] ?? 9) || (b.startAt || b.postedAt || "").localeCompare(a.startAt || a.postedAt || ""),
  );
  const table = el("table", {}, [
    el("caption", { className: "visually-hidden", text: "Public maintenance and incident notices with review status" }),
    el("thead", {}, el("tr", {}, ["Notice", "Window", "Location", "Component", "State", "Review"].map((name) =>
      el("th", { scope: "col", text: name }),
    ))),
    el("tbody", {}, events.map((event) => {
      const state = reviewState(event);
      return el("tr", {}, [
        el("td", {}, [el("span", { className: "row-title", text: event.title }), el("span", { className: "row-meta", text: event.kind })]),
        el("td", {}, [el("span", { text: windowText(event) }), event.extendedThroughDate ? el("span", { className: "row-meta", text: `Extended through ${formatDate(event.extendedThroughDate, false)}; no end time stated` }) : null]),
        el("td", { text: event.fieldLocation || event.titleLocation || "Not stated" }),
        el("td", { text: event.component || "Not stated" }),
        el("td", {}, [el("span", { className: "status", text: event.status }), el("span", { className: "row-meta", text: event.phase })]),
        el("td", {}, [
          el("span", { className: `review-state ${state.label === "Held" ? "held" : ""}`, text: state.label }),
          el("div", { className: "row-actions" }, [
            el("button", { type: "button", "data-review-id": event.id, text: "Review" }),
            sourceLink(event, "Source"),
          ]),
        ]),
      ]);
    })),
  ]);
  const cards = el("div", { className: "notice-cards" }, events.map((event) => el("article", { className: "notice-card" }, [
    el("div", { className: "notice-card-title" }, [
      el("div", {}, [el("h3", { text: event.title }), el("p", { text: event.kind })]),
      el("span", { className: `review-state ${reviewState(event).label === "Held" ? "held" : ""}`, text: reviewState(event).label }),
    ]),
    el("dl", {}, eventDetails(event).slice(0, 4).map(([label, value]) => el("div", {}, [
      el("dt", { text: label }), el("dd", { text: value }),
    ]))),
    el("div", { className: "card-actions" }, [
      el("button", { type: "button", "data-review-id": event.id, text: "Review" }),
      sourceLink(event, "Source"),
    ]),
  ])));
  return [
    heading("Notices", "Every field links back to the public notice."),
    el("div", { className: "table-wrap", tabindex: "0", "aria-label": "Scrollable notice table" }, table),
    cards,
  ];
}

function evidenceValues(finding) {
  const evidence = finding.evidence || {};
  if (evidence.titleLocation || evidence.fieldLocation) return [["Title", evidence.titleLocation], ["Location field", evidence.fieldLocation]];
  if (evidence.localTime || evidence.utcTime) return [["Local time", evidence.localTime], ["UTC time", evidence.utcTime]];
  if (evidence.extendedThroughDate || evidence.scheduleEnd) return [["Latest update", `Extended through ${formatDate(evidence.extendedThroughDate, false)}; time not stated`], ["Schedule field", `Ends ${formatDate(evidence.scheduleEnd, false)}`]];
  if (evidence.left || evidence.right) return [["First window", `${formatDate(evidence.left[0])} – ${formatDate(evidence.left[1])}`], ["Second window", `${formatDate(evidence.right[0])} – ${formatDate(evidence.right[1])}`]];
  if (evidence.lifecycle) return [["Update sequence", evidence.lifecycle.join(" → ")], ["Review reason", "Monitoring was followed by Investigating"]];
  if (evidence.missing) return [["Present", "Notice and source text"], ["Missing for handoff", evidence.missing.join(", ")]];
  if (evidence.locationCode) return [["Location code", evidence.locationCode], ["Review reason", "The scheduled windows overlap"]];
  return [["Evidence", finding.detail], ["Rule", finding.rule]];
}

function evidencePair(values) {
  return el("dl", { className: "evidence-pair" }, values.map(([label, value]) =>
    el("div", {}, [el("dt", { text: label }), el("dd", { text: value || "Not stated" })]),
  ));
}

function problemsView() {
  const list = report.findings.length
    ? el("div", { className: "finding-list" }, report.findings.map((finding) => {
      const event = report.events.find((item) => item.id === finding.eventIds[0]);
      const severityLabel = finding.severity === "high" ? "Blocked from calendar" : "Review only";
      return el("article", { className: "finding" }, [
        el("span", { className: `severity ${finding.severity}`, text: severityLabel }),
        el("div", {}, [
          el("h3", { text: finding.title }),
          el("p", { text: event?.title || finding.eventIds.join(", ") }),
          event ? sourceLink(event, "Check original notice") : null,
        ]),
        el("div", {}, [evidencePair(evidenceValues(finding)), el("p", { text: finding.detail })]),
      ]);
    }))
    : el("p", { className: "empty", text: "No review items were found in this capture." });
  return [
    heading("Needs review", "Field and update-history checks that need a person to make the final call."),
    list,
  ];
}

function openNoticeReview(event) {
  const state = reviewState(event);
  const reasons = state.findings.map((finding) => finding.title).join("; ");
  const metadata = [
    ["Type", event.kind],
    ["Source state", `${event.status} · ${event.phase}`],
    ["Schedule", windowText(event)],
    ["Location", event.fieldLocation || event.titleLocation || "Not stated"],
    ["Component", event.component || "Not stated"],
    ["Review status", reasons ? `${state.label}: ${reasons}` : state.label],
    ["Captured from", event.sourceKinds.includes("status-page") && event.sourceKinds.includes("rss") ? "Status page + RSS feed" : event.sourceKinds[0] === "rss" ? "RSS feed" : "Status page"],
  ];
  const normalizedDescription = (event.description || "").replace(/\s+/g, " ").trim().toLowerCase();
  const distinctUpdates = event.updates.filter((update, index) =>
    !(index === 0 && (update.body || "").replace(/\s+/g, " ").trim().toLowerCase() === normalizedDescription),
  );
  const updates = distinctUpdates.length
    ? el("ol", { className: "timeline" }, distinctUpdates.map((update) => el("li", {}, [
      el("time", { text: update.atText || "Time not stated" }),
      el("div", {}, [el("strong", { text: update.status }), el("p", { text: update.body || "No update text" })]),
    ])))
    : el("p", { className: "muted", text: "No additional updates were present in the captured source." });
  dialogContent.replaceChildren(
    el("h3", { text: event.title }),
    el("dl", { className: "review-meta" }, metadata.map(([label, value]) => el("div", {}, [el("dt", { text: label }), el("dd", { text: value })]))),
    el("h3", { text: "Source description" }),
    el("p", { className: "description", text: event.description || "No description was present in this source view." }),
    el("h3", { text: "Update history" }),
    updates,
    sourceLink(event, "Open original notice"),
  );
  noticeDialog.showModal();
}

function calendarView() {
  const grouped = new Map();
  for (const event of report.calendar) {
    const day = formatDate(event.startAt, false);
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(event);
  }
  const days = [...grouped].map(([day, events]) => el("section", { className: "day" }, [
    el("h3", { text: day }),
    el("div", { className: "day-events" }, events.map((event) => el("article", { className: "calendar-entry" }, [
      sourceLink(event, event.title),
      el("p", { text: `${formatDate(event.startAt)} – ${formatDate(event.endAt)}` }),
      el("p", { text: `${event.location || "Location not stated"} · ${event.component || "Component not stated"}` }),
    ]))),
  ]));
  const held = report.heldFromCalendar.length ? el("section", { className: "calendar-hold" }, [
    el("h3", { text: `Held for review (${report.heldFromCalendar.length})` }),
    el("p", { text: "These records stay out of the calendar until a person resolves the blocking source issue." }),
    el("div", { className: "held-list" }, report.heldFromCalendar.map((event) => el("article", { className: "held-entry" }, [
      sourceLink(event, event.title), el("p", { text: event.reasons.join(" · ") }),
    ]))),
  ]) : null;
  return [
    heading("Calendar", "Only active and upcoming maintenance that passes every blocking check appears here."),
    el("div", { className: "calendar-actions" }, el("a", { className: "button-link", href: "/calendar.ics", download: "maintenance-calendar.ics", text: "Download calendar" })),
    days.length ? el("div", {}, days) : el("p", { className: "empty", text: "No maintenance record passed the calendar checks in this capture." }),
    held,
  ];
}

function summaryView() {
  const calendarItems = report.calendar.length ? el("ul", {}, report.calendar.map((item) => el("li", {}, [
    sourceLink(item, item.title), el("span", { text: ` — ${formatDate(item.startAt)} · ${item.location}` }),
  ]))) : el("p", { className: "muted", text: "No records are ready for the calendar." });
  const heldItems = report.heldFromCalendar.length ? el("ul", {}, report.heldFromCalendar.map((item) => el("li", {}, [
    sourceLink(item, item.title), el("span", { text: ` — ${item.reasons.join("; ")}` }),
  ]))) : el("p", { className: "muted", text: "No records are held." });
  return [
    heading("Summary", "Download the ready schedule and unresolved issues."),
    el("div", { className: "summary-actions top-actions" }, [
      el("a", { className: "button-link", href: "/maintenance-summary.md", download: "maintenance-summary.md", text: "Download summary" }),
      el("a", { className: "button-link secondary", href: "/calendar.ics", download: "maintenance-calendar.ics", text: "Download calendar" }),
    ]),
    el("article", { className: "summary-preview" }, [
      el("p", { className: "summary-generated", text: `Prepared ${formatDate(report.generatedAt)} from the public status page and RSS feed.` }),
      el("h3", { text: "Checked" }),
      el("p", { text: `${report.counts.notices} notices · ${report.counts.findings} review flags · ${report.counts.calendarReady} calendar-ready · ${report.counts.calendarHeld} held` }),
      el("h3", { text: "Calendar-ready maintenance" }),
      calendarItems,
      el("h3", { text: "Held from calendar" }),
      heldItems,
    ]),
  ];
}

function render() {
  const route = location.hash.slice(1) || "notices";
  const validRoute = ["notices", "problems", "calendar", "summary"].includes(route) ? route : "notices";
  document.querySelectorAll("[data-route]").forEach((link) => {
    if (link.dataset.route === validRoute) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const views = { notices: noticesView, problems: problemsView, calendar: calendarView, summary: summaryView };
  app.replaceChildren(...views[validRoute]());
  app.focus({ preventScroll: true });
}

async function load() {
  try {
    const response = await fetch(`/api/report?cache=${Date.now()}`);
    if (!response.ok) throw new Error("The checked report is unavailable. Run npm run fetch and npm run build.");
    report = await response.json();
    document.querySelector("#capture-time").textContent = `Captured ${formatDate(report.source.manifest.retrievedAt)}`;
    document.querySelector("#notice-count").textContent = report.counts.notices;
    document.querySelector("#finding-count").textContent = report.counts.findings;
    document.querySelector("#calendar-count").textContent = report.calendar.length;
    document.querySelector("#status-overview").textContent = `${report.counts.notices} checked · ${report.counts.findings} flags · ${report.counts.calendarReady} calendar-ready · ${report.counts.calendarHeld} held`;
    render();
  } catch (error) {
    app.replaceChildren(el("p", { className: "error", text: error.message }));
  }
}

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing…";
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (!response.ok) throw new Error("Refresh failed");
    await load();
  } catch {
    document.querySelector("#capture-time").textContent = "Refresh failed; showing the previous capture.";
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh from source";
  }
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-id]");
  if (!button || !report) return;
  const notice = report.events.find((item) => item.id === button.dataset.reviewId);
  if (notice) openNoticeReview(notice);
});

document.querySelector("#close-dialog").addEventListener("click", () => noticeDialog.close());
window.addEventListener("hashchange", () => report && render());
await load();
