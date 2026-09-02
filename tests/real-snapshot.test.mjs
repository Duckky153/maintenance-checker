import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_FILES, STATUS_PAGE_URL, STATUS_RSS_URL } from "../src/constants.mjs";
import { mergeEvents, parseRss, parseStatusPage } from "../src/parse.mjs";
import { createMaintenanceSummary, createReport } from "../src/report.mjs";
import { sha256 } from "../src/utils.mjs";
import { validateEvents } from "../src/validate.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotDir = path.join(rootDir, "evidence", "source-snapshots", "2026-09-02");

async function loadSnapshot() {
  const [html, xml, manifestText] = await Promise.all([
    readFile(path.join(snapshotDir, SOURCE_FILES.statusPage), "utf8"),
    readFile(path.join(snapshotDir, SOURCE_FILES.rss), "utf8"),
    readFile(path.join(snapshotDir, SOURCE_FILES.manifest), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const pageEvents = parseStatusPage(html);
  const rssEvents = parseRss(xml);
  const events = mergeEvents(pageEvents, rssEvents);
  return { html, xml, manifest, pageEvents, rssEvents, events };
}

test("archived inputs are real, hashed CoreWeave public records", async () => {
  const { html, xml, manifest } = await loadSnapshot();
  assert.deepEqual(manifest.sources.map((source) => source.url), [STATUS_PAGE_URL, STATUS_RSS_URL]);
  assert.ok(manifest.sources.every((source) => source.httpStatus === 200));
  assert.equal(manifest.sources[0].sha256, sha256(html));
  assert.equal(manifest.sources[1].sha256, sha256(xml));
  assert.match(html, /CoreWeave Cloud/);
  assert.match(xml, /CoreWeave Cloud/);
  assert.match(xml, /status\.io\/pages\//);
});

test("parser retains current, upcoming, and RSS lifecycle records", async () => {
  const { pageEvents, rssEvents, events } = await loadSnapshot();
  assert.ok(pageEvents.length >= 10);
  assert.equal(pageEvents.filter((event) => event.phase === "upcoming").length, 5);
  assert.equal(rssEvents.length, 10);
  assert.ok(events.length >= 15);
  assert.ok(events.every((event) => {
    const host = new URL(event.sourceUrl).hostname;
    return host === "status.coreweave.com" || host === "status.io";
  }));
  assert.ok(events.every((event) => event.title.length > 0));
});

test("real extension update remains distinct from the structured schedule", async () => {
  const { events } = await loadSnapshot();
  const event = events.find((item) => item.id === "6a85c13dcfac4447738b2ede");
  assert.ok(event);
  assert.equal(event.scheduleText, "August 24, 2026 1:00PM - August 28, 2026 9:00PM UTC");
  assert.equal(event.endAt, "2026-08-28T21:00:00.000Z");
  assert.equal(event.extendedTo, "2026-09-04T23:59:59.000Z");
});

test("real abbreviated schedules become calendar-ready UTC windows", async () => {
  const { events } = await loadSnapshot();
  const event = events.find((item) => item.id === "6a976c8c471513477fa495c5");
  assert.ok(event);
  assert.equal(event.scheduleText, "September 3, 2026 11:00AM - 1:00PM UTC");
  assert.equal(event.startAt, "2026-09-03T11:00:00.000Z");
  assert.equal(event.endAt, "2026-09-03T13:00:00.000Z");
});

test("validator exposes the real cross-region location conflict", async () => {
  const { events } = await loadSnapshot();
  const findings = validateEvents(events, new Date("2026-09-02T18:00:00Z"));
  const conflict = findings.find((item) => item.rule === "location-conflict");
  assert.ok(conflict);
  assert.equal(conflict.eventIds[0], "6a973dcfdf35e104e60306a3");
  assert.deepEqual(conflict.evidence, { titleLocation: "US-WEST-04A", fieldLocation: "US-EAST-04" });
});

test("validator retains the real incident status reversal", async () => {
  const { events } = await loadSnapshot();
  const findings = validateEvents(events, new Date("2026-09-02T18:00:00Z"));
  const reopening = findings.find((item) => item.rule === "reopened-after-monitoring");
  assert.ok(reopening);
  assert.deepEqual(reopening.evidence.lifecycle, [
    "Investigating", "Identified", "Monitoring", "Investigating", "Monitoring", "Resolved",
  ]);
});

test("report and handoff summary preserve source-backed records", async () => {
  const { events, manifest } = await loadSnapshot();
  const findings = validateEvents(events, new Date("2026-09-02T18:00:00Z"));
  const report = createReport({
    events,
    findings,
    manifest,
    generatedAt: "2026-09-02T18:00:00.000Z",
  });
  const summary = createMaintenanceSummary(report);
  assert.equal(report.counts.notices, events.length);
  assert.ok(report.calendar.length >= 7);
  assert.ok(report.calendar.some((event) => event.usesExtension));
  assert.match(summary, /Active and upcoming maintenance/);
  assert.match(summary, /https:\/\/status\.coreweave\.com\/pages\/maintenance\//);
});

test("generated product records contain no invented source domains or synthetic labels", async () => {
  const { events } = await loadSnapshot();
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /example\.com|synthetic|sample company|fake user/i);
  assert.ok(events.every((event) => event.sourceKinds.every((source) => ["status-page", "rss"].includes(source))));
});
