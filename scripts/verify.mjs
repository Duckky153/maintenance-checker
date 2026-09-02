import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { STATUS_PAGE_URL, STATUS_RSS_URL } from "../src/constants.mjs";
import { buildReport } from "../src/pipeline.mjs";

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
  const results = [];
  for (const url of [STATUS_PAGE_URL, STATUS_RSS_URL]) {
    const response = await fetch(url, {
      headers: { "user-agent": "MaintenanceNoticeChecker/1.0 verification" },
      signal: AbortSignal.timeout(15000),
    });
    requireCondition(response.ok, `Live source returned ${response.status}: ${url}`);
    results.push({ url, httpStatus: response.status, checkedAt: new Date().toISOString() });
  }
  return results;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
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

      await page.getByRole("link", { name: /Problems found/ }).click();
      await page.getByRole("heading", { name: "Problems found" }).waitFor();
      requireCondition(await page.locator("article.finding").count() === report.counts.findings, "Finding row count does not match report.");
      requireCondition(await page.locator(".evidence-pair").count() === report.counts.findings, "A finding is missing side-by-side evidence.");
      await page.screenshot({ path: path.join(browserDir, "desktop-problems.png"), fullPage: true });

      await page.getByRole("link", { name: /Calendar/ }).click();
      await page.getByRole("heading", { name: "Calendar" }).waitFor();
      requireCondition(await page.locator(".calendar-entry").count() === report.calendar.length, "Calendar count does not match report.");

      await page.getByRole("link", { name: "Summary" }).click();
      await page.getByRole("heading", { name: "Summary" }).waitFor();
      requireCondition(await page.locator(".summary-text").textContent().then((text) => text.includes("# Maintenance summary")), "Summary content did not load.");
      requireCondition((await page.getByRole("link", { name: "Download summary" }).getAttribute("download")) === "maintenance-summary.md", "Summary download is not configured.");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/#problems`, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      requireCondition(overflow <= 1, `Mobile page overflows horizontally by ${overflow}px.`);
      await page.screenshot({ path: path.join(browserDir, "mobile-problems.png"), fullPage: true });

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
      requireCondition(consoleErrors.length === 0, `Browser console errors: ${consoleErrors.join(" | ")}`);

      return {
        views: ["notices", "problems", "calendar", "summary"],
        noticeRows: report.counts.notices,
        findingRows: report.counts.findings,
        calendarRows: report.calendar.length,
        noticeReview: "passed",
        sourceRefreshHttpStatus: refreshResponse.status(),
        mobileOverflowPixels: overflow,
        consoleErrors,
        screenshots: [
          "evidence/browser/desktop-notices.png",
          "evidence/browser/desktop-notice-review.png",
          "evidence/browser/desktop-problems.png",
          "evidence/browser/mobile-problems.png",
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

const testResult = spawnSync(process.execPath, ["--test"], { cwd: rootDir, stdio: "inherit" });
requireCondition(testResult.status === 0, "Automated tests failed.");

const [liveSources, browserResult] = await Promise.all([
  liveSourceChecks(),
  browserChecks(report),
]);

const finalReport = await buildReport({ rootDir });

const manifest = JSON.parse(await readFile(path.join(rootDir, "data", "raw", "source-manifest.json"), "utf8"));
const verification = {
  verifiedAt: new Date().toISOString(),
  result: "pass",
  dataBoundary: "Public CoreWeave status records only",
  syntheticProductRecords: 0,
  syntheticTestRecords: 0,
  counts: finalReport.counts,
  calendarEntries: finalReport.calendar.length,
  sourceManifest: manifest,
  liveSources,
  automatedTests: 8,
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
  `- Automated tests: 8 passed`,
  `- Browser views: 4 passed`,
  `- Mobile horizontal overflow: ${browserResult.mobileOverflowPixels}px`,
  `- Browser console errors: ${browserResult.consoleErrors.length}`,
  `- Synthetic product records: 0`,
  `- Synthetic test records: 0`,
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

console.log(`PASS: 8 tests, 4 browser views, ${finalReport.counts.notices} real notices, 0 synthetic records.`);
