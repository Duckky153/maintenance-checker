import { readFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SOURCE_FILES } from "./constants.mjs";
import { parseRss, parseStatusPage, mergeEvents } from "./parse.mjs";
import { validateEvents } from "./validate.mjs";
import { createMaintenanceSummary, createReport } from "./report.mjs";
import {
  validateParsedEvents,
  validateSourceDocuments,
  validateSourceManifest,
} from "./source-contract.mjs";

export async function writeReportOutputs({ rootDir, report }) {
  const summary = createMaintenanceSummary(report);
  await mkdir(path.join(rootDir, "data", "generated"), { recursive: true });
  await mkdir(path.join(rootDir, "site"), { recursive: true });
  const writeAtomic = async (filePath, body) => {
    const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await writeFile(temporaryPath, body, "utf8");
      await rename(temporaryPath, filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  };
  await Promise.all([
    writeAtomic(path.join(rootDir, "data", "generated", "report.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeAtomic(path.join(rootDir, "data", "generated", "maintenance-summary.md"), summary),
    writeAtomic(path.join(rootDir, "site", "data.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeAtomic(path.join(rootDir, "site", "maintenance-summary.md"), summary),
  ]);
}

export async function buildReport({
  rootDir,
  rawDir = path.join(rootDir, "data", "raw"),
  now = new Date(),
  writeOutputs = true,
}) {
  const [html, xml, manifestText] = await Promise.all([
    readFile(path.join(rawDir, SOURCE_FILES.statusPage), "utf8"),
    readFile(path.join(rawDir, SOURCE_FILES.rss), "utf8"),
    readFile(path.join(rawDir, SOURCE_FILES.manifest), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  validateSourceDocuments({ html, xml });
  validateSourceManifest({ manifest, html, xml });
  const pageEvents = parseStatusPage(html);
  const rssEvents = parseRss(xml);
  validateParsedEvents({ pageEvents, rssEvents });
  const events = mergeEvents(pageEvents, rssEvents);
  const findings = validateEvents(events, now);
  const report = createReport({ events, findings, manifest, generatedAt: now.toISOString() });
  if (writeOutputs) await writeReportOutputs({ rootDir, report });
  return report;
}
