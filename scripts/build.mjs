import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "../src/pipeline.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = await buildReport({ rootDir });

console.log(
  `Built ${report.counts.notices} notices, ${report.counts.findings} review items, ${report.calendar.length} calendar entries.`,
);
