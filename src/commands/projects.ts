import type { Command } from "commander";
import { renderTable } from "../output/table.js";
import { createClient, type CommandContext, writeOutput } from "./context.js";

export function registerProjects(program: Command, context: CommandContext): void {
  program
    .command("projects")
    .description("List visible OpenProject projects")
    .option("--json", "emit JSON")
    .option("--page-size <n>", "page size", Number)
    .action(async (options: { json?: boolean; pageSize?: number }) => {
      const projects = await createClient(context).listProjects(options.pageSize === undefined ? {} : { pageSize: options.pageSize });
      writeOutput(context, projects, Boolean(options.json), () => renderTable(projects.elements, ["id", "identifier", "name", "href"]));
    });
}
