import type { Command } from "commander";
import { OpenProjectClient } from "../client/openProjectClient.js";
import { loadConfig } from "../config.js";
import { stableJson } from "../output/json.js";

export interface CommandContext {
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
  readonly env: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
}

export function createClient(context: CommandContext): OpenProjectClient {
  return new OpenProjectClient({
    config: loadConfig(context.env),
    ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
  });
}

export function writeOutput(context: CommandContext, value: unknown, json: boolean, renderText: () => string): void {
  context.stdout.write(json ? stableJson(value, context.env.OPENPROJECT_TOKEN) : renderText());
}

export function booleanOption(command: Command, name: string): boolean {
  return Boolean(command.opts<Record<string, unknown>>()[name]);
}
