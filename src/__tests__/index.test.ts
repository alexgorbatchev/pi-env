import { DefaultResourceLoader, getAgentDir } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionPath = fileURLToPath(new URL("../index.ts", import.meta.url));

describe("pi-env extension entry", () => {
  let projectDir = "";

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("loads through Pi's extension loader and registers the env command", async () => {
    projectDir = mkdtempSync(path.join(tmpdir(), "pi-env-project-"));
    const loader = new DefaultResourceLoader({
      cwd: projectDir,
      agentDir: getAgentDir(),
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      additionalExtensionPaths: [extensionPath],
    });

    await loader.reload();
    const { extensions, errors } = loader.getExtensions();

    expect(errors).toEqual([]);
    expect(extensions.map((extension) => [extension.path, [...extension.commands.keys()]])).toEqual([
      [extensionPath, ["env"]],
    ]);
  });
});
