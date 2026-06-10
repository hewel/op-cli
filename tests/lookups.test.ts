import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/hal+json" } });
}

describe("lookup commands", () => {
  it("types --project alspc renders table with id and href", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      _embedded: { elements: [
        { id: 1, name: "Bug", position: 1, isDefault: false, isMilestone: false, _links: { self: { href: "/api/v3/types/1" } } },
        { id: 4, name: "Feature", position: 2, isDefault: true, isMilestone: false, _links: { self: { href: "/api/v3/types/4" } } },
      ] },
    }));
    const code = await run(["node", "opctl", "types", "--project", "alspc"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/api/v3/projects/alspc/types");
    expect(stdout).toContain("Bug");
    expect(stdout).toContain("Feature");
    expect(stdout).toContain("/api/v3/types/1");
    expect(stdout).toContain("/api/v3/types/4");
  });

  it("types --json emits normalized collection", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      _embedded: { elements: [
        { id: 1, name: "Bug", _links: { self: { href: "/api/v3/types/1" } } },
      ] },
    }));
    const code = await run(["node", "opctl", "types", "--json"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.elements[0]).toMatchObject({ id: 1, name: "Bug", href: "/api/v3/types/1" });
  });

  it("statuses renders table with id and href", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      _embedded: { elements: [
        { id: 1, name: "Open", position: 1, isClosed: false, isDefault: true, isReadonly: false, _links: { self: { href: "/api/v3/statuses/1" } } },
        { id: 2, name: "Closed", position: 2, isClosed: true, isDefault: false, isReadonly: false, _links: { self: { href: "/api/v3/statuses/2" } } },
      ] },
    }));
    const code = await run(["node", "opctl", "statuses"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(stdout).toContain("Open");
    expect(stdout).toContain("Closed");
    expect(stdout).toContain("/api/v3/statuses/1");
    expect(stdout).toContain("/api/v3/statuses/2");
  });

  it("priorities renders table with id and href", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      _embedded: { elements: [
        { id: 1, name: "Low", position: 1, isDefault: false, isActive: true, _links: { self: { href: "/api/v3/priorities/1" } } },
        { id: 2, name: "Normal", position: 2, isDefault: true, isActive: true, _links: { self: { href: "/api/v3/priorities/2" } } },
      ] },
    }));
    const code = await run(["node", "opctl", "priorities"], {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: () => true },
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" },
      fetchImpl,
    });
    expect(code).toBe(0);
    expect(stdout).toContain("Low");
    expect(stdout).toContain("Normal");
    expect(stdout).toContain("/api/v3/priorities/1");
    expect(stdout).toContain("/api/v3/priorities/2");
  });
});
