import { describe, expect, it } from "vitest";
import { createAuthorizationHeader, redactSecrets } from "../src/client/auth.js";
import { ConfigurationError } from "../src/client/errors.js";
import { loadConfig, normalizeBaseUrl } from "../src/config.js";

describe("config", () => {
  it("requires OpenProject URL and token", () => {
    expect(() => loadConfig({ OPENPROJECT_TOKEN: "t" })).toThrow(ConfigurationError);
    expect(() => loadConfig({ OPENPROJECT_URL: "https://op.example" })).toThrow(ConfigurationError);
  });

  it("normalizes URLs while preserving path prefixes", () => {
    expect(normalizeBaseUrl("https://op.example/base///")).toBe("https://op.example/base");
  });

  it("parses auth and write gate conservatively", () => {
    expect(loadConfig({ OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret" })).toMatchObject({ authMode: "bearer", allowWrite: false });
    expect(loadConfig({ OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "secret", OPENPROJECT_AUTH_MODE: "basic", OPENPROJECT_ALLOW_WRITE: "1" })).toMatchObject({ authMode: "basic", allowWrite: true });
  });

  it("creates bearer and basic authorization headers", () => {
    expect(createAuthorizationHeader("bearer", "secret-token")).toBe("Bearer secret-token");
    expect(createAuthorizationHeader("basic", "secret-token")).toBe(`Basic ${Buffer.from("apikey:secret-token").toString("base64")}`);
  });

  it("redacts tokens and authorization headers", () => {
    const output = redactSecrets('Authorization: Bearer abc123 {"Authorization":"Basic xyz"} abc123', "abc123");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("Basic xyz");
    expect(output).toContain("<redacted>");
  });
});
