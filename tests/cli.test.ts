import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isCliEntrypoint, run } from "../src/cli.js";
import type { CommandContext } from "../src/commands/context.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/hal+json" } });
}

function context(fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" }, cwd?: string): { readonly ctx: CommandContext; readonly output: () => { readonly stdout: string; readonly stderr: string } } {
  let stdout = "";
  let stderr = "";
  const ctx: CommandContext = {
    stdout: { write: (text: string) => { stdout += text; return true; } },
    stderr: { write: (text: string) => { stderr += text; return true; } },
    env,
    ...(cwd ? { cwd } : {}),
    fetchImpl,
  };
  return {
    ctx,
    output: () => ({ stdout, stderr }),
  };
}

describe("CLI", () => {
  it("me --json emits valid JSON", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 5, name: "Ada", login: "ada", _links: { self: { href: "/api/v3/users/5" } } }));
    const harness = context(fetchImpl);
    await expect(run(["node", "opctl", "me", "--json"], harness.ctx)).resolves.toBe(0);
    expect(JSON.parse(harness.output().stdout)).toMatchObject({ id: 5, login: "ada" });
  });

  it("projects command renders table", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ total: 1, _embedded: { elements: [{ id: 1, identifier: "p", name: "Project", _links: { self: { href: "/api/v3/projects/1" } } }] } }));
    const harness = context(fetchImpl);
    await expect(run(["node", "opctl", "projects"], harness.ctx)).resolves.toBe(0);
    expect(harness.output().stdout).toContain("identifier");
    expect(harness.output().stdout).toContain("Project");
  });

  it("write blocked error exits 6 without leaking token", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const harness = context(fetchImpl);
    await expect(run(["node", "opctl", "wp", "comment", "1", "hello"], harness.ctx)).resolves.toBe(6);
    expect(harness.output().stderr).toContain("write blocked");
    expect(harness.output().stderr).not.toContain("secret");
  });

  it("JSON error output includes details when present", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const harness = context(fetchImpl);
    const code = await run(["node", "opctl", "wp", "create", "--project", "p", "--type", "T", "--subject", "S", "--dry-run", "--json"], harness.ctx);
    expect(code).toBe(6);
    const stderr = harness.output().stderr;
    expect(stderr).toContain("write blocked");
    // JSON output should not leak the token
    expect(stderr).not.toContain("secret");
  });

  it("returns configuration exit code for missing config", async () => {
    let stderr = "";
    const code = await run(["node", "opctl", "--no-env", "me"], {
      stdout: { write: () => true },
      stderr: { write: (text: string) => { stderr += text; return true; } },
      env: {},
      fetchImpl: vi.fn<typeof fetch>(),
    });
    expect(code).toBe(2);
    expect(stderr).toContain("OPENPROJECT_URL");
  });

  it("global --env and --profile wire through commands", async () => {
    const dir = join(tmpdir(), `opctl-cli-${process.pid}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    const envPath = join(dir, "op.env");
    writeFileSync(envPath, "OPENPROJECT_URL=https://env.example\nOPENPROJECT_TOKEN=env-secret\n", "utf8");
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ id: 5, name: "Ada" }));
    const h1 = context(fetchImpl, {});
    await expect(run(["node", "opctl", "--env", envPath, "me", "--json"], h1.ctx)).resolves.toBe(0);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("https://env.example/api/v3/users/me");

    const xdg = join(dir, "xdg");
    const h2 = context(fetchImpl, { XDG_CONFIG_HOME: xdg });
    await expect(run(["node", "opctl", "profile", "set", "qa", "--url", "https://profile.example", "--token", "profile-secret"], h2.ctx)).resolves.toBe(0);
    await expect(run(["node", "opctl", "--profile", "qa", "me", "--json"], h2.ctx)).resolves.toBe(0);
    expect(String(fetchImpl.mock.calls.at(-1)?.[0])).toContain("https://profile.example/api/v3/users/me");
  });

  it("--no-env disables automatic cwd .env loading", async () => {
    const dir = join(tmpdir(), `opctl-cli-noenv-${process.pid}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".env"), "OPENPROJECT_URL=https://auto.example\nOPENPROJECT_TOKEN=auto-secret\n", "utf8");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 5 }));
    const h = context(fetchImpl, {}, dir);
    await expect(run(["node", "opctl", "me", "--json"], h.ctx)).resolves.toBe(0);
    await expect(run(["node", "opctl", "--no-env", "me", "--json"], h.ctx)).resolves.toBe(2);
  });

  it("detects symlinked npm bin entrypoints", () => {
    const dir = join(tmpdir(), `opctl-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, "cli.js");
    const link = join(dir, "opctl");
    writeFileSync(target, "", "utf8");
    try {
      symlinkSync(target, link);
    } catch {
      // Symlink can already exist if a prior interrupted run reused the same pid.
    }
    expect(isCliEntrypoint(`file://${target}`, link)).toBe(true);
  });
});
