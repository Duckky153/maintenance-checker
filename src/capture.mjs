import { mkdir, writeFile, cp, access } from "node:fs/promises";
import path from "node:path";
import { STATUS_PAGE_URL, STATUS_RSS_URL, SOURCE_FILES } from "./constants.mjs";
import { sha256 } from "./utils.mjs";

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "MaintenanceNoticeChecker/1.0 public-data research",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Source fetch failed: ${response.status} ${url}`);
  }
  return { body: await response.text(), status: response.status };
}

export async function captureSources({ rootDir, archiveLabel = null, now = new Date() }) {
  const rawDir = path.join(rootDir, "data", "raw");
  await mkdir(rawDir, { recursive: true });

  const sources = [
    { key: "statusPage", url: STATUS_PAGE_URL, filename: SOURCE_FILES.statusPage },
    { key: "rss", url: STATUS_RSS_URL, filename: SOURCE_FILES.rss },
  ];

  const captured = [];
  for (const source of sources) {
    const result = await fetchText(source.url);
    const filePath = path.join(rawDir, source.filename);
    await writeFile(filePath, result.body, "utf8");
    captured.push({
      key: source.key,
      url: source.url,
      httpStatus: result.status,
      retrievedAt: now.toISOString(),
      bytes: Buffer.byteLength(result.body),
      sha256: sha256(result.body),
      file: path.relative(rootDir, filePath),
    });
  }

  const manifest = {
    schemaVersion: 1,
    retrievedAt: now.toISOString(),
    sources: captured,
  };
  await writeFile(
    path.join(rawDir, SOURCE_FILES.manifest),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  if (archiveLabel) {
    const archiveDir = path.join(rootDir, "evidence", "source-snapshots", archiveLabel);
    try {
      await access(archiveDir);
    } catch {
      await mkdir(path.dirname(archiveDir), { recursive: true });
      await cp(rawDir, archiveDir, { recursive: true, errorOnExist: true });
    }
  }

  return manifest;
}
