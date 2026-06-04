#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { redactSecrets } from "./client/auth.js";
import { EXIT_CODES, toOpctlError } from "./client/errors.js";
import { stableJson } from "./output/json.js";
import { registerApiRoot } from "./commands/apiRoot.js";
import { registerMe } from "./commands/me.js";
import { registerProjects } from "./commands/projects.js";
import { registerSpec } from "./commands/spec.js";
import { registerWorkPackages } from "./commands/workPackages.js";
import { registerProfile } from "./commands/profile.js";
import type { CommandContext } from "./commands/context.js";
import pkg from "../package.json" with { type: "json" };

export function buildProgram(context: CommandContext): Command {
  const program = new Command();
  program
    .name("opctl")
    .description("Conservative local CLI bridge for OpenProject API v3")
    .version(pkg.version)
    .option("--env <path>", "load OpenProject configuration from dotenv-style file")
    .option("--no-env", "disable automatic .env loading from the current working directory")
    .option("--profile <name>", "use a saved profile for this invocation")
    .showHelpAfterError()
    .configureOutput({
      writeOut: (text) => context.stdout.write(text),
      writeErr: (text) => context.stderr.write(text),
    });
  registerMe(program, context);
  registerApiRoot(program, context);
  registerProjects(program, context);
  registerWorkPackages(program, context);
  registerProfile(program, context);
  registerSpec(program, context);
  return program;
}

export async function run(argv: readonly string[], context: CommandContext): Promise<number> {
  try {
    await buildProgram(context).parseAsync(argv, { from: "node" });
    return EXIT_CODES.success;
  } catch (error) {
    const opctlError = toOpctlError(error);
    const wantsJson = argv.includes("--json");
    if (wantsJson) context.stderr.write(stableJson({ error: opctlError.message, exitCode: opctlError.exitCode }, context.env.OPENPROJECT_TOKEN));
    else context.stderr.write(`${redactSecrets(opctlError.message, context.env.OPENPROJECT_TOKEN)}\n`);
    return opctlError.exitCode;
  }
}

export function isCliEntrypoint(metaUrl: string, argvPath: string | undefined = process.argv[1]): boolean {
  if (!argvPath) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

if (isCliEntrypoint(import.meta.url)) {
  const exitCode = await run(process.argv, { stdout: process.stdout, stderr: process.stderr, env: process.env });
  process.exitCode = exitCode;
}
