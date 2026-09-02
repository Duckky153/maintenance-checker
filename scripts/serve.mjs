import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureSources } from "../src/capture.mjs";
import { buildReport } from "../src/pipeline.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(rootDir, "site");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4180", 10);
let refreshInProgress = false;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

function respond(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

async function refresh(response) {
  if (refreshInProgress) {
    respond(response, 409, JSON.stringify({ error: "A refresh is already running." }), contentTypes[".json"]);
    return;
  }
  refreshInProgress = true;
  try {
    await captureSources({ rootDir });
    const report = await buildReport({ rootDir });
    respond(
      response,
      200,
      JSON.stringify({ generatedAt: report.generatedAt, counts: report.counts }),
      contentTypes[".json"],
    );
  } catch (error) {
    respond(response, 502, JSON.stringify({ error: error.message }), contentTypes[".json"]);
  } finally {
    refreshInProgress = false;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (request.method === "GET" && url.pathname === "/health") {
    respond(response, 200, "ok");
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/refresh") {
    await refresh(response);
    return;
  }
  if (request.method !== "GET") {
    respond(response, 405, "Method not allowed");
    return;
  }

  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const resolved = path.resolve(siteDir, relativePath);
  if (resolved !== siteDir && !resolved.startsWith(`${siteDir}${path.sep}`)) {
    respond(response, 403, "Forbidden");
    return;
  }
  try {
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const body = await readFile(resolved);
    respond(response, 200, body, contentTypes[path.extname(resolved)] || "application/octet-stream");
  } catch {
    respond(response, 404, "Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Maintenance Notice Checker: http://${host}:${port}`);
});
