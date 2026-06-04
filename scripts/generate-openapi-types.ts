import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import openapiTS, { astToString } from "openapi-typescript";
import { OpenApiGenerationError } from "../src/client/errors.js";

const HEADER = "// Generated from OpenProject OpenAPI spec. Do not edit manually.\n";

export interface GenerateOptions {
  readonly inputPath?: string;
  readonly outputPath?: string;
  readonly stdout?: Pick<typeof process.stdout, "write">;
}

export async function generateOpenApiTypes(options: GenerateOptions = {}): Promise<string> {
  const inputPath = options.inputPath ?? "openapi/openproject.json";
  const outputPath = options.outputPath ?? "src/generated/openproject.ts";
  let schema: unknown;
  try {
    schema = JSON.parse(await readFile(inputPath, "utf8"));
  } catch (error) {
    throw new OpenApiGenerationError(`failed to read ${inputPath}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const generated = astToString(await openapiTS(schema as Parameters<typeof openapiTS>[0]));
  const text = `${HEADER}${generated}`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  options.stdout?.write(`Generated OpenProject types at ${outputPath}\n`);
  return text;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateOpenApiTypes({ stdout: process.stdout }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "failed to generate OpenProject types"}\n`);
    process.exitCode = 8;
  });
}
