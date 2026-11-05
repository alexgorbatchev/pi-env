---
created_on: 2026-11-05 11:23
last_modified: 2026-11-05 11:23
status: current
---

# pi-env

Pi extension that applies global and project environment settings to the current agent process.

## Commands

- `just setup`: install locked development dependencies with Bun 1.4 or newer.
- `just run`: start the installed Pi with the local extension; this uses the developer's real Pi settings.
- `just check`: read-only formatting, lint, type, unused-code, and coverage checks.
- `just test`: run all tests under the shared isolation supervisor.
- `just test src/__tests__/piEnvExtension.test.ts`: run the behavior suite.
- `just fmt`: format source and the justfile.

## Integration contracts

- Keep the Pi entrypoint in `src/index.ts` as a pure re-export. Its package export is also the public entrypoint for unused-code analysis.
- Use the installed `@earendil-works` SDK and declare directly imported Pi packages as peers and development dependencies with real version ranges.
- Apply global settings before project settings; project values override global values.
- Reports contain configured values. Preserve the README warning against storing secrets, and remove this extension's reports from model context without removing other messages.
- Test behavior through Pi's resource loader and event runner. Include a file-based loader test so source loading is exercised independently of direct imports.

## Testing and artifacts

- For executable behavior changes, add or update meaningful behavioral tests.
- Require at least 90% line and function coverage over non-test first-party source, including unexecuted files. `just test` enforces both metrics; its coverage preload imports every source module. Exclude tests and tool configuration, and exclude `scripts/` if introduced.
- Keep `bunfig.toml` environment-file loading disabled and the shared package preload enabled. Direct `bun test` must fail outside an isolated run.
- Consume `@alexgorbatchev/pi-test-isolation` from its pinned GitHub tag. Use its runner and guard directly; do not copy their implementation into this repository.
- Tests remove their own files and restore environment changes. The supervisor owns the temporary home, caches, sessions, and child process group; it is an environment boundary, not a filesystem sandbox.
- Keep disposable scratch in task-owned `.tmp/` children, retained records in `.state/`, and regenerable caches in `.cache/`. Never delete shared scratch by directory name.
- After test changes, compare checkout scratch, system temporary files, and child processes before and after execution.
- Keep tests and test fixtures out of the published package; verify package contents before publication.

## Publication

- Keep the lockfile committed and CI on the same Bun version used for verification.
- Publish required releases, tags, and packages through the existing workflow after required checks pass. Keep the package version and release tag aligned.
- Never publish private hostnames, credentials, or private task-tracker references.
