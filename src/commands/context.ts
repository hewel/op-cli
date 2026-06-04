import type { Command } from "commander";
import { OpenProjectClient } from "../client/openProjectClient.js";
import { loadResolvedConfig, resolveConfigEnv, type ConfigResolutionOptions } from "../config.js";
import { stableJson } from "../output/json.js";

export interface CommandContext {
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
  readonly env: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly cwd?: string;
}

export function globalConfigOptions(command: Command): ConfigResolutionOptions {
  const opts = rootCommand(command).opts<Record<string, unknown>>();
  return {
    ...(typeof opts.env === "string" ? { envFile: opts.env } : {}),
    ...(opts.env === false ? { autoEnv: false } : {}),
    ...(typeof opts.profile === "string" ? { profile: opts.profile } : {}),
  };
}

export function resolvedEnv(context: CommandContext, command: Command): NodeJS.ProcessEnv {
  return resolveConfigEnv(context.env, configOptions(context, command)) as NodeJS.ProcessEnv;
}

export function createClient(context: CommandContext, command?: Command): OpenProjectClient {
  const config = loadResolvedConfig(context.env, command ? configOptions(context, command) : configOptions(context));
  return new OpenProjectClient({
    config,
    ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
  });
}

export function writeOutput(context: CommandContext, value: unknown, json: boolean, renderText: () => string, token?: string): void {
  context.stdout.write(json ? stableJson(value, token ?? context.env.OPENPROJECT_TOKEN) : renderText());
}

function configOptions(context: CommandContext, command?: Command): ConfigResolutionOptions {
  return {
    ...(context.cwd ? { cwd: context.cwd } : {}),
    ...(command ? globalConfigOptions(command) : {}),
  };
}

function rootCommand(command: Command): Command {
  let current = command;
  while (current.parent) current = current.parent;
  return current;
}

export function booleanOption(command: Command, name: string): boolean {
  return Boolean(command.opts<Record<string, unknown>>()[name]);
}
