import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createAuthorizationHeader, redactSecrets } from "../src/client/auth.js";
import { OpenApiGenerationError } from "../src/client/errors.js";
import { normalizeBaseUrl, type AuthMode } from "../src/config.js";

export interface PullSpecOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly outputPath?: string;
  readonly timeoutMs?: number;
  readonly stdout?: Pick<typeof process.stdout, "write">;
}

export interface PullSpecResult {
  readonly sourceHost: string;
  readonly outputPath: string;
  readonly title: string;
  readonly version: string;
}

export async function pullOpenApiSpec(options: PullSpecOptions = {}): Promise<PullSpecResult> {
  const env = options.env ?? process.env;
  const outputPath = options.outputPath ?? "openapi/openproject.json";
  const fetchImpl = options.fetchImpl ?? fetch;
  const rawUrl = env.OPENPROJECT_URL;
  if (!rawUrl || rawUrl.trim() === "") throw new OpenApiGenerationError("OPENPROJECT_URL is required to pull the OpenProject spec");
  const baseUrl = normalizeBaseUrl(rawUrl);
  const authMode = parseAuthMode(env.OPENPROJECT_AUTH_MODE);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.OPENPROJECT_TOKEN && env.OPENPROJECT_TOKEN.trim() !== "") {
    headers.Authorization = createAuthorizationHeader(authMode, env.OPENPROJECT_TOKEN);
  }

  const specUrl = `${baseUrl}/api/v3/spec.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await fetchImpl(specUrl, { headers, signal: controller.signal });
  } catch (error) {
    throw new OpenApiGenerationError(`failed to download OpenProject spec from ${new URL(baseUrl).host}: ${error instanceof Error ? redactSecrets(error.message, env.OPENPROJECT_TOKEN) : "network error"}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new OpenApiGenerationError(`failed to download OpenProject spec from ${new URL(baseUrl).host}: HTTP ${response.status}`);
  }

  const text = await response.text();
  let spec: unknown;
  try {
    spec = JSON.parse(text);
  } catch {
    throw new OpenApiGenerationError("OpenProject spec response was not valid JSON; spec.yml is not supported by this downloader");
  }
  if (!spec || typeof spec !== "object") throw new OpenApiGenerationError("OpenProject spec response was not an object");
  const info = "info" in spec && typeof spec.info === "object" && spec.info !== null ? spec.info : undefined;
  const title = info && "title" in info && typeof info.title === "string" ? info.title : "OpenProject API";
  const version = info && "version" in info && typeof info.version === "string" ? info.version : "unknown";

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  const result = { sourceHost: new URL(baseUrl).host, outputPath, title, version };
  options.stdout?.write(`Downloaded OpenProject spec from ${result.sourceHost} to ${result.outputPath} (${result.title} ${result.version})\n`);
  return result;
}

function parseAuthMode(raw: string | undefined): AuthMode {
  const normalized = raw?.trim().toLowerCase() ?? "";
  if (normalized === "" || normalized === "bearer") return "bearer";
  if (normalized === "basic") return "basic";
  throw new OpenApiGenerationError("OPENPROJECT_AUTH_MODE must be bearer or basic");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  pullOpenApiSpec({ stdout: process.stdout }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "failed to pull OpenProject spec";
    process.stderr.write(`${redactSecrets(message, process.env.OPENPROJECT_TOKEN)}\n`);
    process.exitCode = 8;
  });
}
