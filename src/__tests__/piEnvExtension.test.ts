import {
  DefaultResourceLoader,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  getAgentDir,
  initTheme,
  keyText,
  keyHint,
} from "@earendil-works/pi-coding-agent";
import type { ExtensionActions, ExtensionError, MessageRenderer } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import piEnvExtension from "../piEnvExtension.js";

type ReportRenderCase = [Parameters<MessageRenderer>[0]["content"], string];

const configKey = "@alexgorbatchev/pi-env";
const initialEnv = { ...process.env };
const globalSettingsPath = path.join(getAgentDir(), "settings.json");
let projectDir = "";
let runner: ExtensionRunner;
let messages: Parameters<ExtensionActions["sendMessage"]>[0][];
let errors: ExtensionError[];

beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "pi-env-behavior-"));
  await mkdir(path.join(projectDir, ".pi"));
  initTheme("dark", false);
  messages = [];
  errors = [];
  const loader = new DefaultResourceLoader({
    cwd: projectDir,
    agentDir: getAgentDir(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [piEnvExtension],
  });
  await loader.reload();
  const result = loader.getExtensions();
  expect(result.errors).toEqual([]);
  result.runtime.sendMessage = (message) => {
    messages.push(message);
  };
  const modelRuntime = await ModelRuntime.create({
    refreshOnCreate: false,
    allowModelNetwork: false,
    modelsPath: null,
  });
  runner = new ExtensionRunner(
    result.extensions,
    result.runtime,
    projectDir,
    SessionManager.inMemory(projectDir),
    new ModelRegistry(modelRuntime),
  );
  runner.onError((error) => {
    errors.push(error);
  });
});

afterEach(async () => {
  process.env = { ...initialEnv };
  await rm(globalSettingsPath, { force: true });
  await rm(projectDir, { recursive: true, force: true });
  expect(errors).toEqual([]);
});

async function writeSettings(globalValue: unknown, projectValue: unknown): Promise<void> {
  await Bun.write(globalSettingsPath, JSON.stringify({ [configKey]: globalValue }));
  await Bun.write(path.join(projectDir, ".pi/settings.json"), JSON.stringify({ [configKey]: projectValue }));
}

async function runCommand(): Promise<void> {
  const command = runner.getCommand("env");
  assert(command);
  await command.handler("", runner.createCommandContext());
}

describe("environment injection", () => {
  test("applies global settings then project overrides, including empty strings", async () => {
    await writeSettings(
      { PI_ENV_TEST_SHARED: "global", PI_ENV_TEST_GLOBAL: "base" },
      { PI_ENV_TEST_SHARED: "project", PI_ENV_TEST_EMPTY: "" },
    );
    runner.setUIContext({ ...runner.getUIContext() });
    await runner.emit({ type: "session_start", reason: "startup" });
    expect(process.env.PI_ENV_TEST_SHARED).toBe("project");
    expect(process.env.PI_ENV_TEST_GLOBAL).toBe("base");
    expect(process.env.PI_ENV_TEST_EMPTY).toBe("");
    expect(messages).toHaveLength(1);
    const message = messages[0];
    assert(message && typeof message.content === "string");
    expect({ ...message, content: Bun.stripANSI(message.content) }).toEqual({
      customType: configKey,
      display: true,
      content:
        "[@alexgorbatchev/pi-env]\n  global settings\n    PI_ENV_TEST_SHARED: global\n    PI_ENV_TEST_GLOBAL: base\n  project settings\n    PI_ENV_TEST_SHARED: project\n    PI_ENV_TEST_EMPTY: ",
    });
  });

  test("injects settings in headless sessions without emitting a report", async () => {
    await writeSettings({}, { PI_ENV_TEST_SHARED: "headless" });
    await runner.emit({ type: "session_start", reason: "startup" });
    expect(process.env.PI_ENV_TEST_SHARED).toBe("headless");
    expect(messages).toEqual([]);
  });

  test.each([null, "invalid", 12, { PI_ENV_TEST_SHARED: 12 }, {}])(
    "ignores invalid or empty configuration: %j",
    async (value) => {
      process.env.PI_ENV_TEST_SHARED = "existing";
      await writeSettings(value, value);
      runner.setUIContext({ ...runner.getUIContext() });
      await runner.emit({ type: "session_start", reason: "startup" });
      expect(process.env.PI_ENV_TEST_SHARED).toBe("existing");
      expect(messages).toEqual([]);
    },
  );

  test("starts without settings files", async () => {
    runner.setUIContext({ ...runner.getUIContext() });
    await runner.emit({ type: "session_start", reason: "startup" });
    expect(messages).toEqual([]);
  });

  test("env command reloads edited settings and reports them", async () => {
    await writeSettings({}, { PI_ENV_TEST_SHARED: "first" });
    await runCommand();
    await writeSettings({}, { PI_ENV_TEST_SHARED: "updated" });
    await runCommand();
    expect(process.env.PI_ENV_TEST_SHARED).toBe("updated");
    expect(
      messages.map((message) => {
        assert(typeof message.content === "string");
        return Bun.stripANSI(message.content);
      }),
    ).toEqual([
      "[@alexgorbatchev/pi-env]\n  project settings\n    PI_ENV_TEST_SHARED: first",
      "[@alexgorbatchev/pi-env]\n  project settings\n    PI_ENV_TEST_SHARED: updated",
    ]);
  });

  test("env command reports an empty configuration", async () => {
    await runCommand();
    const message = messages[0];
    assert(message && typeof message.content === "string");
    expect(Bun.stripANSI(message.content)).toBe("[@alexgorbatchev/pi-env]");
    expect(messages).toHaveLength(1);
  });
});

describe("reports", () => {
  test("removes only this extension's report from model context", async () => {
    const conversation: Parameters<ExtensionRunner["emitContext"]>[0] = [
      { role: "user", content: "Keep user text", timestamp: 1 },
      { role: "custom", customType: configKey, content: "Do not send settings", display: true, timestamp: 2 },
      { role: "custom", customType: "another-extension", content: "Keep other report", display: true, timestamp: 3 },
    ];
    const filtered = await runner.emitContext(conversation);
    const userMessage = conversation[0];
    const otherReport = conversation[2];
    assert(userMessage && otherReport);
    expect(filtered).toEqual([userMessage, otherReport]);
    expect(conversation).toHaveLength(3);
  });

  test.each<ReportRenderCase>([
    ["Plain report", "Plain report"],
    [
      [
        { type: "text", text: "First" },
        { type: "image", data: "AA==", mimeType: "image/png" },
        { type: "text", text: "Second" },
      ],
      "First\nSecond",
    ],
  ])("renders text content while omitting images", (content, expected) => {
    const renderer = runner.getMessageRenderer(configKey);
    assert(renderer);
    const component = renderer(
      { role: "custom", customType: configKey, content: structuredClone(content), display: true, timestamp: 1 },
      { expanded: false, outputPad: 0, keyText, keyHint },
      runner.getUIContext().theme,
    );
    assert(component);
    expect(
      component
        .render(80)
        .map((line) => Bun.stripANSI(line).trimEnd())
        .join("\n"),
    ).toBe(expected);
  });
});
