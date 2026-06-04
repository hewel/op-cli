import { readFileSync } from "node:fs";
import { ConfigurationError } from "../client/errors.js";
import type { EnvReader } from "../config.js";

const ALLOWED_ENV_KEYS: Record<string, true> = {
  OPENPROJECT_AUTH_MODE: true,
  OPENPROJECT_DEFAULT_PROJECT: true,
  OPENPROJECT_TOKEN: true,
  OPENPROJECT_URL: true,
};

export function loadEnvFile(path: string): EnvReader {
  return parseEnvFile(readFileSync(path, "utf8"));
}

export function parseEnvFile(content: string): EnvReader {
  const env: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseLine(lines[index] ?? "", index + 1);
    if (!parsed) continue;
    if (ALLOWED_ENV_KEYS[parsed.key] !== true) continue;
    env[parsed.key] = parsed.value;
  }
  return env;
}

function parseLine(line: string, lineNumber: number): { readonly key: string; readonly value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return undefined;
  const equals = trimmed.indexOf("=");
  if (equals <= 0) throw new ConfigurationError(`invalid .env line ${lineNumber}`);
  const key = trimmed.slice(0, equals).trim();
  if (!/^OPENPROJECT_[A-Z_]+$/.test(key)) return undefined;
  const rawValue = trimmed.slice(equals + 1).trim();
  return { key, value: unquoteValue(rawValue, lineNumber) };
}

function unquoteValue(value: string, lineNumber: number): string {
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length === 1) throw new ConfigurationError(`unterminated quoted value on .env line ${lineNumber}`);
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length === 1) throw new ConfigurationError(`unterminated quoted value on .env line ${lineNumber}`);
    return value.slice(1, -1);
  }
  const hash = value.indexOf(" #");
  return (hash >= 0 ? value.slice(0, hash) : value).trim();
}
