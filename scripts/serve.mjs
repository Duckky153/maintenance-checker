import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshProject } from "../src/refresh.mjs";

const defaultRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

export function createMaintenanceServer({
  rootDir = defaultRootDir,
  host = "127.0.0.1",
  port = 4180,
  refreshHandler = () => refreshProject({ rootDir }),
} = {}) {
  const siteDir = path.join(rootDir, "site");
  let refreshInProgress = false;
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      respond(response, 200, "ok");
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/refresh") {
      if (refreshInProgress) {
        respond(response, 409, JSON.stringify({ error: "A refresh is already running." }), contentTypes[".json"]);
        return;
      }
      refreshInProgress = true;
      try {
        const report = await refreshHandler();
        respond(response, 200, JSON.stringify({ generatedAt: report.generatedAt, counts: report.counts }), contentTypes[".json"]);
      } catch (error) {
        respond(response, 502, JSON.stringify({ error: error.message }), contentTypes[".json"]);
      } finally {
        refreshInProgress = false;
      }
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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = "127.0.0.1";
  const port = Number.parseInt(process.env.PORT || "4180", 10);
  const server = createMaintenanceServer({ rootDir: defaultRootDir, host, port });
  server.listen(port, host, () => {
    console.log(`Maintenance Notice Checker: http://${host}:${port}`);
  });
}
