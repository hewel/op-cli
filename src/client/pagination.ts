import { collectionElements, collectionTotal } from "./hal.js";

export interface PageOptions {
  readonly pageSize?: number;
}

export interface NormalizedCollection<T> {
  readonly elements: readonly T[];
  readonly total?: number;
  readonly count: number;
}

export function normalizePageSize(value: unknown, fallback = 25): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new Error("page size must be an integer between 1 and 100");
  return parsed;
}

export function normalizeCollection<T>(resource: unknown, mapper: (value: unknown) => T): NormalizedCollection<T> {
  const elements = collectionElements(resource).map(mapper);
  const total = collectionTotal(resource);
  return { elements, ...(total === undefined ? {} : { total }), count: elements.length };
}
