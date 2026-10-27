/**
 * Poppler's command-line tools (pdftoppm, pdftotext), found by absolute path
 * so the scripts never run whatever a PATH entry happens to supply.
 */
import fs from "node:fs";
import path from "node:path";

/** Checked in order, after POPPLER_BIN_DIR when that is set. */
export const POPPLER_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

/**
 * The tool's absolute path, or an error naming every directory checked.
 * @param {string} tool
 * @param {Record<string, string | undefined>} [env]
 */
export function findPopplerTool(tool, env = process.env) {
  const dirs = [env.POPPLER_BIN_DIR, ...POPPLER_DIRS].filter(Boolean);
  for (const dir of dirs) {
    const file = path.join(dir, tool);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {
      // Not here; try the next directory.
    }
  }
  throw new Error(
    `${tool} not found in ${dirs.join(", ")}. Install poppler, or set POPPLER_BIN_DIR to its bin directory.`,
  );
}

const found = new Map();

/** findPopplerTool, resolved once per tool for the life of the process. */
export function popplerTool(tool) {
  if (!found.has(tool)) found.set(tool, findPopplerTool(tool));
  return found.get(tool);
}
