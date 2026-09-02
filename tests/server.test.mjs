import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMaintenanceServer } from "../scripts/serve.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("refresh endpoint returns 502 when validation fails", async () => {
  const server = createMaintenanceServer({
    refreshHandler: async () => {
      throw new Error("Source contract failed: status page event markers are missing");
    },
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/refresh`, { method: "POST" });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Source contract failed/);
  } finally {
    await close(server);
  }
});

test("refresh endpoint rejects concurrent refreshes with 409", async () => {
  let releaseRefresh;
  let markStarted;
  const refreshStarted = new Promise((resolve) => { markStarted = resolve; });
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const server = createMaintenanceServer({
    refreshHandler: async () => {
      markStarted();
      await refreshGate;
      return { generatedAt: "2026-09-02T18:00:00.000Z", counts: { notices: 15 } };
    },
  });
  const baseUrl = await listen(server);
  try {
    const firstRequest = fetch(`${baseUrl}/api/refresh`, { method: "POST" });
    await refreshStarted;
    const secondResponse = await fetch(`${baseUrl}/api/refresh`, { method: "POST" });
    assert.equal(secondResponse.status, 409);
    assert.deepEqual(await secondResponse.json(), { error: "A refresh is already running." });
    releaseRefresh();
    assert.equal((await firstRequest).status, 200);
  } finally {
    releaseRefresh();
    await close(server);
  }
});

test("health and report endpoints expose the generated integration contract", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "maintenance-server-test-"));
  const generated = {
    schemaVersion: 2,
    generatedAt: "2026-09-02T18:00:00.000Z",
    counts: { notices: 15, findings: 5, calendarReady: 4, calendarHeld: 3 },
    events: [],
  };
  await mkdir(path.join(rootDir, "site"), { recursive: true });
  await writeFile(path.join(rootDir, "site", "data.json"), JSON.stringify(generated), "utf8");
  const server = createMaintenanceServer({ rootDir });
  const baseUrl = await listen(server);
  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: "ok",
      schemaVersion: 2,
      generatedAt: generated.generatedAt,
      counts: generated.counts,
    });
    const report = await fetch(`${baseUrl}/api/report`);
    assert.equal(report.status, 200);
    assert.deepEqual(await report.json(), generated);
  } finally {
    await close(server);
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("malformed static URL returns 400 without stopping the server", async () => {
  const server = createMaintenanceServer();
  const baseUrl = await listen(server);
  try {
    const malformed = await fetch(`${baseUrl}/%`);
    assert.equal(malformed.status, 400);
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
  } finally {
    await close(server);
  }
});
