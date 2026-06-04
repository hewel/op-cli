import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthorizationHeader, redactSecrets } from "../src/client/auth.js";
import { ConfigurationError } from "../src/client/errors.js";
import { loadConfig, normalizeBaseUrl, resolveConfigEnv } from "../src/config.js";
import { parseEnvFile } from "../src/config/envFile.js";
import { setProfile, useProfile } from "../src/config/profiles.js";

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

  it("parses dotenv files without enabling writes", () => {
    const parsed = parseEnvFile(`
# comment
OPENPROJECT_URL=\"https://op.example/base\"
OPENPROJECT_TOKEN='secret'
OPENPROJECT_AUTH_MODE=basic # inline
OPENPROJECT_ALLOW_WRITE=1
`);
    expect(parsed).toMatchObject({ OPENPROJECT_URL: "https://op.example/base", OPENPROJECT_TOKEN: "secret", OPENPROJECT_AUTH_MODE: "basic" });
    expect(parsed.OPENPROJECT_ALLOW_WRITE).toBeUndefined();
  });

  it("resolves config precedence from process env, explicit env, profile, active profile, and auto env", () => {
    const dir = join(tmpdir(), `opctl-config-${process.pid}-${Math.random().toString(16).slice(2)}`);
    const cwd = join(dir, "cwd");
    const xdg = join(dir, "xdg");
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, ".env"), "OPENPROJECT_URL=https://auto.example\nOPENPROJECT_TOKEN=auto-token\nOPENPROJECT_ALLOW_WRITE=1\n", "utf8");
    writeFileSync(join(cwd, "explicit.env"), "OPENPROJECT_TOKEN=explicit-token\nOPENPROJECT_DEFAULT_PROJECT=explicit-project\n", "utf8");
    const baseEnv = { XDG_CONFIG_HOME: xdg };
    setProfile("active", { url: "https://active.example", token: "active-token", defaultProject: "active-project" }, baseEnv);
    setProfile("selected", { url: "https://selected.example", token: "selected-token", defaultProject: "selected-project" }, baseEnv);
    useProfile("active", baseEnv);
    const resolved = resolveConfigEnv({ ...baseEnv, OPENPROJECT_URL: "https://process.example" }, { cwd, envFile: "explicit.env", profile: "selected" });
    expect(resolved).toMatchObject({ OPENPROJECT_URL: "https://process.example", OPENPROJECT_TOKEN: "explicit-token", OPENPROJECT_DEFAULT_PROJECT: "explicit-project" });
    expect(resolved.OPENPROJECT_ALLOW_WRITE).toBeUndefined();
    expect(resolveConfigEnv(baseEnv, { cwd, autoEnv: false }).OPENPROJECT_TOKEN).toBe("active-token");
  });
});
