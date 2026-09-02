import { mkdir, writeFile, cp, access } from "node:fs/promises";
import path from "node:path";
import { STATUS_PAGE_URL, STATUS_RSS_URL, SOURCE_FILES } from "./constants.mjs";
import { validateSourceDocuments } from "./source-contract.mjs";
import { sha256 } from "./utils.mjs";

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
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

export async function captureSources({
  rootDir,
  rawDir = path.join(rootDir, "data", "raw"),
  archiveLabel = null,
  now = new Date(),
  fetchImpl = fetch,
}) {
  await mkdir(rawDir, { recursive: true });

  const sources = [
    { key: "statusPage", url: STATUS_PAGE_URL, filename: SOURCE_FILES.statusPage },
    { key: "rss", url: STATUS_RSS_URL, filename: SOURCE_FILES.rss },
  ];

  const fetched = await Promise.all(sources.map(async (source) => ({
    ...source,
    result: await fetchText(source.url, fetchImpl),
  })));
  validateSourceDocuments({
    html: fetched.find((source) => source.key === "statusPage").result.body,
    xml: fetched.find((source) => source.key === "rss").result.body,
  });

  const captured = [];
  for (const source of fetched) {
    const result = source.result;
    const filePath = path.join(rawDir, source.filename);
    await writeFile(filePath, result.body, "utf8");
    captured.push({
      key: source.key,
      url: source.url,
      httpStatus: result.status,
      retrievedAt: now.toISOString(),
      bytes: Buffer.byteLength(result.body),
      sha256: sha256(result.body),
      file: path.posix.join("data", "raw", source.filename),
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
