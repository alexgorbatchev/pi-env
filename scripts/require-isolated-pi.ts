/**
 * `bun test` preload: refuses to run tests outside the environment created by
 * `scripts/run-isolated-pi.ts`, so a plain `bun test` cannot read or write the
 * developer's Pi home, npm global prefix, npm cache, or shared temporary directory.
 */
import { findIsolationViolations } from "./run-isolated-pi.js";

const violations = findIsolationViolations(process.env);
if (violations.length > 0) {
  throw new Error(
    `Tests must run in an isolated Pi environment; run \`bun run test\` instead of \`bun test\`. Not isolated: ${violations.join(", ")}`,
  );
}
