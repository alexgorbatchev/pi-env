import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SettingsManager } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

const CONFIG_KEY = "@alexgorbatchev/pi-env";
const MESSAGE_TYPE = CONFIG_KEY;

interface IEnvReportSummary {
  source: string;
  variables: Record<string, string>;
}

interface IThemeFormatter {
  fg(color: string, text: string): string;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function extractEnvVars(settings: object): Record<string, string> | undefined {
  const vars = Reflect.get(settings, CONFIG_KEY);
  if (!isStringRecord(vars)) {
    return undefined;
  }

  return Object.keys(vars).length > 0 ? vars : undefined;
}

function processSettingsForScope(settings: object, sourceName: string): IEnvReportSummary | undefined {
  const envVars = extractEnvVars(settings);
  if (!envVars) {
    return undefined;
  }

  Object.assign(process.env, envVars);

  return {
    source: sourceName,
    variables: envVars,
  };
}

function getEnvReportSummaries(cwd: string): IEnvReportSummary[] {
  const settingsManager = SettingsManager.create(cwd);
  const summaries = [
    processSettingsForScope(settingsManager.getGlobalSettings(), "global settings"),
    processSettingsForScope(settingsManager.getProjectSettings(), "project settings"),
  ];

  return summaries.flatMap((summary) => (summary ? [summary] : []));
}

function formatEnvReport(theme: IThemeFormatter, summaries: readonly IEnvReportSummary[]): string {
  let reportText = theme.fg("mdHeading", `[${CONFIG_KEY}]`) + "\n";

  for (const summary of summaries) {
    reportText += theme.fg("accent", `  ${summary.source}`) + "\n";
    for (const [key, value] of Object.entries(summary.variables)) {
      reportText += theme.fg("dim", `    ${key}: ${value}`) + "\n";
    }
  }

  return reportText.trimEnd();
}

function sendEnvReport(pi: ExtensionAPI, reportText: string): void {
  pi.sendMessage({
    customType: MESSAGE_TYPE,
    content: reportText,
    display: true,
  });
}

export default function piEnvExtension(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(MESSAGE_TYPE, (message) => {
    const text =
      typeof message.content === "string"
        ? message.content
        : message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n");

    return new Text(text, 0, 0);
  });

  pi.on("context", async (event) => ({
    messages: event.messages.filter((message) => message.role !== "custom" || message.customType !== MESSAGE_TYPE),
  }));

  pi.registerCommand("env", {
    description: "Show configured environment variables",
    handler: async (_args, ctx) => {
      const summaries = getEnvReportSummaries(ctx.cwd);
      if (summaries.length === 0) {
        sendEnvReport(pi, formatEnvReport(ctx.ui.theme, []));
        return;
      }

      sendEnvReport(pi, formatEnvReport(ctx.ui.theme, summaries));
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const summaries = getEnvReportSummaries(ctx.cwd);
    if (summaries.length === 0 || !ctx.hasUI) {
      return;
    }

    sendEnvReport(pi, formatEnvReport(ctx.ui.theme, summaries));
  });
}
