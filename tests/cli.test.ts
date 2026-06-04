import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isCliEntrypoint, run } from "../src/cli.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/hal+json" } });
}

function context(fetchImpl: typeof fetch) {
  let stdout = "";
  let stderr = "";
  return {
    ctx: {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: (text: string) => { stderr += text; return true; } },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    },
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

  it("returns configuration exit code for missing config", async () => {
    let stderr = "";
    const code = await run(["node", "opctl", "me"], {
      stdout: { write: () => true },
      stderr: { write: (text: string) => { stderr += text; return true; } },
      env: {},
      fetchImpl: vi.fn<typeof fetch>(),
    });
    expect(code).toBe(2);
    expect(stderr).toContain("OPENPROJECT_URL");
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
