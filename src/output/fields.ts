import { OpctlError, EXIT_CODES } from "../client/errors.js";

export type WorkPackageField = "id" | "subject" | "status" | "type" | "assignee" | "project" | "href" | "browserUrl" | "updatedAt" | "description" | "shortDescription" | "attachmentsCount" | "lockVersion" | "priority";
export type OutputMode = "text" | "table" | "compact" | "json" | "jsonl" | "rawJson";

export const DEFAULT_COMPACT_FIELDS: readonly WorkPackageField[] = ["id", "subject", "status", "assignee", "updatedAt"];
export const DEFAULT_TABLE_FIELDS: readonly WorkPackageField[] = ["id", "subject", "status", "assignee", "project", "updatedAt"];
export const DEFAULT_CHECK_FIELDS: readonly WorkPackageField[] = ["id", "subject", "status", "assignee", "shortDescription", "attachmentsCount"];
export const DETAIL_FIELDS: readonly WorkPackageField[] = ["id", "subject", "status", "type", "assignee", "project", "href", "browserUrl", "updatedAt", "description", "shortDescription", "attachmentsCount", "lockVersion"];

const SUPPORTED_FIELDS: Record<WorkPackageField, true> = {
  assignee: true,
  attachmentsCount: true,
  browserUrl: true,
  description: true,
  href: true,
  id: true,
  lockVersion: true,
  priority: true,
  project: true,
  shortDescription: true,
  status: true,
  subject: true,
  type: true,
  updatedAt: true,
};

const FIELD_ALIASES: Record<string, WorkPackageField> = {
  title: "subject",
  url: "href",
};

export interface OutputFlagOptions {
  readonly json?: boolean;
  readonly jsonl?: boolean;
  readonly table?: boolean;
  readonly compact?: boolean;
  readonly rawJson?: boolean;
}

export function parseOutputMode(options: OutputFlagOptions): OutputMode {
  const enabled = [options.json, options.jsonl, options.table, options.compact, options.rawJson].filter(Boolean).length;
  if (enabled > 1) throw new OpctlError("choose only one output mode flag", EXIT_CODES.validation);
  if (options.rawJson) return "rawJson";
  if (options.json) return "json";
  if (options.jsonl) return "jsonl";
  if (options.compact) return "compact";
  if (options.table) return "table";
  return "text";
}

export function parseFields(raw: string | undefined, defaults: readonly WorkPackageField[]): readonly WorkPackageField[] {
  if (!raw || raw.trim() === "") return defaults;
  const fields: WorkPackageField[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const field = FIELD_ALIASES[trimmed] ?? trimmed;
    if (!isSupportedField(field)) throw new OpctlError(`unknown work package field '${trimmed}'. Supported fields: ${Object.keys(SUPPORTED_FIELDS).join(",")}`, EXIT_CODES.validation);
    fields.push(field);
  }
  if (fields.length === 0) throw new OpctlError("--fields must include at least one field", EXIT_CODES.validation);
  return fields;
}

export function projectFields<T extends Record<string, unknown>>(value: T, fields: readonly WorkPackageField[]): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const field of fields) projected[field] = value[field];
  return projected;
}

export function projectRows<T extends Record<string, unknown>>(rows: readonly T[], fields: readonly WorkPackageField[]): Record<string, unknown>[] {
  return rows.map((row) => projectFields(row, fields));
}

function isSupportedField(field: string): field is WorkPackageField {
  return SUPPORTED_FIELDS[field as WorkPackageField] === true;
}
