import type { Command } from "commander";
import { stableJson } from "../output/json.js";
import { renderKeyValue } from "../output/text.js";
import { renderTable } from "../output/table.js";
import { listProfiles, redactProfile, setProfile, showProfile, unsetProfile, useProfile, type Profile } from "../config/profiles.js";
import type { CommandContext } from "./context.js";

interface SetProfileOptions {
  readonly url?: string;
  readonly authMode?: string;
  readonly defaultProject?: string;
  readonly token?: string;
  readonly json?: boolean;
}

export function registerProfile(program: Command, context: CommandContext): void {
  const profile = program.command("profile").description("Saved non-write OpenProject connection profiles");

  profile.command("list")
    .description("List saved profiles")
    .option("--json", "emit JSON")
    .action((options: { readonly json?: boolean }) => {
      const rows = listProfiles(context.env).map((entry) => ({ name: entry.name, active: entry.active ? "yes" : "", ...redactProfile(entry.profile) }));
      context.stdout.write(options.json ? stableJson(rows) : renderTable(rows, ["name", "active", "url", "authMode", "defaultProject", "token"]));
    });

  profile.command("show")
    .description("Show a saved profile with secrets redacted")
    .argument("[name]", "profile name; defaults to active profile")
    .option("--json", "emit JSON")
    .action((name: string | undefined, options: { readonly json?: boolean }) => {
      const result = showProfile(name, context.env);
      const output = result.profile ? { name: result.name, ...redactProfile(result.profile) } : { name: undefined };
      context.stdout.write(options.json ? stableJson(output) : renderKeyValue(output));
    });

  profile.command("set")
    .description("Create or replace a saved profile")
    .argument("<name>", "profile name")
    .option("--url <url>", "OpenProject base URL")
    .option("--auth-mode <mode>", "auth mode: bearer or basic")
    .option("--default-project <id>", "default project identifier or id")
    .option("--token <token>", "OpenProject API token; stored in a 0600 profile file")
    .option("--json", "emit JSON")
    .action((name: string, options: SetProfileOptions) => {
      const profileValue: Profile = {
        ...(options.url ? { url: options.url } : {}),
        ...(options.authMode ? { authMode: options.authMode } : {}),
        ...(options.defaultProject ? { defaultProject: options.defaultProject } : {}),
        ...(options.token ? { token: options.token } : {}),
      };
      setProfile(name, profileValue, context.env);
      const output = { name, ...redactProfile(profileValue) };
      context.stdout.write(options.json ? stableJson(output) : `${name}\n`);
    });

  profile.command("use")
    .description("Set the active profile")
    .argument("<name>", "profile name")
    .option("--json", "emit JSON")
    .action((name: string, options: { readonly json?: boolean }) => {
      useProfile(name, context.env);
      const output = { activeProfile: name };
      context.stdout.write(options.json ? stableJson(output) : `active profile: ${name}\n`);
    });

  profile.command("unset")
    .description("Delete a saved profile")
    .argument("<name>", "profile name")
    .option("--json", "emit JSON")
    .action((name: string, options: { readonly json?: boolean }) => {
      unsetProfile(name, context.env);
      const output = { unset: name };
      context.stdout.write(options.json ? stableJson(output) : `unset profile: ${name}\n`);
    });
}
