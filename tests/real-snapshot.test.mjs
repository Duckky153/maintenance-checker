import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_FILES, STATUS_PAGE_URL, STATUS_RSS_URL } from "../src/constants.mjs";
import { captureSources } from "../src/capture.mjs";
import { mergeEvents, parseRss, parseStatusPage } from "../src/parse.mjs";
import { createCalendarIcs, createMaintenanceSummary, createReport } from "../src/report.mjs";
import { promoteArtifacts, refreshProject } from "../src/refresh.mjs";
import {
  validateParsedEvents,
  validateSourceDocuments,
  validateSourceManifest,
} from "../src/source-contract.mjs";
import { baseLocationCode, extractExtendedDate, parseUtcSchedule, sha256 } from "../src/utils.mjs";
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

test("source contract accepts the archived documents and matching manifest", async () => {
  const { html, xml, manifest } = await loadSnapshot();
  assert.doesNotThrow(() => validateSourceDocuments({ html, xml }));
  assert.doesNotThrow(() => validateSourceManifest({ manifest, html, xml }));
});

test("source contract rejects a truncated page and a tampered capture", async () => {
  const { html, xml, manifest } = await loadSnapshot();
  assert.throws(
    () => validateSourceDocuments({ html: html.slice(0, 120), xml }),
    /Source contract failed/,
  );
  const tamperedManifest = structuredClone(manifest);
  tamperedManifest.sources[0].sha256 = "0".repeat(64);
  assert.throws(
    () => validateSourceManifest({ manifest: tamperedManifest, html, xml }),
    /manifest hash/,
  );
});

test("source contract rejects an unrecognized zero-record parse", () => {
  assert.throws(
    () => validateParsedEvents({ pageEvents: [], rssEvents: [] }),
    /no recognizable notices/,
  );
});

test("source contract requires a successful parse from each source", async () => {
  const { pageEvents, rssEvents } = await loadSnapshot();
  assert.throws(() => validateParsedEvents({ pageEvents: [], rssEvents }), /status page/);
  assert.throws(() => validateParsedEvents({ pageEvents, rssEvents: [] }), /RSS feed/);
});

test("failed two-source capture leaves the last verified raw files unchanged", async () => {
  const { html, xml } = await loadSnapshot();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "maintenance-capture-test-"));
  const rawDir = path.join(tempRoot, "data", "raw");
  await cp(snapshotDir, rawDir, { recursive: true });
  const before = await Promise.all([
    readFile(path.join(rawDir, SOURCE_FILES.statusPage), "utf8"),
    readFile(path.join(rawDir, SOURCE_FILES.rss), "utf8"),
  ]);
  const fetchImpl = async (url) => {
    if (url === STATUS_PAGE_URL) return new Response(html, { status: 200 });
    return new Response("temporarily unavailable", { status: 503 });
  };
  try {
    await assert.rejects(
      captureSources({ rootDir: tempRoot, rawDir, fetchImpl }),
      /Source fetch failed: 503/,
    );
    const after = await Promise.all([
      readFile(path.join(rawDir, SOURCE_FILES.statusPage), "utf8"),
      readFile(path.join(rawDir, SOURCE_FILES.rss), "utf8"),
    ]);
    assert.deepEqual(after, before);
    assert.equal(after[1], xml);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("staged refresh rejects zero parsed records without promoting them", async () => {
  const { html, xml } = await loadSnapshot();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "maintenance-refresh-test-"));
  const rawDir = path.join(tempRoot, "data", "raw");
  await cp(snapshotDir, rawDir, { recursive: true });
  const before = await Promise.all([
    readFile(path.join(rawDir, SOURCE_FILES.statusPage), "utf8"),
    readFile(path.join(rawDir, SOURCE_FILES.rss), "utf8"),
  ]);
  const unparseableHtml = html.replace(/href="\/pages\/(?:maintenance|incident)[^"]+"/g, 'href="/unrecognized"');
  const emptyFeed = xml.replace(/<item>[\s\S]*?<\/item>/gi, "");
  const fetchImpl = async (url) => new Response(url === STATUS_PAGE_URL ? unparseableHtml : emptyFeed, { status: 200 });
  try {
    await assert.rejects(
      refreshProject({ rootDir: tempRoot, fetchImpl }),
      /no recognizable notices/,
    );
    const after = await Promise.all([
      readFile(path.join(rawDir, SOURCE_FILES.statusPage), "utf8"),
      readFile(path.join(rawDir, SOURCE_FILES.rss), "utf8"),
    ]);
    assert.deepEqual(after, before);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
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
  assert.equal(event.extendedThroughDate, "2026-09-04");
});

test("real abbreviated schedules become calendar-ready UTC windows", async () => {
  const { events } = await loadSnapshot();
  const event = events.find((item) => item.id === "6a976c8c471513477fa495c5");
  assert.ok(event);
  assert.equal(event.scheduleText, "September 3, 2026 11:00AM - 1:00PM UTC");
  assert.equal(event.startAt, "2026-09-03T11:00:00.000Z");
  assert.equal(event.endAt, "2026-09-03T13:00:00.000Z");
});

test("date parsing rejects impossible dates and keeps the latest stated extension", () => {
  assert.deepEqual(
    parseUtcSchedule("February 31, 2026 11:00AM - 1:00PM UTC"),
    { startAt: null, endAt: null },
  );
  assert.equal(
    extractExtendedDate("Extended until September 3, 2026, then extended through September 5th, 2026"),
    "2026-09-05",
  );
});

test("location normalization preserves distinct base location codes", () => {
  assert.equal(baseLocationCode("US-EAST-04A"), "US-EAST-04");
  assert.equal(baseLocationCode("US-EAST-08A"), "US-EAST-08");
  assert.notEqual(baseLocationCode("US-EAST-04A"), baseLocationCode("US-EAST-08A"));
});

test("validator rejects different numbered locations within one broad region", async () => {
  const { events } = await loadSnapshot();
  const sourceEvent = events.find((event) => event.id === "6a973dcfdf35e104e60306a3");
  const rejectionInput = { ...sourceEvent, titleLocation: "US-EAST-08A", fieldLocation: "US-EAST-04" };
  const findings = validateEvents([rejectionInput], new Date("2026-09-02T18:00:00Z"));
  assert.ok(findings.some((finding) => finding.rule === "location-conflict"));
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

test("validator exposes the real local and UTC time conflict", async () => {
  const { events } = await loadSnapshot();
  const findings = validateEvents(events, new Date("2026-09-02T18:00:00Z"));
  const conflict = findings.find((item) => item.rule === "local-utc-time-conflict");
  assert.ok(conflict);
  assert.equal(conflict.eventIds[0], "6a91de56495e3647627df156");
  assert.deepEqual(conflict.evidence, {
    localTime: "11:00 PM ET",
    utcTime: "3:00 PM UTC",
    validOffsetsHours: [4, 5],
  });
});

test("merged records use the latest RSS lifecycle state", async () => {
  const { events } = await loadSnapshot();
  const active = events.find((event) => event.id === "6a85c13dcfac4447738b2ede");
  assert.equal(active.status, "Active");
});

test("an expired date-only extension does not hide an active notice past its end", async () => {
  const { events } = await loadSnapshot();
  const extended = events.find((event) => event.id === "6a85c13dcfac4447738b2ede");
  const findings = validateEvents([extended], new Date("2026-09-05T12:00:00Z"));
  assert.ok(findings.some((finding) => finding.rule === "active-after-end"));
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
  const calendarFile = createCalendarIcs(report);
  assert.equal(report.calendar.length, 5);
  assert.equal(report.heldFromCalendar.length, 3);
  assert.ok(report.heldFromCalendar.some((event) => event.id === "6a973dcfdf35e104e60306a3"));
  assert.ok(report.heldFromCalendar.some((event) => event.id === "6a85c13dcfac4447738b2ede"));
  assert.ok(report.heldFromCalendar.some((event) => event.id === "6a91de56495e3647627df156"));
  assert.ok(report.calendar.every((event) => !report.heldFromCalendar.some((held) => held.id === event.id)));
  assert.match(summary, /Active and upcoming maintenance/);
  assert.match(summary, /Held from calendar/);
  assert.match(summary, /https:\/\/status\.coreweave\.com\/pages\/maintenance\//);
  assert.equal((calendarFile.match(/BEGIN:VEVENT/g) || []).length, report.calendar.length);
  assert.doesNotMatch(calendarFile, /6a91de56495e3647627df156/);
});

test("artifact promotion rolls every target back when a later target is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maintenance-promotion-root-"));
  const stage = await mkdtemp(path.join(os.tmpdir(), "maintenance-promotion-stage-"));
  try {
    await writeFile(path.join(root, "first.txt"), "old", "utf8");
    await writeFile(path.join(stage, "first.txt"), "new", "utf8");
    await assert.rejects(
      promoteArtifacts({ rootDir: root, stageDir: stage, relativePaths: ["first.txt", "missing.txt"] }),
      /ENOENT/,
    );
    assert.equal(await readFile(path.join(root, "first.txt"), "utf8"), "old");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(stage, { recursive: true, force: true });
  }
});

test("successful refresh archives the validated source capture", async () => {
  const { html, xml } = await loadSnapshot();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "maintenance-archive-test-"));
  const now = new Date("2026-09-02T18:00:00.000Z");
  const fetchImpl = async (url) => new Response(url === STATUS_PAGE_URL ? html : xml, { status: 200 });
  try {
    await mkdir(tempRoot, { recursive: true });
    await refreshProject({ rootDir: tempRoot, fetchImpl, now });
    const archives = await readdir(path.join(tempRoot, "evidence", "source-snapshots"));
    assert.deepEqual(archives, ["2026-09-02T18-00-00-000Z"]);
    const archivedManifest = await readFile(path.join(tempRoot, "evidence", "source-snapshots", archives[0], SOURCE_FILES.manifest), "utf8");
    assert.match(archivedManifest, /2026-09-02T18:00:00.000Z/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("generated product records contain no invented source domains or synthetic labels", async () => {
  const { events } = await loadSnapshot();
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /example\.com|synthetic|sample company|fake user/i);
  assert.ok(events.every((event) => event.sourceKinds.every((source) => ["status-page", "rss"].includes(source))));
});
