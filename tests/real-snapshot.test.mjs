import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_FILES, STATUS_PAGE_URL, STATUS_RSS_URL } from "../src/constants.mjs";
import { captureSources } from "../src/capture.mjs";
import { mergeEvents, parseRss, parseStatusPage } from "../src/parse.mjs";
import { createMaintenanceSummary, createReport } from "../src/report.mjs";
import { refreshProject } from "../src/refresh.mjs";
import {
  validateParsedEvents,
  validateSourceDocuments,
  validateSourceManifest,
} from "../src/source-contract.mjs";
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

test("source contract accepts the archived documents and matching manifest", async () => {
  const { html, xml, manifest } = await loadSnapshot();
  assert.doesNotThrow(() => validateSourceDocuments({ html, xml }));
  assert.doesNotThrow(() => validateSourceManifest({ manifest, html, xml }));
});

test("source contract rejects a branded error page and a tampered capture", async () => {
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
  assert.equal(report.calendar.length, 6);
  assert.equal(report.heldFromCalendar.length, 2);
  assert.ok(report.heldFromCalendar.some((event) => event.id === "6a973dcfdf35e104e60306a3"));
  assert.ok(report.heldFromCalendar.some((event) => event.id === "6a85c13dcfac4447738b2ede"));
  assert.ok(report.calendar.every((event) => !report.heldFromCalendar.some((held) => held.id === event.id)));
  assert.match(summary, /Active and upcoming maintenance/);
  assert.match(summary, /Held from calendar/);
  assert.match(summary, /https:\/\/status\.coreweave\.com\/pages\/maintenance\//);
});

test("generated product records contain no invented source domains or synthetic labels", async () => {
  const { events } = await loadSnapshot();
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /example\.com|synthetic|sample company|fake user/i);
  assert.ok(events.every((event) => event.sourceKinds.every((source) => ["status-page", "rss"].includes(source))));
});
