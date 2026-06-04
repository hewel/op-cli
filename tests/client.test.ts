import { describe, expect, it, vi } from "vitest";
import { OpenProjectClient, buildWorkPackageFilters } from "../src/client/openProjectClient.js";
import { OpenProjectHttpError, WriteBlockedError } from "../src/client/errors.js";
import type { OpctlConfig } from "../src/config.js";

function config(overrides: Partial<OpctlConfig> = {}): OpctlConfig {
  return { baseUrl: "https://op.example/base", token: "secret", authMode: "bearer", allowWrite: false, ...overrides };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/hal+json" } });
}

describe("OpenProjectClient", () => {
  it("maps me and list projects", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 5, name: "Ada", login: "ada", email: "ada@example", _links: { self: { href: "/api/v3/users/5" } } }))
      .mockResolvedValueOnce(jsonResponse({ total: 1, _embedded: { elements: [{ id: 9, identifier: "ops", name: "Operations", _links: { self: { href: "/api/v3/projects/9" } } }] } }));
    const client = new OpenProjectClient({ config: config(), fetchImpl });
    expect(await client.getMe()).toMatchObject({ id: 5, login: "ada", href: "/api/v3/users/5" });
    expect((await client.listProjects({ pageSize: 10 })).elements[0]).toMatchObject({ id: 9, identifier: "ops" });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer secret" });
  });

  it("normalizes work package get", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 1, subject: "S", _links: { status: { title: "Open" }, self: { href: "/api/v3/work_packages/1" } } }));
    await expect(new OpenProjectClient({ config: config(), fetchImpl }).getWorkPackage(1)).resolves.toMatchObject({ id: 1, subject: "S", status: "Open" });
  });

  it("normalizes updated time, short description, and attachment count", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      id: 1,
      subject: "S",
      updatedAt: "2026-06-04T12:00:00Z",
      description: { raw: "First line\n\nSecond line" },
      _embedded: { attachments: { total: 2 } },
      _links: { status: { title: "Open" }, self: { href: "/api/v3/work_packages/1" } },
    }));
    await expect(new OpenProjectClient({ config: config(), fetchImpl }).getWorkPackage(1)).resolves.toMatchObject({ updatedAt: "2026-06-04T12:00:00Z", shortDescription: "First line Second line", attachmentsCount: 2 });
  });

  it("builds search URLs and filters", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ _embedded: { elements: [] } }));
    await new OpenProjectClient({ config: config({ defaultProject: "alpha" }), fetchImpl }).searchWorkPackages({ subject: "pump", assigneeMe: true, status: "open", pageSize: 5 });
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain("/api/v3/projects/alpha/work_packages?");
    expect(decodeURIComponent(url)).toContain('"subject":{"operator":"~","values":["pump"]}');
    expect(buildWorkPackageFilters({ assigneeMe: true, open: true, status: "open" })).toEqual([{ assignee: { operator: "=", values: ["me"] } }, { status: { operator: "o", values: [] } }]);
  });

  it.each([401, 403, 404, 409, 422])("maps HTTP %i to safe errors", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: "bad" }, status));
    await expect(new OpenProjectClient({ config: config(), fetchImpl }).getMe()).rejects.toBeInstanceOf(OpenProjectHttpError);
  });

  it("blocks writes by default", async () => {
    const client = new OpenProjectClient({ config: config(), fetchImpl: vi.fn<typeof fetch>() });
    await expect(client.commentWorkPackage(1, "hello", true)).rejects.toBeInstanceOf(WriteBlockedError);
  });

  it("dry-run comment fetches work package but does not call mutation endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 1, subject: "S", _links: { addComment: { href: "/api/v3/work_packages/1/activities", method: "post" } } }));
    const result = await new OpenProjectClient({ config: config({ allowWrite: true }), fetchImpl }).commentWorkPackage(1, "hello", true);
    expect(result).toMatchObject({ status: "dry-run", request: { method: "POST", path: "/api/v3/work_packages/1/activities", payload: { comment: { raw: "hello" } } } });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
