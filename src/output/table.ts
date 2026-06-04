export function renderTable(rows: readonly object[], columns: readonly string[]): string {
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => cell((row as Record<string, unknown>)[column]).length)));
  const header = columns.map((column, index) => column.padEnd(widths[index] ?? column.length)).join("  ");
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) => columns.map((column, index) => cell((row as Record<string, unknown>)[column]).padEnd(widths[index] ?? 0)).join("  "));
  return `${[header, divider, ...body].join("\n")}\n`;
}

function cell(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}
