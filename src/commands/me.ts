import type { Command } from "commander";
import { createClient, type CommandContext, writeOutput } from "./context.js";
import { renderKeyValue } from "../output/text.js";

export function registerMe(program: Command, context: CommandContext): void {
  program
    .command("me")
    .description("Show the authenticated OpenProject user")
    .option("--json", "emit JSON")
    .action(async (options: { json?: boolean }, command: Command) => {
      const me = await createClient(context, command).getMe();
      writeOutput(context, me, Boolean(options.json), () => renderKeyValue(me as unknown as Record<string, unknown>));
    });
}
