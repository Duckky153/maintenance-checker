import { access, cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { captureSources } from "./capture.mjs";
import { buildReport } from "./pipeline.mjs";

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function promoteArtifacts({ rootDir, stageDir, relativePaths }) {
  const suffix = `.backup-${process.pid}-${Date.now()}`;
  const touched = [];
  try {
    for (const relativePath of relativePaths) {
      const staged = path.join(stageDir, relativePath);
      const target = path.join(rootDir, relativePath);
      const backup = `${target}${suffix}`;
      await mkdir(path.dirname(target), { recursive: true });
      const state = { target, backup, hadBackup: false, promoted: false };
      touched.push(state);
      if (await exists(target)) {
        await rename(target, backup);
        state.hadBackup = true;
      }
      await rename(staged, target);
      state.promoted = true;
    }
  } catch (error) {
    for (const state of touched.reverse()) {
      if (state.promoted) await rm(state.target, { recursive: true, force: true });
      if (state.hadBackup) await rename(state.backup, state.target);
    }
    throw error;
  }
  await Promise.all(touched.map((state) => rm(state.backup, { recursive: true, force: true })));
}

export async function refreshProject({ rootDir, fetchImpl = fetch, now = new Date() }) {
  const stageDir = await mkdtemp(path.join(rootDir, ".refresh-stage-"));
  const stagedRawDir = path.join(stageDir, "data", "raw");
  const archiveLabel = now.toISOString().replace(/[:.]/g, "-");
  const archiveRelativePath = path.join("evidence", "source-snapshots", archiveLabel);
  try {
    await captureSources({ rootDir: stageDir, rawDir: stagedRawDir, fetchImpl, now });
    const report = await buildReport({ rootDir: stageDir, rawDir: stagedRawDir, now });
    await mkdir(path.dirname(path.join(stageDir, archiveRelativePath)), { recursive: true });
    await cp(stagedRawDir, path.join(stageDir, archiveRelativePath), { recursive: true, errorOnExist: true });
    await promoteArtifacts({
      rootDir,
      stageDir,
      relativePaths: [
        path.join("data", "raw"),
        path.join("data", "generated", "report.json"),
        path.join("data", "generated", "maintenance-summary.md"),
        path.join("data", "generated", "calendar.ics"),
        path.join("site", "data.json"),
        path.join("site", "maintenance-summary.md"),
        path.join("site", "calendar.ics"),
        archiveRelativePath,
      ],
    });
    return report;
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}
