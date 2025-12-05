import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

export function emitNDJSON(outdir: string, name: string, rows: unknown[]) {
  ensureDir(outdir);
  writeFileSync(join(outdir, name + ".ndjson"), rows.map(r => JSON.stringify(r)).join("\n"));
}





