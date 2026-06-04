import type { LinkSummary, ProjectSummary, UserSummary, WorkPackageDetail, WorkPackageSummary } from "../types/domain.js";

type HalObject = Record<string, unknown>;

export function asObject(value: unknown): HalObject | undefined {
  return value && typeof value === "object" ? (value as HalObject) : undefined;
}

export function getLink(resource: unknown, name: string): LinkSummary | undefined {
  const object = asObject(resource);
  const links = asObject(object?._links);
  const raw = links?.[name];
  const link = Array.isArray(raw) ? asObject(raw[0]) : asObject(raw);
  if (!link) return undefined;
  const href = typeof link.href === "string" ? link.href : undefined;
  const title = typeof link.title === "string" ? link.title : undefined;
  const method = typeof link.method === "string" ? link.method : undefined;
  if (!href && !title && !method) return undefined;
  return { ...(href ? { href } : {}), ...(title ? { title } : {}), ...(method ? { method } : {}) };
}

export function requireLinkHref(resource: unknown, name: string): string | undefined {
  return getLink(resource, name)?.href;
}

export function collectionElements(resource: unknown): unknown[] {
  const embedded = asObject(asObject(resource)?._embedded);
  const elements = embedded?.elements;
  return Array.isArray(elements) ? elements : [];
}

export function collectionTotal(resource: unknown): number | undefined {
  const total = asObject(resource)?.total;
  return typeof total === "number" ? total : undefined;
}

export function normalizeUser(resource: unknown): UserSummary {
  const object = asObject(resource) ?? {};
  return {
    id: numberField(object.id),
    name: stringField(object.name),
    login: stringField(object.login),
    email: stringField(object.email),
    href: getLink(object, "self")?.href,
  };
}

export function normalizeProject(resource: unknown): ProjectSummary {
  const object = asObject(resource) ?? {};
  return {
    id: numberField(object.id),
    identifier: stringField(object.identifier),
    name: stringField(object.name),
    href: getLink(object, "self")?.href,
  };
}

export function normalizeWorkPackageSummary(resource: unknown): WorkPackageSummary {
  const object = asObject(resource) ?? {};
  return {
    id: numberField(object.id),
    subject: stringField(object.subject),
    status: getLink(object, "status")?.title,
    assignee: getLink(object, "assignee")?.title,
    project: getLink(object, "project")?.title,
    type: getLink(object, "type")?.title,
    href: getLink(object, "self")?.href,
  };
}

export function normalizeWorkPackageDetail(resource: unknown): WorkPackageDetail {
  const object = asObject(resource) ?? {};
  return {
    ...normalizeWorkPackageSummary(object),
    description: extractDescription(object.description),
    lockVersion: numberField(object.lockVersion),
    actions: actionLinks(object),
  };
}

export function actionLinks(resource: unknown): Record<string, LinkSummary> {
  const links = asObject(asObject(resource)?._links) ?? {};
  const actions: Record<string, LinkSummary> = {};
  for (const [name, value] of Object.entries(links)) {
    const link = Array.isArray(value) ? asObject(value[0]) : asObject(value);
    if (!link) continue;
    const method = typeof link.method === "string" ? link.method : undefined;
    if (!method && !name.startsWith("add") && !name.includes("update") && !name.includes("delete")) continue;
    const summary = getLink(resource, name);
    if (summary) actions[name] = summary;
  }
  return actions;
}

export function extractDescription(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const object = asObject(value);
  const raw = typeof object?.raw === "string" ? object.raw : undefined;
  const html = typeof object?.html === "string" ? object.html : undefined;
  return raw ?? (html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : undefined);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
