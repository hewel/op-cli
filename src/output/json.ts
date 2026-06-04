import { redactSecrets } from "../client/auth.js";

export function stableJson(value: unknown, token?: string): string {
  return `${redactSecrets(JSON.stringify(sortForJson(value), null, 2), token)}\n`;
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = sortForJson((value as Record<string, unknown>)[key]);
  return sorted;
}
