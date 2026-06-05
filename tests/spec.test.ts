import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { pullOpenApiSpec, PUBLIC_SPEC_BASE } from "../scripts/pull-openapi-spec.js";
import { run } from "../src/cli.js";
import type { CommandContext } from "../src/commands/context.js";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/hal+json" } });
}

function makeContext(fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = {}): { readonly ctx: CommandContext; readonly output: () => { readonly stdout: string; readonly stderr: string } } {
  let stdout = "";
  let stderr = "";
  const ctx: CommandContext = {
    stdout: { write: (text: string) => { stdout += text; return true; } },
    stderr: { write: (text: string) => { stderr += text; return true; } },
    env,
    fetchImpl,
  };
  return { ctx, output: () => ({ stdout, stderr }) };
}

const SPEC_BODY = { openapi: "3.0.0", info: { title: "OpenProject", version: "3" }, paths: {} };
const TMP_DIR = join(tmpdir(), "opctl-spec-test");

describe("spec pull", () => {
  it("defaults to public community spec URL even when OPENPROJECT_URL is set", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(SPEC_BODY));
    await pullOpenApiSpec({
      env: { OPENPROJECT_URL: "https://private.example.com", OPENPROJECT_TOKEN: "secret-token" } as NodeJS.ProcessEnv,
      fetchImpl,
      outputPath: join(TMP_DIR, "default.json"),
    });
    const calledUrl = String(fetchImpl.mock.calls[0]![0]);
    expect(calledUrl).toBe(`${PUBLIC_SPEC_BASE}/api/v3/spec.json`);
    expect(calledUrl).not.toContain("private.example.com");
  });

  it("does not send Authorization from OPENPROJECT_TOKEN by default", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(SPEC_BODY));
    await pullOpenApiSpec({
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret-token" } as NodeJS.ProcessEnv,
      fetchImpl,
      outputPath: join(TMP_DIR, "no-auth.json"),
    });
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBeUndefined();
  });

  it("uses OPENPROJECT_SPEC_URL when set", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(SPEC_BODY));
    await pullOpenApiSpec({
      env: { OPENPROJECT_SPEC_URL: "https://custom.example.com" } as NodeJS.ProcessEnv,
      fetchImpl,
      outputPath: join(TMP_DIR, "spec-url.json"),
    });
    const calledUrl = String(fetchImpl.mock.calls[0]![0]);
    expect(calledUrl).toBe("https://custom.example.com/api/v3/spec.json");
  });

  it("uses explicit sourceBaseUrl option over env", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(SPEC_BODY));
    await pullOpenApiSpec({
      env: { OPENPROJECT_SPEC_URL: "https://env.example.com" } as NodeJS.ProcessEnv,
      fetchImpl,
      sourceBaseUrl: "https://option.example.com",
      outputPath: join(TMP_DIR, "option.json"),
    });
    const calledUrl = String(fetchImpl.mock.calls[0]![0]);
    expect(calledUrl).toBe("https://option.example.com/api/v3/spec.json");
  });

  it("sends Authorization from OPENPROJECT_SPEC_TOKEN only", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(SPEC_BODY));
    await pullOpenApiSpec({
      env: { OPENPROJECT_SPEC_URL: "https://private.example.com", OPENPROJECT_SPEC_TOKEN: "spec-secret", OPENPROJECT_TOKEN: "wrong-token" } as NodeJS.ProcessEnv,
      fetchImpl,
      outputPath: join(TMP_DIR, "spec-auth.json"),
    });
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer spec-secret");
    expect(headers.Authorization).not.toContain("wrong-token");
  });

  it("does not print credentials in stdout", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(SPEC_BODY));
    await pullOpenApiSpec({
      env: { OPENPROJECT_SPEC_URL: "https://op.example", OPENPROJECT_SPEC_TOKEN: "secret-token" } as NodeJS.ProcessEnv,
      fetchImpl,
      outputPath: join(TMP_DIR, "redact.json"),
      stdout: { write: (text: string) => { stdout += text; return true; } },
    });
    expect(stdout).toContain("op.example");
    expect(stdout).not.toContain("secret-token");
  });

  it("CLI spec pull uses public default and ignores OPENPROJECT_URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v3/spec.json")) return Promise.resolve(response(SPEC_BODY));
      return Promise.resolve(jsonResponse({}));
    });
    const harness = makeContext(fetchImpl, {
      OPENPROJECT_URL: "https://private.example.com",
      OPENPROJECT_TOKEN: "secret",
    });
    await expect(run(["node", "opctl", "spec", "pull", "--output", join(TMP_DIR, "cli.json")], harness.ctx)).resolves.toBe(0);
    const specCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes("/api/v3/spec.json"));
    expect(specCall).toBeDefined();
    expect(String(specCall![0])).toContain("community.openproject.org");
    expect(String(specCall![0])).not.toContain("private.example.com");
  });

  it("CLI spec pull --url overrides default", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v3/spec.json")) return Promise.resolve(response(SPEC_BODY));
      return Promise.resolve(jsonResponse({}));
    });
    const harness = makeContext(fetchImpl, {});
    await expect(run(["node", "opctl", "spec", "pull", "--url", "https://custom.example.com", "--output", join(TMP_DIR, "cli-url.json")], harness.ctx)).resolves.toBe(0);
    const specCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes("/api/v3/spec.json"));
    expect(specCall).toBeDefined();
    expect(String(specCall![0])).toContain("custom.example.com");
  });
});

// Setup/cleanup
beforeAll(() => { mkdirSync(TMP_DIR, { recursive: true }); });
afterAll(() => { rmSync(TMP_DIR, { recursive: true, force: true }); });
