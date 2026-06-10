import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/hal+json" } });
}

describe("work package commands", () => {
  it("wp get normalizes output", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 3, subject: "Repair", _links: { status: { title: "Open" }, self: { href: "/api/v3/work_packages/3" } } }));
    const code = await run(["node", "opctl", "wp", "get", "3", "--json"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ id: 3, subject: "Repair", status: "Open" });
  });

  it("wp get returns batch JSON array in requested order", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 1, subject: "One", _links: { status: { title: "Open" } } }))
      .mockResolvedValueOnce(jsonResponse({ id: 2, subject: "Two", _links: { status: { title: "Closed" } } }));
    const code = await run(["node", "opctl", "wp", "get", "1", "2", "--json"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout).map((row: { id: number }) => row.id)).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("wp get renders selected table fields from --ids", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 1, subject: "One", _links: { status: { title: "Open" }, assignee: { title: "Ada" } } }))
      .mockResolvedValueOnce(jsonResponse({ id: 2, subject: "Two", _links: { status: { title: "Closed" }, assignee: { title: "Grace" } } }));
    const code = await run(["node", "opctl", "wp", "get", "--ids", "1,2", "--fields", "id,subject,status", "--table"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(stdout).toContain("id");
    expect(stdout).toContain("subject");
    expect(stdout).not.toContain("assignee");
  });

  it("wp get emits JSONL", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 1, subject: "One" }))
      .mockResolvedValueOnce(jsonResponse({ id: 2, subject: "Two" }));
    const code = await run(["node", "opctl", "wp", "get", "--ids", "1,2", "--jsonl"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(stdout.trim().split("\n").map((line) => JSON.parse(line).id)).toEqual([1, 2]);
  });

  it("invalid ids, fields, and output conflicts exit validation", async () => {
    for (const argv of [
      ["node", "opctl", "wp", "get", "abc"],
      ["node", "opctl", "wp", "get", "1", "--fields", "bogus"],
      ["node", "opctl", "wp", "get", "1", "--json", "--table"],
    ]) {
      const code = await run(argv, {
        stdout: { write: () => true },
        stderr: { write: () => true },
        env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
        fetchImpl: vi.fn<typeof fetch>(),
      });
      expect(code).toBe(5);
    }
  });

  it("wp check renders default triage fields with attachment count", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 1, subject: "One", description: { raw: "Investigate this" }, _embedded: { attachments: { elements: [{ id: 7 }] } }, _links: { status: { title: "Open" }, assignee: { title: "Ada" } } }));
    const code = await run(["node", "opctl", "wp", "check", "1"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(stdout).toContain("shortDescription");
    expect(stdout).toContain("attachmentsCount");
    expect(stdout).toContain("1");
  });

  it("wp search uses project scoped endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ _embedded: { elements: [] } }));
    const code = await run(["node", "opctl", "wp", "search", "--project", "ops", "--subject", "pump"], {
      stdout: { write: () => true },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/api/v3/projects/ops/work_packages");
  });

  it("wp search compact and mine table use selected fields", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [{ id: 1, subject: "Ask Navlin", updatedAt: "now", _links: { status: { title: "Open" }, assignee: { title: "Ada" } } }] } }))
      .mockResolvedValueOnce(jsonResponse({ id: 9, name: "Me" }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [{ id: 2, subject: "Mine", _links: { status: { title: "Open" } } }] } }));
    let code = await run(["node", "opctl", "wp", "search", "--subject", "Ask Navlin", "--compact"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(stdout).toContain("updatedAt");
    stdout = "";
    code = await run(["node", "opctl", "wp", "mine", "--table", "--fields", "id,subject,status"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(stdout).toContain("subject");
    expect(stdout).not.toContain("assignee");
  });

  it("comment accepts dry-run message after the option", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 1, subject: "S", _links: { addComment: { href: "/activities", method: "post" } } }));
    const code = await run(["node", "opctl", "wp", "comment", "1", "--dry-run", "message"], {
      stdout: { write: () => true },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret", OPENPROJECT_ALLOW_WRITE: "1" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("wp create --template user-story prints template without config", async () => {
    let stdout = "";
    const code = await run(["node", "opctl", "wp", "create", "--template", "user-story"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: {},
    });
    expect(code).toBe(0);
    expect(stdout).toContain("# User story");
    expect(stdout).toContain("As a <user>");
    expect(stdout).toContain("## Acceptance criteria");
  });

  it("wp create without OPENPROJECT_ALLOW_WRITE exits 6", async () => {
    let stderr = "";
    const fetchImpl = vi.fn<typeof fetch>();
    const code = await run(["node", "opctl", "wp", "create", "--project", "alspc", "--type", "Feature", "--subject", "S"], {
      stdout: { write: () => true },
      stderr: { write: (text: string) => { stderr += text; return true; } },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(6);
    expect(stderr).toContain("write blocked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("wp create --dry-run --json reads description file and prints JSON", async () => {
    const tmpDir = join(tmpdir(), "opctl-test-desc-file");
    mkdirSync(tmpDir, { recursive: true });
    const filePath = join(tmpDir, "ticket.md");
    writeFileSync(filePath, "Body from file\n", "utf-8");
    try {
      let stdout = "";
      const fetchImpl = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
          { id: 4, name: "Feature", _links: { self: { href: "/api/v3/types/4" } } },
        ] } }))
        .mockResolvedValueOnce(jsonResponse({ _embedded: { validationErrors: {} } }));
      const code = await run(["node", "opctl", "wp", "create", "--project", "alspc", "--type", "Feature", "--subject", "Improve Ask NAVLIN Explore messaging experience", "--description-file", filePath, "--dry-run", "--json"], {
        stdout: { write: (text: string) => { stdout += text; return true; } },
        stderr: { write: () => true },
        env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret", OPENPROJECT_ALLOW_WRITE: "1" },
        fetchImpl,
        cwd: tmpDir,
      });
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.status).toBe("dry-run");
      expect(parsed.request.method).toBe("POST");
      expect(parsed.request.path).toBe("/api/v3/work_packages");
      expect(parsed.request.payload._links.project.href).toBe("/api/v3/projects/alspc");
      expect(parsed.request.payload._links.type.href).toBe("/api/v3/types/4");
      expect(parsed.request.payload.description.raw).toBe("Body from file\n");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("wp create real create includes browserUrl in output", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 4, name: "Feature", _links: { self: { href: "/api/v3/types/4" } } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { validationErrors: {} } }))
      .mockResolvedValueOnce(jsonResponse({
        id: 42, subject: "S",
        _links: { self: { href: "/api/v3/work_packages/42" }, status: { title: "Open" } },
      }));
    const code = await run(["node", "opctl", "wp", "create", "--project", "alspc", "--type", "Feature", "--subject", "S", "--json"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret", OPENPROJECT_ALLOW_WRITE: "1" },
      fetchImpl,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("created");
    expect(parsed.browserUrl).toBe("https://op.example/work_packages/42");
  });

  it("wp create real create includes browserUrl in text output", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 4, name: "Feature", _links: { self: { href: "/api/v3/types/4" } } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { validationErrors: {} } }))
      .mockResolvedValueOnce(jsonResponse({
        id: 42, subject: "Test subject",
        _links: { self: { href: "/api/v3/work_packages/42" }, status: { title: "Open" } },
      }));
    const code = await run(["node", "opctl", "wp", "create", "--project", "alspc", "--type", "Feature", "--subject", "Test subject"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret", OPENPROJECT_ALLOW_WRITE: "1" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(stdout).toContain("browserUrl: https://op.example/work_packages/42");
    expect(stdout).toContain("status: created");
  });

  it("wp create reads stdin for description", async () => {
    let stdout = "";
    const stdinContent = "stdin description\n";
    async function* stdinGen(): AsyncGenerator<string> {
      yield stdinContent;
    }
    const stdin = Object.assign(stdinGen(), { isTTY: false });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 4, name: "Feature", _links: { self: { href: "/api/v3/types/4" } } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { validationErrors: {} } }));
    const code = await run(["node", "opctl", "wp", "create", "--project", "alspc", "--type", "Feature", "--subject", "S", "--dry-run", "--json"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret", OPENPROJECT_ALLOW_WRITE: "1" },
      fetchImpl,
      stdin,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.request.payload.description.raw).toBe("stdin description\n");
  });

  it("wp create --template combined with --description fails validation", async () => {
    let stderr = "";
    const code = await run(["node", "opctl", "wp", "create", "--template", "user-story", "--description", "text", "--project", "p", "--type", "T", "--subject", "S"], {
      stdout: { write: () => true },
      stderr: { write: (text: string) => { stderr += text; return true; } },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret", OPENPROJECT_ALLOW_WRITE: "1" },
    });
    expect(code).toBe(5);
    expect(stderr).toContain("--template cannot be combined");
  });

  it("wp create with unknown template fails validation", async () => {
    let stderr = "";
    const code = await run(["node", "opctl", "wp", "create", "--template", "epic"], {
      stdout: { write: () => true },
      stderr: { write: (text: string) => { stderr += text; return true; } },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
    });
    expect(code).toBe(5);
    expect(stderr).toContain("unknown template 'epic'");
    expect(stderr).toContain("Supported templates: user-story");
  });
});
