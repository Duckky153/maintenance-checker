import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { STATUS_PAGE_URL, STATUS_RSS_URL } from "../src/constants.mjs";
import { buildReport } from "../src/pipeline.mjs";
import { validateSourceDocuments } from "../src/source-contract.mjs";
import { sha256 } from "../src/utils.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(rootDir, "evidence");
const browserDir = path.join(evidenceDir, "browser");
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    probe.close(() => resolve(address.port));
  });
});
const baseUrl = `http://127.0.0.1:${port}`;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function liveSourceChecks() {
  const results = await Promise.all([STATUS_PAGE_URL, STATUS_RSS_URL].map(async (url) => {
    const response = await fetch(url, {
      headers: { "user-agent": "MaintenanceNoticeChecker/1.0 verification" },
      signal: AbortSignal.timeout(15000),
    });
    requireCondition(response.ok, `Live source returned ${response.status}: ${url}`);
    const body = await response.text();
    return {
      url,
      httpStatus: response.status,
      checkedAt: new Date().toISOString(),
      bytes: Buffer.byteLength(body),
      sha256: sha256(body),
      body,
    };
  }));
  validateSourceDocuments({ html: results[0].body, xml: results[1].body });
  for (const result of results) delete result.body;
  return results;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        const health = await response.json();
        if (health.status === "ok" && health.schemaVersion === 2) return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Local verification server did not become ready.");
}

async function browserChecks(report) {
  const server = spawn(process.execPath, [path.join(rootDir, "scripts", "serve.mjs")], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForServer();
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await page.goto(`${baseUrl}/#notices`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Notices" }).waitFor();
      requireCondition(await page.locator("tbody tr").count() === report.counts.notices, "Notice row count does not match report.");
      requireCondition((await page.getByText("CoreWeave status source").getAttribute("href")) === STATUS_PAGE_URL, "Status source link is wrong.");
      await page.getByRole("button", { name: "Review" }).first().click();
      await page.getByRole("dialog").waitFor();
      requireCondition(await page.getByRole("heading", { name: "Update history" }).isVisible(), "Notice review is missing update history.");
      requireCondition(await page.getByRole("link", { name: "Open original notice" }).isVisible(), "Notice review is missing its source link.");
      await page.screenshot({ path: path.join(browserDir, "desktop-notice-review.png"), fullPage: true });
      await page.getByRole("button", { name: "Close" }).click();
      await page.screenshot({ path: path.join(browserDir, "desktop-notices.png"), fullPage: true });

      requireCondition((await page.locator("#status-overview").textContent()).includes("calendar-ready"), "Overview does not explain the workflow state.");
      await page.getByRole("link", { name: /Needs review/ }).click();
      await page.getByRole("heading", { name: "Needs review" }).waitFor();
      requireCondition(await page.locator("article.finding").count() === report.counts.findings, "Finding row count does not match report.");
      requireCondition(await page.locator(".evidence-pair").count() === report.counts.findings, "A finding is missing side-by-side evidence.");
      await page.screenshot({ path: path.join(browserDir, "desktop-problems.png"), fullPage: true });

      await page.getByRole("link", { name: /Calendar/ }).click();
      await page.getByRole("heading", { name: "Calendar" }).waitFor();
      requireCondition(await page.locator(".calendar-entry").count() === report.calendar.length, "Calendar count does not match report.");
      requireCondition(await page.locator(".held-entry").count() === report.heldFromCalendar.length, "Held-for-review count does not match report.");
      await page.screenshot({ path: path.join(browserDir, "desktop-calendar.png"), fullPage: true });

      await page.getByRole("link", { name: "Summary" }).click();
      await page.getByRole("heading", { name: "Summary" }).waitFor();
      requireCondition(await page.locator(".summary-preview").textContent().then((text) => text.includes("Calendar-ready maintenance")), "Summary preview did not load.");
      requireCondition((await page.getByRole("link", { name: "Download summary" }).getAttribute("download")) === "maintenance-summary.md", "Summary download is not configured.");
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "Download summary" }).click();
      const download = await downloadPromise;
      requireCondition(download.suggestedFilename() === "maintenance-summary.md", "Summary download filename is wrong.");
      const downloadedSummary = await readFile(await download.path(), "utf8");
      requireCondition(downloadedSummary === await readFile(path.join(rootDir, "site", "maintenance-summary.md"), "utf8"), "Downloaded summary does not match the generated summary.");
      const calendarDownloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "Download calendar" }).click();
      const calendarDownload = await calendarDownloadPromise;
      requireCondition(calendarDownload.suggestedFilename() === "maintenance-calendar.ics", "Calendar download filename is wrong.");
      const downloadedCalendar = await readFile(await calendarDownload.path(), "utf8");
      requireCondition(downloadedCalendar === await readFile(path.join(rootDir, "site", "calendar.ics"), "utf8"), "Downloaded calendar does not match the generated calendar.");
      requireCondition((downloadedCalendar.match(/BEGIN:VEVENT/g) || []).length === report.calendar.length, "Calendar export count does not match the report.");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/#notices`, { waitUntil: "networkidle" });
      requireCondition(await page.locator(".notice-card").count() === report.counts.notices, "Mobile notice cards do not match the report.");
      requireCondition(await page.getByRole("link", { name: "Summary" }).isVisible(), "Summary navigation is hidden on mobile.");
      await page.screenshot({ path: path.join(browserDir, "mobile-notices.png"), fullPage: true });
      await page.goto(`${baseUrl}/#problems`, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      requireCondition(overflow <= 1, `Mobile page overflows horizontally by ${overflow}px.`);
      await page.screenshot({ path: path.join(browserDir, "mobile-problems.png"), fullPage: true });
      await page.goto(`${baseUrl}/#summary`, { waitUntil: "networkidle" });
      const summaryOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      requireCondition(summaryOverflow <= 1, `Mobile summary overflows horizontally by ${summaryOverflow}px.`);
      await page.screenshot({ path: path.join(browserDir, "mobile-summary.png"), fullPage: true });

      const refreshResponsePromise = page.waitForResponse((response) =>
        response.url().endsWith("/api/refresh") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Refresh from source" }).click();
      const refreshResponse = await refreshResponsePromise;
      requireCondition(refreshResponse.ok(), `Browser refresh returned ${refreshResponse.status()}.`);
      await page.waitForFunction(() => {
        const button = document.querySelector("#refresh-button");
        return button && !button.disabled && button.textContent === "Refresh from source";
      });
      const refreshedReport = await fetch(`${baseUrl}/api/report`).then((response) => response.json());
      requireCondition(
        Number(await page.locator("#notice-count").textContent()) === refreshedReport.counts.notices,
        "Displayed notice count does not match the refreshed report.",
      );
      requireCondition(
        (await page.locator("#capture-time").textContent()).startsWith("Captured "),
        "Refresh did not replace the capture timestamp.",
      );
      requireCondition(consoleErrors.length === 0, `Browser console errors: ${consoleErrors.join(" | ")}`);

      return {
        views: ["notices", "problems", "calendar", "summary"],
        noticeRows: report.counts.notices,
        findingRows: report.counts.findings,
        calendarRows: report.calendar.length,
        heldCalendarRows: report.heldFromCalendar.length,
        noticeReview: "passed",
        summaryDownload: "passed",
        calendarDownload: "passed",
        reportEndpoint: "passed",
        structuredHealth: "passed",
        sourceRefreshHttpStatus: refreshResponse.status(),
        mobileOverflowPixels: overflow,
        consoleErrors,
        screenshots: [
          "evidence/browser/desktop-notices.png",
          "evidence/browser/desktop-notice-review.png",
          "evidence/browser/desktop-problems.png",
          "evidence/browser/desktop-calendar.png",
          "evidence/browser/mobile-notices.png",
          "evidence/browser/mobile-problems.png",
          "evidence/browser/mobile-summary.png",
        ],
      };
    } finally {
      await browser.close();
    }
  } finally {
    server.kill("SIGTERM");
  }
}

await mkdir(browserDir, { recursive: true });
const report = await buildReport({ rootDir });

const testResult = spawnSync(process.execPath, ["--test", "--test-reporter=tap"], {
  cwd: rootDir,
  encoding: "utf8",
});
process.stdout.write(testResult.stdout || "");
process.stderr.write(testResult.stderr || "");
requireCondition(testResult.status === 0, "Automated tests failed.");
const automatedTests = Number.parseInt(testResult.stdout.match(/# tests (\d+)/)?.[1] || "0", 10);
requireCondition(automatedTests > 0, "Automated test count could not be verified.");

const [liveSources, browserResult] = await Promise.all([
  liveSourceChecks(),
  browserChecks(report),
]);

const finalReport = await buildReport({ rootDir });

const manifest = JSON.parse(await readFile(path.join(rootDir, "data", "raw", "source-manifest.json"), "utf8"));
const approvedHosts = new Set(["status.coreweave.com", "status.io"]);
const unexpectedSourceHosts = finalReport.events.filter((event) => !approvedHosts.has(new URL(event.sourceUrl).hostname)).length;
const recordsWithoutSourceId = finalReport.events.filter((event) => !event.id || !event.sourceUrl).length;
const manifestHashMismatches = (await Promise.all(manifest.sources.map(async (source) => {
  const sourceBody = await readFile(path.join(rootDir, source.file), "utf8");
  return sha256(sourceBody) === source.sha256 ? 0 : 1;
}))).reduce((total, count) => total + count, 0);
requireCondition(unexpectedSourceHosts === 0, "A generated record points to an unexpected source host.");
requireCondition(recordsWithoutSourceId === 0, "A generated record lacks source identity.");
requireCondition(manifestHashMismatches === 0, "A current source hash does not match its manifest.");
const verification = {
  verifiedAt: new Date().toISOString(),
  result: "pass",
  dataBoundary: "Public CoreWeave status records only",
  unexpectedSourceHosts,
  recordsWithoutSourceId,
  manifestHashMismatches,
  counts: finalReport.counts,
  calendarEntries: finalReport.calendar.length,
  heldFromCalendar: finalReport.heldFromCalendar.length,
  sourceManifest: manifest,
  liveSources,
  automatedTests,
  browser: browserResult,
};

const markdown = [
  "# Verification report",
  "",
  `- Result: PASS`,
  `- Verified: ${verification.verifiedAt}`,
  `- Notices: ${finalReport.counts.notices}`,
  `- Review items: ${finalReport.counts.findings}`,
  `- Calendar entries: ${finalReport.calendar.length}`,
  `- Held from calendar: ${finalReport.heldFromCalendar.length}`,
  `- Automated tests: ${automatedTests} passed`,
  `- Browser views: 4 passed`,
  `- Mobile horizontal overflow: ${browserResult.mobileOverflowPixels}px`,
  `- Browser console errors: ${browserResult.consoleErrors.length}`,
  `- Records with unexpected source hosts: ${unexpectedSourceHosts}`,
  `- Records missing source identity: ${recordsWithoutSourceId}`,
  `- Manifest hash mismatches: ${manifestHashMismatches}`,
  "",
  "## Captured sources",
  "",
  ...manifest.sources.map((source) => `- ${source.url} — HTTP ${source.httpStatus}, SHA-256 ${source.sha256}`),
  "",
  "Live availability is checked separately from deterministic assertions against the archived real-data snapshot.",
  "",
].join("\n");

await Promise.all([
  writeFile(path.join(evidenceDir, "verification.json"), `${JSON.stringify(verification, null, 2)}\n`, "utf8"),
  writeFile(path.join(evidenceDir, "verification.md"), markdown, "utf8"),
]);

console.log(`PASS: ${automatedTests} tests, 4 browser views, ${finalReport.counts.notices} source-backed notices, ${manifestHashMismatches} hash mismatches.`);
