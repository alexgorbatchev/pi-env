import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SettingsManager } from "@mariozechner/pi-coding-agent";

const CONFIG_KEY = "@alexgorbatchev/pi-env";

interface IEnvReportSummary {
  source: string;
  variables: Record<string, string>;
}

function extractEnvVars(settings: Record<string, unknown>): Record<string, string> | undefined {
  const vars = settings[CONFIG_KEY];
  if (vars !== undefined && typeof vars === "object" && vars !== null) {
    if (Object.keys(vars).length > 0) {
      return vars as Record<string, string>;
    }
  }
  return undefined;
}

function processSettingsForScope(settings: Record<string, unknown>, sourceName: string): IEnvReportSummary | undefined {
  const envVars = extractEnvVars(settings);
  if (envVars) {
    // Apply to process.env so child processes inherit them
    Object.assign(process.env, envVars);

    return {
      source: sourceName,
      variables: envVars,
    };
  }
  return undefined;
}

export default function piEnvExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    const settingsManager = SettingsManager.create(ctx.cwd);
    const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
    const projectSettings = settingsManager.getProjectSettings() as Record<string, unknown>;

    const summaries: IEnvReportSummary[] = [
      processSettingsForScope(globalSettings, "global settings"),
      processSettingsForScope(projectSettings, "project settings"),
    ].filter((summary): summary is IEnvReportSummary => summary !== undefined);

    if (summaries.length > 0 && ctx.hasUI) {
      let reportText = ctx.ui.theme.fg("mdHeading", `[${CONFIG_KEY}]`) + "\n";

      for (const summary of summaries) {
        reportText += ctx.ui.theme.fg("accent", `  ${summary.source}`) + "\n";
        for (const [key, value] of Object.entries(summary.variables)) {
          reportText += ctx.ui.theme.fg("dim", `    ${key}: ${value}`) + "\n";
        }
      }

      ctx.ui.notify(reportText.trimEnd(), "info");
    }
  });
}
