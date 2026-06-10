import type { Command } from "commander";
import { renderTable } from "../output/table.js";
import { createClient, type CommandContext, writeOutput } from "./context.js";

export function registerLookups(program: Command, context: CommandContext): void {
  program
    .command("types")
    .description("List work package types")
    .option("--project <identifier-or-id>", "project to scope types")
    .option("--json", "emit JSON")
    .action(async (options: { project?: string; json?: boolean }, command: Command) => {
      const result = await createClient(context, command).listTypes(options.project ? { project: options.project } : {});
      writeOutput(context, result, Boolean(options.json), () => renderTable(result.elements as unknown as object[], ["id", "name", "href", "isDefault", "isMilestone"]));
    });

  program
    .command("statuses")
    .description("List work package statuses")
    .option("--json", "emit JSON")
    .action(async (options: { json?: boolean }, command: Command) => {
      const result = await createClient(context, command).listStatuses();
      writeOutput(context, result, Boolean(options.json), () => renderTable(result.elements as unknown as object[], ["id", "name", "href", "isClosed", "isDefault", "isReadonly"]));
    });

  program
    .command("priorities")
    .description("List work package priorities")
    .option("--json", "emit JSON")
    .action(async (options: { json?: boolean }, command: Command) => {
      const result = await createClient(context, command).listPriorities();
      writeOutput(context, result, Boolean(options.json), () => renderTable(result.elements as unknown as object[], ["id", "name", "href", "isDefault", "isActive"]));
    });
}
