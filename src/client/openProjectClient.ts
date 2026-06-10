import createClient, { type Client } from "openapi-fetch";
import { createAuthorizationHeader } from "./auth.js";
import { OpenProjectHttpError, NetworkError, WriteBlockedError, OpctlError, EXIT_CODES } from "./errors.js";
import { getLink, normalizePriority, normalizeProject, normalizeStatus, normalizeType, normalizeUser, normalizeWorkPackageDetail, normalizeWorkPackageSummary, requireLinkHref } from "./hal.js";
import { normalizeCollection, normalizePageSize, type NormalizedCollection } from "./pagination.js";
import { apiHrefToBrowserUrl } from "./urls.js";
import type { OpctlConfig } from "../config.js";
import type { paths } from "../generated/openproject.js";
import type { CommentResult, PrioritySummary, ProjectSummary, StatusSummary, TypeSummary, UserSummary, WorkPackageCreateResult, WorkPackageDetail, WorkPackageSummary } from "../types/domain.js";

export interface SearchWorkPackagesOptions {
  readonly project?: string;
  readonly subject?: string;
  readonly assigneeMe?: boolean;
  readonly status?: string;
  readonly open?: boolean;
  readonly pageSize?: number;
}

export interface ListTypesOptions {
  readonly project?: string | undefined;
}

export interface CreateWorkPackageOptions {
  readonly project: string;
  readonly type: string;
  readonly subject: string;
  readonly description?: string | undefined;
  readonly status?: string | undefined;
  readonly priority?: string | undefined;
  readonly dryRun: boolean;
}

export interface OpenProjectClientOptions {
  readonly config: OpctlConfig;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export class OpenProjectClient {
  private readonly config: OpctlConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly typedClient: Client<paths>;

  public constructor(options: OpenProjectClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.typedClient = createClient<paths>({ baseUrl: `${this.config.baseUrl}/api/v3` });
    void this.typedClient;
  }

  public async getApiRoot(): Promise<unknown> {
    return this.request("GET", "/api/v3");
  }

  public async getMe(): Promise<UserSummary> {
    return normalizeUser(await this.request("GET", "/api/v3/users/me"));
  }

  public async listProjects(options: { readonly pageSize?: number } = {}): Promise<NormalizedCollection<ProjectSummary>> {
    const params = new URLSearchParams({ pageSize: String(normalizePageSize(options.pageSize)) });
    return normalizeCollection(await this.request("GET", `/api/v3/projects?${params}`), normalizeProject);
  }

  public async getWorkPackageRaw(id: number): Promise<unknown> {
    return this.request("GET", `/api/v3/work_packages/${encodeURIComponent(String(id))}`);
  }

  public async getWorkPackage(id: number): Promise<WorkPackageDetail> {
    const detail = normalizeWorkPackageDetail(await this.getWorkPackageRaw(id));
    return { ...detail, browserUrl: apiHrefToBrowserUrl(this.config.baseUrl, detail.href) };
  }

  public async searchWorkPackages(options: SearchWorkPackagesOptions): Promise<NormalizedCollection<WorkPackageSummary>> {
    const effectiveProject = options.project ?? this.config.defaultProject;
    const basePath = effectiveProject
      ? `/api/v3/projects/${encodeURIComponent(effectiveProject)}/work_packages`
      : "/api/v3/work_packages";
    const params = new URLSearchParams({ pageSize: String(normalizePageSize(options.pageSize)) });
    const filters = buildWorkPackageFilters(options);
    if (filters.length > 0) params.set("filters", JSON.stringify(filters));
    const baseUrl = this.config.baseUrl;
    return normalizeCollection(await this.request("GET", `${basePath}?${params}`), (raw) => {
      const wp = normalizeWorkPackageSummary(raw);
      return { ...wp, browserUrl: apiHrefToBrowserUrl(baseUrl, wp.href) };
    });
  }

  public async mine(options: Omit<SearchWorkPackagesOptions, "assigneeMe" | "open">): Promise<NormalizedCollection<WorkPackageSummary>> {
    await this.getMe();
    return this.searchWorkPackages({ ...options, assigneeMe: true, open: true });
  }

  public async commentWorkPackage(id: number, message: string, dryRun: boolean): Promise<CommentResult> {
    if (!this.config.allowWrite) throw new WriteBlockedError();
    if (message.trim() === "") throw new OpctlError("comment message must not be empty", EXIT_CODES.validation);
    const raw = await this.getWorkPackageRaw(id);
    const detail = normalizeWorkPackageDetail(raw);
    const commentHref = findCommentHref(raw);
    if (!commentHref) {
      throw new OpctlError("commenting this work package is unsupported by the current OpenProject response/spec; no documented comment action link was found", EXIT_CODES.validation);
    }
    const payload = { comment: { raw: message } };
    if (dryRun) {
      return { id, subject: detail.subject, status: "dry-run", request: { method: "POST", path: commentHref, payload } };
    }
    const response = await this.request("POST", commentHref, payload);
    return { id, subject: detail.subject, status: "comment posted", link: getLink(response, "self")?.href ?? requireLinkHref(raw, "self") };
  }

  public async listTypes(options: ListTypesOptions = {}): Promise<NormalizedCollection<TypeSummary>> {
    const path = options.project
      ? `/api/v3/projects/${encodeURIComponent(options.project)}/types`
      : "/api/v3/types";
    return normalizeCollection(await this.request("GET", path), normalizeType);
  }

  public async listStatuses(): Promise<NormalizedCollection<StatusSummary>> {
    return normalizeCollection(await this.request("GET", "/api/v3/statuses"), normalizeStatus);
  }

  public async listPriorities(): Promise<NormalizedCollection<PrioritySummary>> {
    return normalizeCollection(await this.request("GET", "/api/v3/priorities"), normalizePriority);
  }

  public async createWorkPackage(options: CreateWorkPackageOptions): Promise<WorkPackageCreateResult> {
    if (!this.config.allowWrite) throw new WriteBlockedError();

    const project = options.project.trim();
    const subject = options.subject.trim();
    if (!project) throw new OpctlError("project must not be empty", EXIT_CODES.validation);
    if (!options.type || !options.type.trim()) throw new OpctlError("type must not be empty", EXIT_CODES.validation);
    if (!subject) throw new OpctlError("subject must not be empty", EXIT_CODES.validation);

    const typeCollection = await this.listTypes({ project });
    const resolvedTypeHref = resolveResourceHref("type", options.type, typeCollection.elements, "opctl types [--project <project>]");

    let resolvedStatusHref: string | undefined;
    if (options.status && options.status.trim()) {
      const statusCollection = await this.listStatuses();
      resolvedStatusHref = resolveResourceHref("status", options.status, statusCollection.elements, "opctl statuses");
    }

    let resolvedPriorityHref: string | undefined;
    if (options.priority && options.priority.trim()) {
      const priorityCollection = await this.listPriorities();
      resolvedPriorityHref = resolveResourceHref("priority", options.priority, priorityCollection.elements, "opctl priorities");
    }

    const payload = {
      subject,
      ...(options.description !== undefined ? { description: { format: "markdown", raw: options.description } } : {}),
      _links: {
        project: { href: `/api/v3/projects/${project}` },
        type: { href: resolvedTypeHref },
        ...(resolvedStatusHref ? { status: { href: resolvedStatusHref } } : {}),
        ...(resolvedPriorityHref ? { priority: { href: resolvedPriorityHref } } : {}),
      },
    };

    const form = await this.request("POST", "/api/v3/work_packages/form", payload);
    const validationErrors = extractFormValidationErrors(form);
    const errorKeys = Object.keys(validationErrors);
    if (errorKeys.length > 0) {
      const formatted = errorKeys.map((key) => `${key}: ${validationErrors[key]}`).join("; ");
      throw new OpctlError(`work package create validation failed: ${formatted}`, EXIT_CODES.validation, validationErrors);
    }

    if (options.dryRun) {
      return { subject, status: "dry-run", request: { method: "POST", path: "/api/v3/work_packages", payload } };
    }

    const created = await this.request("POST", "/api/v3/work_packages", payload);
    const detail = normalizeWorkPackageDetail(created);
    return {
      id: detail.id,
      subject: detail.subject,
      status: "created",
      href: detail.href,
      browserUrl: apiHrefToBrowserUrl(this.config.baseUrl, detail.href),
    };
  }

  private async request(method: "GET" | "POST" | "PATCH", pathOrHref: string, body?: unknown): Promise<unknown> {
    const url = pathOrHref.startsWith("http://") || pathOrHref.startsWith("https://")
      ? pathOrHref
      : `${this.config.baseUrl}${pathOrHref.startsWith("/") ? "" : "/"}${pathOrHref}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: {
          Accept: "application/hal+json, application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          Authorization: createAuthorizationHeader(this.config.authMode, this.config.token),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const parsed = await parseResponse(response);
      if (!response.ok) throw new OpenProjectHttpError(response.status, parsed);
      return parsed;
    } catch (error) {
      if (error instanceof OpenProjectHttpError || error instanceof OpctlError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new NetworkError("OpenProject request timed out");
      throw new NetworkError(error instanceof Error ? error.message : "OpenProject network request failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildWorkPackageFilters(options: Pick<SearchWorkPackagesOptions, "subject" | "assigneeMe" | "status" | "open">): unknown[] {
  const filters: unknown[] = [];
  if (options.subject && options.subject.trim() !== "") filters.push({ subject: { operator: "~", values: [options.subject] } });
  if (options.assigneeMe) filters.push({ assignee: { operator: "=", values: ["me"] } });
  const status = options.status?.trim();
  if (options.open || status === "open") filters.push({ status: { operator: "o", values: [] } });
  else if (status) filters.push({ status: { operator: "=", values: [status] } });
  return filters;
}

function findCommentHref(resource: unknown): string | undefined {
  for (const name of ["addComment", "addCommentImmediately", "comment", "addWorkPackageComment"]) {
    const link = getLink(resource, name);
    if (link?.href && (!link.method || link.method.toUpperCase() === "POST")) return link.href;
  }
  return undefined;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (text.trim() === "") return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json") || contentType.includes("hal")) {
    try {
      return JSON.parse(text);
    } catch {
      return { message: "OpenProject returned invalid JSON" };
    }
  }
  return { message: text };
}

function resolveResourceHref(kind: string, raw: string, collection: readonly { readonly name?: string | undefined; readonly href?: string | undefined; readonly id?: number | undefined }[], commandHint: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new OpctlError(`${kind} must not be empty`, EXIT_CODES.validation);
  if (trimmed.startsWith("/api/v3/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (/^\d+$/.test(trimmed)) {
    const apiPrefix = kind === "type" ? "/api/v3/types" : kind === "status" ? "/api/v3/statuses" : "/api/v3/priorities";
    return `${apiPrefix}/${trimmed}`;
  }
  const lowerName = trimmed.toLowerCase();
  const matches = collection.filter((item) => item.name?.toLowerCase() === lowerName);
  if (matches.length === 0) throw new OpctlError(`unknown ${kind} '${trimmed}'; run ${commandHint} to list valid values`, EXIT_CODES.validation);
  if (matches.length > 1) {
    const list = matches.map((m) => `${m.name} (${m.href})`).join(", ");
    throw new OpctlError(`ambiguous ${kind} '${trimmed}'; matches: ${list}`, EXIT_CODES.validation);
  }
  return matches[0]!.href!;
}

function extractFormValidationErrors(form: unknown): Record<string, string> {
  const embedded = typeof form === "object" && form !== null ? (form as Record<string, unknown>)._embedded : undefined;
  const raw = typeof embedded === "object" && embedded !== null ? (embedded as Record<string, unknown>).validationErrors : undefined;
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "object" && value !== null && "message" in value && typeof (value as Record<string, unknown>).message === "string") {
      result[key] = (value as Record<string, unknown>).message as string;
    } else {
      result[key] = JSON.stringify(value);
    }
  }
  return result;
}
