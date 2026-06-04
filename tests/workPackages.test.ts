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
});
