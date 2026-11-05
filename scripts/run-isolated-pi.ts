/**
 * Runs a command, normally `bun test`, in a per-run environment that cannot
 * reach the developer's Pi home, npm global prefix, npm cache, XDG directories,
 * or the shared temporary directory, then removes everything the run created.
 *
 * Usage: bun scripts/run-isolated-pi.ts <command> [args...]
 *
 * The environment has to exist before the test process starts: Bun's
 * `os.homedir()` ignores later changes to `process.env.HOME`, and `Bun.spawn`
 * children receive the startup environment rather than a mutated `process.env`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmdirSync, rmSync } from "node:fs";
import { constants, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ISOLATION_ROOT_VARIABLE = "PI_TEST_ISOLATION_ROOT";

/** Variables that must point inside the isolation root for the whole run. */
const ISOLATED_PATH_VARIABLES = [
  "HOME",
  "PI_CODING_AGENT_DIR",
  "npm_config_prefix",
  "npm_config_cache",
  "npm_config_userconfig",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
] as const;

/** Caller variables passed through unchanged; everything else is dropped. */
const INHERITED_VARIABLES = [
  "PATH",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "COLORTERM",
  "NO_COLOR",
  "FORCE_COLOR",
  "CI",
] as const;

const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const TERMINATION_GRACE_MS = 5000;
const GROUP_POLL_INTERVAL_MS = 50;
const TIMEOUT_EXIT_CODE = 124;
const FORWARDED_SIGNALS = ["SIGHUP", "SIGINT", "SIGTERM"] as const;

interface IInterruption {
  exitCode: number;
  reason: string;
}

function createIsolatedEnvironment(rootDir: string, inheritedEnv: NodeJS.ProcessEnv): Record<string, string> {
  const homeDir = path.join(rootDir, "home");
  const directories = {
    HOME: homeDir,
    PI_CODING_AGENT_DIR: path.join(homeDir, ".pi", "agent"),
    npm_config_prefix: path.join(rootDir, "npm", "prefix"),
    npm_config_cache: path.join(rootDir, "npm", "cache"),
    XDG_CONFIG_HOME: path.join(rootDir, "xdg", "config"),
    XDG_CACHE_HOME: path.join(rootDir, "xdg", "cache"),
    XDG_DATA_HOME: path.join(rootDir, "xdg", "data"),
    XDG_STATE_HOME: path.join(rootDir, "xdg", "state"),
    TMPDIR: path.join(rootDir, "tmp"),
  };

  for (const directory of Object.values(directories)) {
    mkdirSync(directory, { recursive: true });
  }

  const env: Record<string, string> = {};
  for (const name of INHERITED_VARIABLES) {
    const value = inheritedEnv[name];
    if (value !== undefined) {
      env[name] = value;
    }
  }

  return {
    ...env,
    ...directories,
    npm_config_userconfig: path.join(homeDir, ".npmrc"),
    TMP: directories.TMPDIR,
    TEMP: directories.TMPDIR,
    PI_OFFLINE: "1",
    [ISOLATION_ROOT_VARIABLE]: rootDir,
  };
}

/**
 * Lists what is not isolated in the current process: missing variables, variables that
 * point outside the isolation root, or a home directory the process did not start with.
 */
export function findIsolationViolations(env: NodeJS.ProcessEnv): string[] {
  const rootDir = env[ISOLATION_ROOT_VARIABLE];
  if (rootDir === undefined || !path.isAbsolute(rootDir) || !existsSync(rootDir)) {
    return [ISOLATION_ROOT_VARIABLE];
  }

  const violations: string[] = ISOLATED_PATH_VARIABLES.filter((name) => {
    const value = env[name];
    return value === undefined || !value.startsWith(rootDir + path.sep);
  });
  if (homedir() !== env.HOME) {
    violations.push("os.homedir()");
  }
  return violations;
}

function isProcessGroupAlive(groupId: number): boolean {
  try {
    process.kill(-groupId, 0);
    return true;
  } catch {
    return false;
  }
}

function signalProcessGroup(groupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-groupId, signal);
  } catch {
    // The group already exited.
  }
}

async function waitForProcessGroupExit(groupId: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isProcessGroupAlive(groupId)) {
    if (Date.now() >= deadline) {
      return false;
    }
    await Bun.sleep(GROUP_POLL_INTERVAL_MS);
  }
  return true;
}

/** Stops every process left in the group: SIGTERM, a bounded grace period, then SIGKILL. */
async function stopProcessGroup(groupId: number): Promise<void> {
  if (!isProcessGroupAlive(groupId)) {
    return;
  }

  signalProcessGroup(groupId, "SIGTERM");
  if (await waitForProcessGroupExit(groupId, TERMINATION_GRACE_MS)) {
    return;
  }

  signalProcessGroup(groupId, "SIGKILL");
  await waitForProcessGroupExit(groupId, TERMINATION_GRACE_MS);
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(code ?? 128 + (signal === null ? 0 : constants.signals[signal]));
    });
  });
}

async function runIsolated(command: string, args: string[], projectRoot: string): Promise<number> {
  const scratchDir = path.join(projectRoot, ".tmp");
  const createdScratchDir = !existsSync(scratchDir);
  mkdirSync(scratchDir, { recursive: true });
  const rootDir = mkdtempSync(path.join(scratchDir, "pi-test-"));

  let child: ChildProcess | undefined;
  let interruption: IInterruption | undefined;
  const interrupt = (exitCode: number, reason: string): void => {
    if (interruption !== undefined) {
      return;
    }
    interruption = { exitCode, reason };
    if (child?.pid !== undefined) {
      void stopProcessGroup(child.pid);
    }
  };

  const signalHandlers = FORWARDED_SIGNALS.map((signal) => {
    const handler = (): void => interrupt(128 + constants.signals[signal], `received ${signal}`);
    process.on(signal, handler);
    return { signal, handler };
  });
  const timeout = setTimeout(
    () => interrupt(TIMEOUT_EXIT_CODE, `timed out after ${RUN_TIMEOUT_MS} ms`),
    RUN_TIMEOUT_MS,
  );

  try {
    child = spawn(command, args, {
      cwd: projectRoot,
      env: createIsolatedEnvironment(rootDir, process.env),
      stdio: "inherit",
      detached: true,
    });
    const exitCode = await waitForExit(child);
    if (interruption !== undefined) {
      console.error(`run-isolated-pi: ${interruption.reason}; stopped ${command}`);
      return interruption.exitCode;
    }
    return exitCode;
  } finally {
    clearTimeout(timeout);
    if (child?.pid !== undefined) {
      await stopProcessGroup(child.pid);
    }
    for (const { signal, handler } of signalHandlers) {
      process.off(signal, handler);
    }
    rmSync(rootDir, { recursive: true, force: true });
    if (createdScratchDir) {
      removeIfEmpty(scratchDir);
    }
  }
}

function removeIfEmpty(directory: string): void {
  try {
    rmdirSync(directory);
  } catch {
    // Another consumer still uses it.
  }
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined) {
    console.error("Usage: bun scripts/run-isolated-pi.ts <command> [args...]");
    process.exit(2);
  }

  const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  process.exit(await runIsolated(command, args, projectRoot));
}
