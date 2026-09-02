const app = document.querySelector("#app");
const refreshButton = document.querySelector("#refresh-button");
const noticeDialog = document.querySelector("#notice-dialog");
const dialogContent = document.querySelector("#dialog-content");
let report;
let summaryText = "";

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

function heading(title, description, count) {
  const copy = el("div", {}, [el("h2", { text: title }), el("p", { text: description })]);
  return el("div", { className: "view-heading" }, [
    copy,
    count === undefined ? null : el("span", { className: "count-line", text: `${count} shown` }),
  ]);
}

function sourceLink(event, label = "Open source") {
  return el("a", { href: event.sourceUrl, target: "_blank", rel: "noreferrer", text: label });
}

function noticesView() {
  const rank = { active: 0, upcoming: 1, current: 2, recent: 3, history: 4 };
  const events = [...report.events].sort((a, b) =>
    (rank[a.phase] ?? 9) - (rank[b.phase] ?? 9) || (b.startAt || b.postedAt || "").localeCompare(a.startAt || a.postedAt || ""),
  );
  const table = el("table", {}, [
    el("thead", {}, el("tr", {}, ["Notice", "Window", "Location", "Component", "State", "Review"].map((name) => el("th", { text: name })))),
    el("tbody", {}, events.map((event) => el("tr", {}, [
      el("td", {}, [el("span", { className: "row-title", text: event.title }), el("span", { className: "row-meta", text: event.kind })]),
      el("td", {}, [el("span", { text: event.scheduleText || "Not in current page view" }), event.extendedTo ? el("span", { className: "row-meta", text: `Update extends through ${formatDate(event.extendedTo, false)}` }) : null]),
      el("td", { text: event.fieldLocation || event.titleLocation || "Not stated" }),
      el("td", { text: event.component || "Not stated" }),
      el("td", {}, [el("span", { className: "status", text: event.status }), el("span", { className: "row-meta", text: event.phase })]),
      el("td", {}, el("div", { className: "row-actions" }, [
        el("button", { type: "button", "data-review-id": event.id, text: "Review" }),
        sourceLink(event, "Source"),
      ])),
    ]))),
  ]);
  return [
    heading("Notices", "The title, schedule, location, component, and update history are kept traceable to the public source.", events.length),
    el("div", { className: "table-wrap" }, table),
  ];
}

function evidenceValues(finding) {
  const evidence = finding.evidence || {};
  if (evidence.titleLocation || evidence.fieldLocation) {
    return [["Title", evidence.titleLocation], ["Location field", evidence.fieldLocation]];
  }
  if (evidence.extendedTo || evidence.scheduleEnd) {
    return [["Latest update", `Extended through ${formatDate(evidence.extendedTo, false)}`], ["Schedule field", `Ends ${formatDate(evidence.scheduleEnd, false)}`]];
  }
  if (evidence.left || evidence.right) {
    return [["First window", `${formatDate(evidence.left[0])} – ${formatDate(evidence.left[1])}`], ["Second window", `${formatDate(evidence.right[0])} – ${formatDate(evidence.right[1])}`]];
  }
  if (evidence.lifecycle) {
    return [["Update sequence", evidence.lifecycle.join(" → ")], ["Review reason", "Monitoring was followed by Investigating"]];
  }
  if (evidence.missing) {
    return [["Present", "RSS event and update text"], ["Not present", evidence.missing.join(", ")]];
  }
  if (evidence.region) {
    return [["Shared region", evidence.region], ["Review reason", "Active incident and maintenance"]];
  }
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
      return el("article", { className: "finding" }, [
        el("span", { className: `severity ${finding.severity}`, text: finding.severity }),
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
    heading("Problems found", "These checks compare source fields and update history. They identify items for a person to review; they do not diagnose an operational fault.", report.findings.length),
    list,
  ];
}

function openNoticeReview(event) {
  const metadata = [
    ["Type", event.kind],
    ["State", `${event.status} · ${event.phase}`],
    ["Schedule", event.scheduleText || "Not in current page view"],
    ["Location", event.fieldLocation || event.titleLocation || "Not stated"],
    ["Component", event.component || "Not stated"],
    ["Captured from", event.sourceKinds.join(" and ")],
  ];
  const updates = event.updates.length
    ? el("ol", { className: "timeline" }, event.updates.map((update) => el("li", {}, [
      el("time", { text: update.atText || "Time not stated" }),
      el("div", {}, [el("strong", { text: update.status }), el("p", { text: update.body || "No update text" })]),
    ])))
    : el("p", { className: "muted", text: "No lifecycle updates were present in the captured source." });
  dialogContent.replaceChildren(
    el("h3", { text: event.title }),
    el("dl", { className: "review-meta" }, metadata.map(([label, value]) =>
      el("div", {}, [el("dt", { text: label }), el("dd", { text: value })]),
    )),
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
      el("p", { text: event.usesExtension
        ? `${formatDate(event.startAt)} – ${formatDate(event.endAt, false)} (extended in update)`
        : `${formatDate(event.startAt)} – ${formatDate(event.endAt)}` }),
      el("p", { text: `${event.location || "Location not stated"} · ${event.component || "Component not stated"}` }),
    ]))),
  ]));
  return [
    heading("Calendar", "Active and upcoming maintenance with a parseable UTC schedule, ordered by start time.", report.calendar.length),
    days.length ? el("div", {}, days) : el("p", { className: "empty", text: "No active or upcoming maintenance with a parseable schedule is in this capture." }),
  ];
}

function summaryView() {
  const download = el("a", {
    className: "button-link",
    href: "/maintenance-summary.md",
    download: "maintenance-summary.md",
    text: "Download summary",
  });
  return [
    heading("Summary", "A downloadable maintenance handoff generated from the reviewed records."),
    el("div", { className: "summary-layout" }, [
      el("pre", { className: "summary-text", text: summaryText }),
      el("aside", { className: "summary-actions" }, [
        el("h3", { text: "Share the checked facts" }),
        el("p", { text: "The file includes source links, UTC windows, locations, components, and items that still need human review." }),
        download,
      ]),
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
    const [dataResponse, summaryResponse] = await Promise.all([
      fetch(`/data.json?cache=${Date.now()}`),
      fetch(`/maintenance-summary.md?cache=${Date.now()}`),
    ]);
    if (!dataResponse.ok || !summaryResponse.ok) throw new Error("The generated project data is unavailable. Run npm run fetch and npm run build.");
    report = await dataResponse.json();
    summaryText = await summaryResponse.text();
    document.querySelector("#capture-time").textContent = `Captured ${formatDate(report.source.manifest.retrievedAt)}`;
    document.querySelector("#notice-count").textContent = report.counts.notices;
    document.querySelector("#finding-count").textContent = report.counts.findings;
    document.querySelector("#calendar-count").textContent = report.calendar.length;
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
    document.querySelector("#capture-time").textContent = "Refresh failed; the last verified capture is still shown.";
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
