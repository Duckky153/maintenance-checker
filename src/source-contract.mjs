import { SOURCE_FILES, STATUS_PAGE_URL, STATUS_RSS_URL } from "./constants.mjs";
import { sha256 } from "./utils.mjs";

function requireSource(condition, message) {
  if (!condition) throw new Error(`Source contract failed: ${message}`);
}

export function validateSourceDocuments({ html, xml }) {
  requireSource(typeof html === "string" && html.length > 100, "status page is empty or truncated");
  requireSource(/(?:<!doctype\s+html|<html[\s>])/i.test(html), "status page is not HTML");
  requireSource(/CoreWeave Cloud/i.test(html), "status page brand marker is missing");
  requireSource(/(?:maintenance|incident|statusio_)/i.test(html), "status page event markers are missing");

  requireSource(typeof xml === "string" && xml.length > 100, "RSS feed is empty or truncated");
  requireSource(/<rss[\s>]/i.test(xml) && /<channel[\s>]/i.test(xml), "RSS feed structure is missing");
  requireSource(/CoreWeave Cloud/i.test(xml), "RSS feed brand marker is missing");
}

export function validateSourceManifest({ manifest, html, xml }) {
  requireSource(manifest?.schemaVersion === 1, "manifest schema version is unsupported");
  requireSource(!Number.isNaN(Date.parse(manifest?.retrievedAt)), "manifest retrieval time is invalid");
  requireSource(Array.isArray(manifest?.sources) && manifest.sources.length === 2, "manifest must contain two sources");

  const expected = {
    statusPage: { url: STATUS_PAGE_URL, filename: SOURCE_FILES.statusPage, body: html },
    rss: { url: STATUS_RSS_URL, filename: SOURCE_FILES.rss, body: xml },
  };

  for (const [key, contract] of Object.entries(expected)) {
    const source = manifest.sources.find((item) => item.key === key);
    requireSource(source, `manifest source ${key} is missing`);
    requireSource(source.url === contract.url, `manifest URL for ${key} is unexpected`);
    requireSource(source.httpStatus === 200, `manifest HTTP status for ${key} is not 200`);
    requireSource(
      source.file?.replace(/\\/g, "/") === `data/raw/${contract.filename}`,
      `manifest file path for ${key} is unexpected`,
    );
    requireSource(source.bytes === Buffer.byteLength(contract.body), `manifest byte count for ${key} does not match`);
    requireSource(source.sha256 === sha256(contract.body), `manifest hash for ${key} does not match`);
  }
}

function eventSignature(event) {
  return JSON.stringify({
    title: event.title,
    sourceUrl: event.sourceUrl,
    description: event.description,
    scheduleText: event.scheduleText,
    startAt: event.startAt,
    endAt: event.endAt,
  });
}

export function validateParsedEvents({ pageEvents, rssEvents }) {
  const allEvents = [...pageEvents, ...rssEvents];
  requireSource(allEvents.length > 0, "no recognizable notices were parsed from either source");

  for (const event of allEvents) {
    requireSource(Boolean(event.id), "a parsed notice has no identifier");
    requireSource(Boolean(event.title), `notice ${event.id || "unknown"} has no title`);
    let parsedUrl;
    try {
      parsedUrl = new URL(event.sourceUrl);
    } catch {
      throw new Error(`Source contract failed: notice ${event.id} has an invalid source URL`);
    }
    requireSource(
      ["status.coreweave.com", "status.io"].includes(parsedUrl.hostname),
      `notice ${event.id} points to an unexpected source host`,
    );
  }

  for (const [sourceName, events] of [["status page", pageEvents], ["RSS feed", rssEvents]]) {
    const seen = new Map();
    for (const event of events) {
      const signature = eventSignature(event);
      if (seen.has(event.id) && seen.get(event.id) !== signature) {
        throw new Error(`Source contract failed: ${sourceName} contains conflicting records for ${event.id}`);
      }
      seen.set(event.id, signature);
    }
  }
}
