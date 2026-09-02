import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SOURCE_FILES } from "./constants.mjs";
import { parseRss, parseStatusPage, mergeEvents } from "./parse.mjs";
import { validateEvents } from "./validate.mjs";
import { createMaintenanceSummary, createReport } from "./report.mjs";

export async function buildReport({ rootDir, rawDir = path.join(rootDir, "data", "raw"), now = new Date() }) {
  const [html, xml, manifestText] = await Promise.all([
    readFile(path.join(rawDir, SOURCE_FILES.statusPage), "utf8"),
    readFile(path.join(rawDir, SOURCE_FILES.rss), "utf8"),
    readFile(path.join(rawDir, SOURCE_FILES.manifest), "utf8"),
  ]);
  const pageEvents = parseStatusPage(html);
  const rssEvents = parseRss(xml);
  const events = mergeEvents(pageEvents, rssEvents);
  const findings = validateEvents(events, now);
  const report = createReport({ events, findings, manifest: JSON.parse(manifestText), generatedAt: now.toISOString() });
  const summary = createMaintenanceSummary(report);

  await mkdir(path.join(rootDir, "data", "generated"), { recursive: true });
  await Promise.all([
    writeFile(path.join(rootDir, "data", "generated", "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(rootDir, "data", "generated", "maintenance-summary.md"), summary, "utf8"),
    writeFile(path.join(rootDir, "site", "data.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(rootDir, "site", "maintenance-summary.md"), summary, "utf8"),
  ]);
  return report;
}
