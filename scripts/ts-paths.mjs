/**
 * Lets Node run the app's TypeScript modules from a script:
 *
 *   node --import ./scripts/ts-paths.mjs scripts/<script>.mjs
 *
 * Node strips the types itself; this only resolves the "@/…" alias and the
 * extensionless imports the bundler accepts, the way tsconfig's paths do.
 */
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    const base = specifier.startsWith("@/")
      ? path.join(ROOT, specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL?.endsWith(".ts")
        ? path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
        : null;
    const file = base && [base, `${base}.ts`, `${base}/index.ts`].find(isFile);
    return nextResolve(file ? pathToFileURL(file).href : specifier, context);
  },
});

function isFile(file) {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}
