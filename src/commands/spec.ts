import type { Command } from "commander";
import { pullOpenApiSpec } from "../../scripts/pull-openapi-spec.js";
import type { CommandContext } from "./context.js";

export interface SpecPullOptions {
  readonly url?: string;
  readonly output?: string;
}

export function registerSpec(program: Command, context: CommandContext): void {
  const spec = program.command("spec").description("OpenAPI spec utilities");
  spec.command("pull")
    .description("Download OpenProject /api/v3/spec.json (defaults to the public community spec)")
    .option("--url <url>", "spec source base URL (overrides OPENPROJECT_SPEC_URL)")
    .option("--output <path>", "output file path")
    .action(async (opts: SpecPullOptions) => {
      await pullOpenApiSpec({
        env: context.env,
        stdout: context.stdout,
        ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
        ...(opts.url ? { sourceBaseUrl: opts.url } : {}),
        ...(opts.output ? { outputPath: opts.output } : {}),
      });
    });
}
