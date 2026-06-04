import { ConfigurationError } from "./client/errors.js";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEnvFile } from "./config/envFile.js";
import { getProfileEnv } from "./config/profiles.js";

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

export interface ConfigResolutionOptions {
  readonly cwd?: string;
  readonly envFile?: string;
  readonly autoEnv?: boolean;
  readonly profile?: string;
}

export function loadConfig(env: EnvReader = process.env): OpctlConfig {
  return loadConfigFromEnv(env);
}

export function resolveConfigEnv(processEnv: NodeJS.ProcessEnv, options: ConfigResolutionOptions = {}): EnvReader {
  const cwd = options.cwd ?? process.cwd();
  const autoEnvPath = join(cwd, ".env");
  const autoEnv = options.autoEnv === false || !existsSync(autoEnvPath) ? {} : loadEnvFile(autoEnvPath);
  const activeProfile = options.profile ? {} : getProfileEnv(undefined, processEnv);
  const selectedProfile = options.profile ? getProfileEnv(options.profile, processEnv) : {};
  const explicitEnv = options.envFile ? loadEnvFile(resolve(cwd, options.envFile)) : {};
  return mergeEnv(autoEnv, activeProfile, selectedProfile, explicitEnv, processEnv);
}

export function loadResolvedConfig(processEnv: NodeJS.ProcessEnv, options: ConfigResolutionOptions = {}): OpctlConfig {
  return loadConfigFromEnv(resolveConfigEnv(processEnv, options));
}

export function mergeEnv(...layers: readonly EnvReader[]): EnvReader {
  const merged: Record<string, string> = {};
  for (const layer of layers) {
    for (const key of ["OPENPROJECT_URL", "OPENPROJECT_TOKEN", "OPENPROJECT_AUTH_MODE", "OPENPROJECT_ALLOW_WRITE", "OPENPROJECT_DEFAULT_PROJECT"] as const) {
      const value = layer[key];
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged;
}

function loadConfigFromEnv(env: EnvReader): OpctlConfig {
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
