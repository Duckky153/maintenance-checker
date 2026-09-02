import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureSources } from "../src/capture.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archiveArgument = process.argv.find((argument) => argument.startsWith("--archive-label="));
const archiveLabel = archiveArgument?.split("=").slice(1).join("=") || null;

const manifest = await captureSources({ rootDir, archiveLabel });
for (const source of manifest.sources) {
  console.log(`${source.httpStatus} ${source.url} ${source.bytes} bytes ${source.sha256.slice(0, 12)}`);
}
if (archiveLabel) console.log(`Archived real source snapshot: ${archiveLabel}`);
