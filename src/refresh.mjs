import { access, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { captureSources } from "./capture.mjs";
import { buildReport, writeReportOutputs } from "./pipeline.mjs";

async function promoteRawDirectory(stagedRawDir, rawDir) {
  const backupDir = `${rawDir}.backup-${process.pid}-${Date.now()}`;
  let hasBackup = false;
  try {
    let rawExists = true;
    try {
      await access(rawDir);
    } catch (error) {
      if (error.code === "ENOENT") rawExists = false;
      else throw error;
    }
    if (rawExists) {
      await rename(rawDir, backupDir);
      hasBackup = true;
    }
    await rename(stagedRawDir, rawDir);
    await rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    if (hasBackup) {
      await rm(rawDir, { recursive: true, force: true });
      await rename(backupDir, rawDir);
    }
    throw error;
  }
}

export async function refreshProject({ rootDir, fetchImpl = fetch, now = new Date() }) {
  const stageDir = await mkdtemp(path.join(rootDir, ".refresh-stage-"));
  const stagedRawDir = path.join(stageDir, "raw");
  const rawDir = path.join(rootDir, "data", "raw");
  try {
    await captureSources({ rootDir, rawDir: stagedRawDir, fetchImpl, now });
    const report = await buildReport({ rootDir, rawDir: stagedRawDir, now, writeOutputs: false });
    await promoteRawDirectory(stagedRawDir, rawDir);
    await writeReportOutputs({ rootDir, report });
    return report;
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}
