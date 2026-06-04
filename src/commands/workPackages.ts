import type { Command } from "commander";
import { OpctlError, EXIT_CODES } from "../client/errors.js";
import { stableJson } from "../output/json.js";
import { renderKeyValue } from "../output/text.js";
import { renderTable } from "../output/table.js";
import { createClient, type CommandContext, writeOutput } from "./context.js";

interface SearchOptions {
  readonly json?: boolean;
  readonly project?: string;
  readonly subject?: string;
  readonly assigneeMe?: boolean;
  readonly status?: string;
  readonly pageSize?: number;
}

export function registerWorkPackages(program: Command, context: CommandContext): void {
  const wp = program.command("wp").description("Work package commands");

  wp.command("get")
    .description("Get one work package")
    .argument("<id>", "work package id")
    .option("--json", "emit normalized JSON")
    .option("--raw-json", "emit raw OpenProject JSON")
    .action(async (id: string, options: { json?: boolean; rawJson?: boolean }) => {
      const numericId = parseId(id);
      const client = createClient(context);
      if (options.rawJson) {
        context.stdout.write(stableJson(await client.getWorkPackageRaw(numericId), context.env.OPENPROJECT_TOKEN));
        return;
      }
      const workPackage = await client.getWorkPackage(numericId);
      writeOutput(context, workPackage, Boolean(options.json), () => renderKeyValue(workPackage as unknown as Record<string, unknown>));
    });

  wp.command("search")
    .description("Search work packages")
    .option("--json", "emit JSON")
    .option("--project <identifier-or-id>", "project identifier or id")
    .option("--subject <text>", "subject contains text")
    .option("--assignee-me", "filter to current user")
    .option("--status <id-or-open>", "status id, or open")
    .option("--page-size <n>", "page size", Number)
    .action(async (options: SearchOptions) => {
      const result = await createClient(context).searchWorkPackages(options);
      writeOutput(context, result, Boolean(options.json), () => renderTable(result.elements, ["id", "subject", "status", "assignee", "project", "href"]));
    });

  wp.command("mine")
    .description("List open work packages assigned to the authenticated user")
    .option("--json", "emit JSON")
    .option("--project <identifier-or-id>", "project identifier or id")
    .option("--page-size <n>", "page size", Number)
    .action(async (options: Pick<SearchOptions, "json" | "project" | "pageSize">) => {
      const result = await createClient(context).mine(options);
      writeOutput(context, result, Boolean(options.json), () => renderTable(result.elements, ["id", "subject", "status", "assignee", "project", "href"]));
    });

  wp.command("comment")
    .description("Add a comment to a work package; requires OPENPROJECT_ALLOW_WRITE=1")
    .argument("<id>", "work package id")
    .argument("<message>", "comment message")
    .option("--dry-run", "print intended mutation without posting")
    .option("--json", "emit JSON")
    .action(async (id: string, message: string, options: { dryRun?: boolean; json?: boolean }) => {
      const result = await createClient(context).commentWorkPackage(parseId(id), message, Boolean(options.dryRun));
      writeOutput(context, result, Boolean(options.json), () => renderKeyValue(result as unknown as Record<string, unknown>));
    });
}

function parseId(id: string): number {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed < 1) throw new OpctlError("work package id must be a positive integer", EXIT_CODES.validation);
  return parsed;
}
