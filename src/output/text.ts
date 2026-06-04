export function renderKeyValue(value: Record<string, unknown>): string {
  return `${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join("\n")}\n`;
}
