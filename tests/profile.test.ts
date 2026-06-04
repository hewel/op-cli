import { mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProfileEnv, profilesPath, setProfile, useProfile } from "../src/config/profiles.js";
import { run } from "../src/cli.js";

function tempEnv(): NodeJS.ProcessEnv {
  const dir = join(tmpdir(), `opctl-profile-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return { XDG_CONFIG_HOME: dir };
}

function harness(env: NodeJS.ProcessEnv) {
  let stdout = "";
  let stderr = "";
  return {
    ctx: {
      stdout: { write: (text: string) => { stdout += text; return true; } },
      stderr: { write: (text: string) => { stderr += text; return true; } },
      env,
    },
    output: () => ({ stdout, stderr }),
  };
}

describe("profiles", () => {
  it("sets, lists, uses, and shows profiles with token redacted", async () => {
    const env = tempEnv();
    const h = harness(env);
    await expect(run(["node", "opctl", "profile", "set", "navlin-qa", "--url", "https://op.example", "--token", "profile-secret", "--auth-mode", "bearer", "--default-project", "qa"], h.ctx)).resolves.toBe(0);
    await expect(run(["node", "opctl", "profile", "use", "navlin-qa"], h.ctx)).resolves.toBe(0);
    await expect(run(["node", "opctl", "profile", "show", "navlin-qa", "--json"], h.ctx)).resolves.toBe(0);
    expect(h.output().stdout).toContain("<redacted>");
    expect(h.output().stdout).not.toContain("profile-secret");
    expect(getProfileEnv(undefined, env)).toMatchObject({ OPENPROJECT_URL: "https://op.example", OPENPROJECT_TOKEN: "profile-secret", OPENPROJECT_DEFAULT_PROJECT: "qa" });
  });

  it("writes profile store with restrictive permissions where supported", () => {
    const env = tempEnv();
    setProfile("p", { url: "https://op.example", token: "secret" }, env);
    const mode = statSync(profilesPath(env)).mode & 0o777;
    expect(mode & 0o077).toBe(0);
  });

  it("loads token-bearing profile but loses to higher-precedence env", () => {
    const env = tempEnv();
    setProfile("p", { url: "https://profile.example", token: "profile-token" }, env);
    useProfile("p", env);
    expect(getProfileEnv(undefined, env)).toMatchObject({ OPENPROJECT_TOKEN: "profile-token" });
  });
});
