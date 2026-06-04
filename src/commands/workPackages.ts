import type { Command } from "commander";
import { OpctlError, EXIT_CODES } from "../client/errors.js";
import { stableJson } from "../output/json.js";
import { renderKeyValue } from "../output/text.js";
import { renderTable } from "../output/table.js";
import { DEFAULT_CHECK_FIELDS, DEFAULT_COMPACT_FIELDS, DEFAULT_TABLE_FIELDS, DETAIL_FIELDS, parseFields, parseOutputMode, projectFields, projectRows, type OutputFlagOptions, type WorkPackageField } from "../output/fields.js";
import type { NormalizedCollection } from "../client/pagination.js";
import type { WorkPackageDetail, WorkPackageSummary } from "../types/domain.js";
import { createClient, resolvedEnv, type CommandContext, writeOutput } from "./context.js";

interface SearchOptions extends OutputFlagOptions {
  readonly fields?: string;
  readonly project?: string;
  readonly subject?: string;
  readonly assigneeMe?: boolean;
  readonly status?: string;
  readonly open?: boolean;
  readonly pageSize?: number;
}

interface GetOptions extends OutputFlagOptions {
  readonly ids?: string;
  readonly fields?: string;
}

export function registerWorkPackages(program: Command, context: CommandContext): void {
  const wp = program.command("wp").description("Work package commands");

  wp.command("get")
    .description("Get one or more work packages")
    .argument("[ids...]", "work package ids")
    .option("--ids <csv>", "comma-separated work package ids")
    .option("--fields <csv>", "comma-separated output fields")
    .option("--table", "emit table output")
    .option("--compact", "emit compact triage table output")
    .option("--json", "emit normalized JSON")
    .option("--jsonl", "emit one JSON object per line")
    .option("--raw-json", "emit raw OpenProject JSON; single work package only")
    .action(async (ids: string[], options: GetOptions, command: Command) => {
      const numericIds = parseIds(ids, options.ids);
      if (numericIds.length === 0) throw new OpctlError("at least one work package id is required", EXIT_CODES.validation);
      const mode = parseOutputMode(options);
      if (mode === "rawJson" && numericIds.length !== 1) throw new OpctlError("--raw-json supports exactly one work package id", EXIT_CODES.validation);
      if (mode !== "rawJson") parseFields(options.fields, mode === "compact" ? DEFAULT_COMPACT_FIELDS : DETAIL_FIELDS);
      const client = createClient(context, command);
      const token = resolvedEnv(context, command).OPENPROJECT_TOKEN;
      if (mode === "rawJson") {
        context.stdout.write(stableJson(await client.getWorkPackageRaw(numericIds[0] as number), token));
        return;
      }
      const workPackages: WorkPackageDetail[] = [];
      for (const id of numericIds) workPackages.push(await client.getWorkPackage(id));
      writeWorkPackageOutput(context, workPackages, options, mode, numericIds.length === 1 && !options.ids, DETAIL_FIELDS, token);
    });

  wp.command("check")
    .description("Read a triage-oriented issue list for one or more work packages")
    .argument("[ids...]", "work package ids")
    .option("--ids <csv>", "comma-separated work package ids")
    .option("--fields <csv>", "comma-separated output fields")
    .option("--table", "emit table output")
    .option("--compact", "emit compact table output")
    .option("--json", "emit JSON")
    .option("--jsonl", "emit one JSON object per line")
    .action(async (ids: string[], options: Omit<GetOptions, "rawJson">, command: Command) => {
      const numericIds = parseIds(ids, options.ids);
      if (numericIds.length === 0) throw new OpctlError("at least one work package id is required", EXIT_CODES.validation);
      const mode = parseOutputMode(options);
      parseFields(options.fields, mode === "compact" ? DEFAULT_COMPACT_FIELDS : DEFAULT_CHECK_FIELDS);
      const client = createClient(context, command);
      const workPackages: WorkPackageDetail[] = [];
      for (const id of numericIds) workPackages.push(await client.getWorkPackage(id));
      writeWorkPackageOutput(context, workPackages, options, mode, false, DEFAULT_CHECK_FIELDS, resolvedEnv(context, command).OPENPROJECT_TOKEN);
    });

  wp.command("search")
    .description("Search work packages")
    .option("--json", "emit JSON")
    .option("--jsonl", "emit one JSON object per line")
    .option("--table", "emit table output")
    .option("--compact", "emit compact table output")
    .option("--fields <csv>", "comma-separated output fields")
    .option("--project <identifier-or-id>", "project identifier or id")
    .option("--subject <text>", "subject contains text")
    .option("--assignee-me", "filter to current user")
    .option("--status <id-or-open>", "status id, or open")
    .option("--open", "filter to open work packages")
    .option("--page-size <n>", "page size", Number)
    .action(async (options: SearchOptions, command: Command) => {
      const result = await createClient(context, command).searchWorkPackages(options);
      writeCollectionOutput(context, result, options, resolvedEnv(context, command).OPENPROJECT_TOKEN);
    });

  wp.command("mine")
    .description("List open work packages assigned to the authenticated user")
    .option("--json", "emit JSON")
    .option("--jsonl", "emit one JSON object per line")
    .option("--table", "emit table output")
    .option("--compact", "emit compact table output")
    .option("--fields <csv>", "comma-separated output fields")
    .option("--project <identifier-or-id>", "project identifier or id")
    .option("--open", "filter to open work packages")
    .option("--page-size <n>", "page size", Number)
    .action(async (options: Pick<SearchOptions, "json" | "jsonl" | "table" | "compact" | "fields" | "project" | "open" | "pageSize">, command: Command) => {
      const result = await createClient(context, command).mine(options);
      writeCollectionOutput(context, result, options, resolvedEnv(context, command).OPENPROJECT_TOKEN);
    });

  wp.command("comment")
    .description("Add a comment to a work package; requires OPENPROJECT_ALLOW_WRITE=1")
    .argument("<id>", "work package id")
    .argument("[message...]", "comment message")
    .option("--dry-run", "print intended mutation without posting")
    .option("--json", "emit JSON")
    .action(async (id: string, messageParts: string[], options: { dryRun?: boolean; json?: boolean }, command: Command) => {
      const result = await createClient(context, command).commentWorkPackage(parseId(id), messageParts.join(" "), Boolean(options.dryRun));
      writeOutput(context, result, Boolean(options.json), () => renderKeyValue(result as unknown as Record<string, unknown>), resolvedEnv(context, command).OPENPROJECT_TOKEN);
    });
}

function writeCollectionOutput(context: CommandContext, result: NormalizedCollection<WorkPackageSummary>, options: SearchOptions | Pick<SearchOptions, "json" | "jsonl" | "table" | "compact" | "fields" | "project" | "open" | "pageSize">, token: string | undefined): void {
  const mode = parseOutputMode(options);
  const defaults = mode === "compact" ? DEFAULT_COMPACT_FIELDS : DEFAULT_TABLE_FIELDS;
  const fields = parseFields(options.fields, defaults);
  const elements = projectRows(result.elements as unknown as Record<string, unknown>[], fields);
  if (mode === "jsonl") {
    context.stdout.write(elements.map((element) => JSON.stringify(element)).join("\n") + (elements.length > 0 ? "\n" : ""));
    return;
  }
  if (mode === "json") {
    const output = options.fields ? { ...result, elements } : result;
    context.stdout.write(stableJson(output, token));
    return;
  }
  context.stdout.write(renderTable(elements, fields));
}

function writeWorkPackageOutput(context: CommandContext, workPackages: readonly WorkPackageDetail[], options: GetOptions | Omit<GetOptions, "rawJson">, mode: string, singleObject: boolean, defaultFields: readonly WorkPackageField[], token: string | undefined): void {
  const fields = parseFields(options.fields, mode === "compact" ? DEFAULT_COMPACT_FIELDS : defaultFields);
  const projected = options.fields || mode === "table" || mode === "compact" || mode === "jsonl" ? projectRows(workPackages as unknown as Record<string, unknown>[], fields) : workPackages;
  if (mode === "jsonl") {
    const rows = projectRows(workPackages as unknown as Record<string, unknown>[], fields);
    context.stdout.write(rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : ""));
    return;
  }
  if (mode === "json") {
    context.stdout.write(stableJson(singleObject ? projected[0] : projected, token));
    return;
  }
  if (singleObject && mode === "text" && !options.fields) {
    context.stdout.write(renderKeyValue(workPackages[0] as unknown as Record<string, unknown>));
    return;
  }
  context.stdout.write(renderTable(projectRows(workPackages as unknown as Record<string, unknown>[], fields), fields));
}

function parseIds(positionals: readonly string[], csv: string | undefined): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const raw of [...positionals, ...splitCsv(csv)]) {
    const id = parseId(raw);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function splitCsv(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv.split(",").map((part) => part.trim()).filter((part) => part !== "");
}

function parseId(id: string): number {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed < 1) throw new OpctlError("work package id must be a positive integer", EXIT_CODES.validation);
  return parsed;
}
