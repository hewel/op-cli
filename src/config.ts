import { ConfigurationError } from "./client/errors.js";

export type AuthMode = "bearer" | "basic";

export interface OpctlConfig {
  readonly baseUrl: string;
  readonly token: string;
  readonly authMode: AuthMode;
  readonly allowWrite: boolean;
  readonly defaultProject?: string;
}

export interface EnvReader {
  readonly OPENPROJECT_URL?: string;
  readonly OPENPROJECT_TOKEN?: string;
  readonly OPENPROJECT_AUTH_MODE?: string;
  readonly OPENPROJECT_ALLOW_WRITE?: string;
  readonly OPENPROJECT_DEFAULT_PROJECT?: string;
}

export function loadConfig(env: EnvReader = process.env): OpctlConfig {
  const rawUrl = env.OPENPROJECT_URL;
  const rawToken = env.OPENPROJECT_TOKEN;
  if (!rawUrl || rawUrl.trim() === "") throw new ConfigurationError("OPENPROJECT_URL is required");
  if (!rawToken || rawToken.trim() === "") throw new ConfigurationError("OPENPROJECT_TOKEN is required");

  const authMode = parseAuthMode(env.OPENPROJECT_AUTH_MODE);
  const defaultProject = cleanOptional(env.OPENPROJECT_DEFAULT_PROJECT);
  return {
    baseUrl: normalizeBaseUrl(rawUrl),
    token: rawToken,
    authMode,
    allowWrite: env.OPENPROJECT_ALLOW_WRITE === "1",
    ...(defaultProject ? { defaultProject } : {}),
  };
}

export function normalizeBaseUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new ConfigurationError("OPENPROJECT_URL must be an absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ConfigurationError("OPENPROJECT_URL must use http or https");
  }
  parsed.hash = "";
  parsed.search = "";
  const withoutTrailing = parsed.toString().replace(/\/+$/, "");
  return withoutTrailing;
}

function parseAuthMode(raw: string | undefined): AuthMode {
  if (!raw || raw.trim() === "") return "bearer";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "bearer" || normalized === "basic") return normalized;
  throw new ConfigurationError("OPENPROJECT_AUTH_MODE must be bearer or basic");
}

function cleanOptional(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  return value === "" ? undefined : value;
}
