// src/lib/io.ts
// Shared atomic-write helper for collect.ts / merge.ts. Every output file in
// this pipeline is written this way: same-day reruns overwrite in place,
// never append, and a crash mid-write never leaves a corrupt/partial file
// at the real path (the OS rename is atomic).
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, path);
}
