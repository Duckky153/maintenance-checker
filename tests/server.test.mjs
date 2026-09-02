import test from "node:test";
import assert from "node:assert/strict";
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
