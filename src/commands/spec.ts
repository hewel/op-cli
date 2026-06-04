import type { Command } from "commander";
import { pullOpenApiSpec } from "../../scripts/pull-openapi-spec.js";
import type { CommandContext } from "./context.js";

export function registerSpec(program: Command, context: CommandContext): void {
  const spec = program.command("spec").description("OpenAPI spec utilities");
  spec.command("pull")
    .description("Download OpenProject /api/v3/spec.json safely")
    .action(async () => {
      await pullOpenApiSpec({ env: context.env, stdout: context.stdout, ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}) });
    });
}
