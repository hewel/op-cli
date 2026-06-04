import type { Command } from "commander";
import { pullOpenApiSpec } from "../../scripts/pull-openapi-spec.js";
import { resolvedEnv, type CommandContext } from "./context.js";

export function registerSpec(program: Command, context: CommandContext): void {
  const spec = program.command("spec").description("OpenAPI spec utilities");
  spec.command("pull")
    .description("Download OpenProject /api/v3/spec.json safely")
    .action(async (_options: unknown, command: Command) => {
      await pullOpenApiSpec({ env: resolvedEnv(context, command), stdout: context.stdout, ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}) });
    });
}
