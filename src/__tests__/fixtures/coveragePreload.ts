import { Glob } from "bun";
import path from "node:path";

// Include every first-party module, even when no test imports it.
for await (const file of new Glob("**/*.ts").scan(path.resolve(import.meta.dir, "../.."))) {
  if (!file.includes("__tests__/") && !file.endsWith(".d.ts")) {
    await import(path.resolve(import.meta.dir, "../..", file));
  }
}
