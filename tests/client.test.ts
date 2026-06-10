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

  it("getWorkPackage includes browserUrl from self href with instance prefix", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 23732, subject: "S", _links: { status: { title: "Open" }, self: { href: "/openproject/api/v3/work_packages/23732" } } }));
    const result = await new OpenProjectClient({ config: config({ baseUrl: "https://op.example/openproject" }), fetchImpl }).getWorkPackage(23732);
    expect(result.browserUrl).toBe("https://op.example/openproject/work_packages/23732");
  });

  it("getWorkPackage includes browserUrl from plain api href", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 1, subject: "S", _links: { status: { title: "Open" }, self: { href: "/api/v3/work_packages/1" } } }));
    const result = await new OpenProjectClient({ config: config({ baseUrl: "https://op.example" }), fetchImpl }).getWorkPackage(1);
    expect(result.browserUrl).toBe("https://op.example/work_packages/1");
  });

  it("getWorkPackage returns undefined browserUrl when href has no /api/v3/", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 1, subject: "S", _links: { status: { title: "Open" }, self: { href: "/weird/link" } } }));
    const result = await new OpenProjectClient({ config: config(), fetchImpl }).getWorkPackage(1);
    expect(result.browserUrl).toBeUndefined();
  });

  it("listTypes normalizes type collection", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      total: 2,
      _embedded: { elements: [
        { id: 1, name: "Bug", position: 1, isDefault: false, isMilestone: false, _links: { self: { href: "/api/v3/types/1" } } },
        { id: 4, name: "Feature", position: 2, isDefault: true, isMilestone: false, _links: { self: { href: "/api/v3/types/4" } } },
      ] },
    }));
    const result = await new OpenProjectClient({ config: config(), fetchImpl }).listTypes();
    expect(result.total).toBe(2);
    expect(result.elements).toMatchObject([
      { id: 1, name: "Bug", href: "/api/v3/types/1", isDefault: false, isMilestone: false },
      { id: 4, name: "Feature", href: "/api/v3/types/4", isDefault: true, isMilestone: false },
    ]);
  });

  it("listTypes scopes to project when provided", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ _embedded: { elements: [] } }));
    await new OpenProjectClient({ config: config(), fetchImpl }).listTypes({ project: "alspc" });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/api/v3/projects/alspc/types");
  });

  it("listStatuses normalizes status collection", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      _embedded: { elements: [
        { id: 1, name: "Open", position: 1, isClosed: false, isDefault: true, isReadonly: false, _links: { self: { href: "/api/v3/statuses/1" } } },
        { id: 2, name: "Closed", position: 2, isClosed: true, isDefault: false, isReadonly: false, _links: { self: { href: "/api/v3/statuses/2" } } },
      ] },
    }));
    const result = await new OpenProjectClient({ config: config(), fetchImpl }).listStatuses();
    expect(result.elements).toMatchObject([
      { id: 1, name: "Open", isClosed: false, isDefault: true },
      { id: 2, name: "Closed", isClosed: true, isDefault: false },
    ]);
  });

  it("listPriorities normalizes priority collection", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      _embedded: { elements: [
        { id: 1, name: "Low", position: 1, isDefault: false, isActive: true, _links: { self: { href: "/api/v3/priorities/1" } } },
        { id: 2, name: "Normal", position: 2, isDefault: true, isActive: true, _links: { self: { href: "/api/v3/priorities/2" } } },
      ] },
    }));
    const result = await new OpenProjectClient({ config: config(), fetchImpl }).listPriorities();
    expect(result.elements).toMatchObject([
      { id: 1, name: "Low", isDefault: false, isActive: true },
      { id: 2, name: "Normal", isDefault: true, isActive: true },
    ]);
  });

  it("createWorkPackage dry-run resolves type by name and calls form validation", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 4, name: "Feature", _links: { self: { href: "/api/v3/types/4" } } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { validationErrors: {} } }));
    const result = await new OpenProjectClient({ config: config({ allowWrite: true }), fetchImpl }).createWorkPackage({
      project: "alspc",
      type: "Feature",
      subject: "Improve Ask NAVLIN Explore messaging experience",
      description: "body\n",
      dryRun: true,
    });
    expect(result.status).toBe("dry-run");
    expect(result.request?.payload).toMatchObject({
      subject: "Improve Ask NAVLIN Explore messaging experience",
      description: { format: "markdown", raw: "body\n" },
      _links: { project: { href: "/api/v3/projects/alspc" }, type: { href: "/api/v3/types/4" } },
    });
    // First call: GET types, second call: POST form, no third call
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/api/v3/projects/alspc/types");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/api/v3/work_packages/form");
    expect((fetchImpl.mock.calls[1]?.[1] as RequestInit)?.method).toBe("POST");
  });

  it("createWorkPackage real create returns created result with browserUrl", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 4, name: "Feature", _links: { self: { href: "/api/v3/types/4" } } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { validationErrors: {} } }))
      .mockResolvedValueOnce(jsonResponse({
        id: 42, subject: "S",
        _links: { self: { href: "/api/v3/work_packages/42" }, status: { title: "Open" } },
      }));
    const result = await new OpenProjectClient({ config: config({ allowWrite: true, baseUrl: "https://op.example" }), fetchImpl }).createWorkPackage({
      project: "p",
      type: "Feature",
      subject: "S",
      dryRun: false,
    });
    expect(result.status).toBe("created");
    expect(result.id).toBe(42);
    expect(result.browserUrl).toBe("https://op.example/work_packages/42");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("createWorkPackage throws validation exit code with structured details for form errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 4, name: "Feature", _links: { self: { href: "/api/v3/types/4" } } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({
        _embedded: { validationErrors: { subject: { message: "Subject can't be blank." } } },
      }));
    try {
      await new OpenProjectClient({ config: config({ allowWrite: true }), fetchImpl }).createWorkPackage({
        project: "alspc", type: "Feature", subject: "x", dryRun: true,
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toHaveProperty("exitCode", 5);
      expect(error).toHaveProperty("details");
      expect((error as { details: Record<string, string> }).details).toEqual({ subject: "Subject can't be blank." });
    }
  });

  it("createWorkPackage blocks without allowWrite", async () => {
    await expect(new OpenProjectClient({ config: config(), fetchImpl: vi.fn<typeof fetch>() }).createWorkPackage({
      project: "p", type: "Feature", subject: "S", dryRun: true,
    })).rejects.toBeInstanceOf(WriteBlockedError);
  });

  it("createWorkPackage resolves type by id", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { validationErrors: {} } }));
    const result = await new OpenProjectClient({ config: config({ allowWrite: true }), fetchImpl }).createWorkPackage({
      project: "p", type: "7", subject: "S", dryRun: true,
    });
    expect(result.request?.payload).toMatchObject({ _links: { type: { href: "/api/v3/types/7" } } });
  });

  it("createWorkPackage resolves type by href passthrough", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { validationErrors: {} } }));
    const result = await new OpenProjectClient({ config: config({ allowWrite: true }), fetchImpl }).createWorkPackage({
      project: "p", type: "/api/v3/types/4", subject: "S", dryRun: true,
    });
    expect(result.request?.payload).toMatchObject({ _links: { type: { href: "/api/v3/types/4" } } });
  });

  it("createWorkPackage name resolution fails for unknown name", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ _embedded: { elements: [] } }));
    await expect(new OpenProjectClient({ config: config({ allowWrite: true }), fetchImpl }).createWorkPackage({
      project: "p", type: "Unknown", subject: "S", dryRun: true,
    })).rejects.toThrow("unknown type 'Unknown'");
  });

  it("createWorkPackage name resolution fails for ambiguous name", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ _embedded: { elements: [
      { id: 1, name: "Feature", _links: { self: { href: "/api/v3/types/1" } } },
      { id: 2, name: "feature", _links: { self: { href: "/api/v3/types/2" } } },
    ] } }));
    await expect(new OpenProjectClient({ config: config({ allowWrite: true }), fetchImpl }).createWorkPackage({
      project: "p", type: "Feature", subject: "S", dryRun: true,
    })).rejects.toThrow("ambiguous type 'Feature'");
  });

  it("createWorkPackage resolves status and priority", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 4, name: "Feature", _links: { self: { href: "/api/v3/types/4" } } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 1, name: "In progress", _links: { self: { href: "/api/v3/statuses/1" } } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 2, name: "Normal", _links: { self: { href: "/api/v3/priorities/2" } } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { validationErrors: {} } }));
    const result = await new OpenProjectClient({ config: config({ allowWrite: true }), fetchImpl }).createWorkPackage({
      project: "p", type: "Feature", subject: "S", status: "In progress", priority: "Normal", dryRun: true,
    });
    expect(result.request?.payload).toMatchObject({
      _links: {
        type: { href: "/api/v3/types/4" },
        status: { href: "/api/v3/statuses/1" },
        priority: { href: "/api/v3/priorities/2" },
      },
    });
  });
});
