import type { Command } from "commander";
import { asObject } from "../client/hal.js";
import { stableJson } from "../output/json.js";
import { renderKeyValue } from "../output/text.js";
import { createClient, resolvedEnv, type CommandContext } from "./context.js";

export function registerApiRoot(program: Command, context: CommandContext): void {
  program
    .command("api-root")
    .description("Show compact OpenProject API root links")
    .option("--json", "emit JSON")
    .action(async (options: { json?: boolean }, command: Command) => {
      const root = await createClient(context, command).getApiRoot();
      const links = compactLinks(root);
      context.stdout.write(options.json ? stableJson(links, resolvedEnv(context, command).OPENPROJECT_TOKEN) : renderKeyValue(links));
    });
}

export function compactLinks(root: unknown): Record<string, string> {
  const links = asObject(asObject(root)?._links) ?? {};
  const output: Record<string, string> = {};
  for (const [name, raw] of Object.entries(links)) {
    const link = Array.isArray(raw) ? asObject(raw[0]) : asObject(raw);
    if (typeof link?.href === "string") output[name] = link.href;
  }
  return output;
}
