import createClient, { type Client } from "openapi-fetch";
import { createAuthorizationHeader } from "./auth.js";
import { OpenProjectHttpError, NetworkError, WriteBlockedError, OpctlError, EXIT_CODES } from "./errors.js";
import { normalizeCollection, normalizePageSize, type NormalizedCollection } from "./pagination.js";
import { getLink, normalizeProject, normalizeUser, normalizeWorkPackageDetail, normalizeWorkPackageSummary, requireLinkHref } from "./hal.js";
import type { OpctlConfig } from "../config.js";
import type { paths } from "../generated/openproject.js";
import type { CommentResult, ProjectSummary, UserSummary, WorkPackageDetail, WorkPackageSummary } from "../types/domain.js";

export interface SearchWorkPackagesOptions {
  readonly project?: string;
  readonly subject?: string;
  readonly assigneeMe?: boolean;
  readonly status?: string;
  readonly open?: boolean;
  readonly pageSize?: number;
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
    return normalizeWorkPackageDetail(await this.getWorkPackageRaw(id));
  }

  public async searchWorkPackages(options: SearchWorkPackagesOptions): Promise<NormalizedCollection<WorkPackageSummary>> {
    const effectiveProject = options.project ?? this.config.defaultProject;
    const basePath = effectiveProject
      ? `/api/v3/projects/${encodeURIComponent(effectiveProject)}/work_packages`
      : "/api/v3/work_packages";
    const params = new URLSearchParams({ pageSize: String(normalizePageSize(options.pageSize)) });
    const filters = buildWorkPackageFilters(options);
    if (filters.length > 0) params.set("filters", JSON.stringify(filters));
    return normalizeCollection(await this.request("GET", `${basePath}?${params}`), normalizeWorkPackageSummary);
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
