import { createHash } from "crypto";
import fs from "fs";
import path from "path";

/** A single asset file, reduced to the metadata the version digest depends on. */
export interface AssetFile {
  /** Path relative to the public root, with forward slashes. */
  path: string;
  /** Size of the file in bytes. */
  size: number;
  /** Last modification time in milliseconds since the epoch. */
  mtimeMs: number;
  /** Short digest of the file's content. */
  hash: string;
}

/** Directories under the public root that are served to the browser. */
const ASSET_DIRS = ["css", "js", "fonts", "vendor", "img"];

/** Absolute path to the served static root, in both dev (src/) and prod (dist/). */
export function publicRoot(): string {
  return path.join(__dirname, "..", "..", "public");
}

/**
 * Recursively collect the metadata of every file under the given directory.
 * Returns an empty list when the directory does not exist.
 */
function collect(dir: string, base: string, out: AssetFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, base, out);
      continue;
    }
    if (!entry.isFile()) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    out.push({
      path: path.relative(base, full).split(path.sep).join("/"),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      hash: hashFile(full),
    });
  }
}

/** Short digest of a file's content, or an empty string if it cannot be read. */
function hashFile(file: string): string {
  try {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
  } catch {
    return "";
  }
}

/** List every asset file that is served, sorted by path so the order is stable. */
export function listAssetFiles(root: string = publicRoot()): AssetFile[] {
  const files: AssetFile[] = [];
  for (const dir of ASSET_DIRS) {
    collect(path.join(root, dir), root, files);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

/**
 * Compute a short, deterministic digest for a set of asset files.
 * The digest is derived from each file's content, size and modification time,
 * so it changes whenever any of them changes and stays stable otherwise.
 */
export function computeAssetVersion(files: AssetFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file.path}:${file.size}:${file.mtimeMs}:${file.hash}\n`);
  }
  return hash.digest("hex").slice(0, 12);
}

let cachedVersion: string | null = null;

/**
 * The version token for the currently served assets.
 * Computed once per process and memoised; use `refreshAssetVersion()` to
 * recompute it (for example in a test or a watch-mode reload).
 */
export function assetVersion(): string {
  if (cachedVersion === null) {
    cachedVersion = computeAssetVersion(listAssetFiles());
  }
  return cachedVersion;
}

/** Discard the memoised version and recompute it from the current files. */
export function refreshAssetVersion(): string {
  cachedVersion = null;
  return assetVersion();
}
