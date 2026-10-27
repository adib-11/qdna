import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POPPLER_DIRS, findPopplerTool } from "../scripts/poppler.mjs";

describe("findPopplerTool", () => {
  const made: string[] = [];
  const dirWith = (...tools: string[]) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qdna-poppler-"));
    made.push(dir);
    for (const tool of tools) fs.writeFileSync(path.join(dir, tool), "", { mode: 0o755 });
    return dir;
  };
  afterEach(() => {
    for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("checks POPPLER_BIN_DIR first, then the fixed system directories", () => {
    expect(POPPLER_DIRS).toEqual(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]);
    const override = dirWith("pdftotext");
    expect(findPopplerTool("pdftotext", { POPPLER_BIN_DIR: override })).toBe(
      path.join(override, "pdftotext"),
    );
  });

  it("ignores PATH, and names every directory it checked when the tool is missing", () => {
    const onPath = dirWith("pdf-no-such-tool");
    const empty = dirWith();
    expect(() =>
      findPopplerTool("pdf-no-such-tool", { PATH: onPath, POPPLER_BIN_DIR: empty }),
    ).toThrow(`pdf-no-such-tool not found in ${empty}, /opt/homebrew/bin, /usr/local/bin, /usr/bin`);
  });
});
