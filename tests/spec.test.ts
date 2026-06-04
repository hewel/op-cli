import { describe, expect, it, vi } from "vitest";
import { pullOpenApiSpec } from "../scripts/pull-openapi-spec.js";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("spec pull", () => {
  it("does not print credentials", async () => {
    let stdout = "";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ openapi: "3.0.0", info: { title: "OpenProject", version: "3" }, paths: {} }));
    await pullOpenApiSpec({
      env: { OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret-token" } as NodeJS.ProcessEnv,
      fetchImpl,
      outputPath: "tmp/test-openproject.json",
      stdout: { write: (text: string) => { stdout += text; return true; } },
    });
    expect(stdout).toContain("op.example");
    expect(stdout).not.toContain("secret-token");
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer secret-token" });
  });
});
