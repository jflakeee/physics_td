/** Data-boundary validation helpers shared by the skill loaders (JSON files are untrusted input). */
export type Obj = Record<string, unknown>;

/** Throw a data error naming the offending file/path. */
export function fail(where: string, msg: string): never {
  throw new Error(`data: ${where}: ${msg}`);
}

/** Require a plain object. */
export function obj(v: unknown, where: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(where, 'expected an object');
  return v as Obj;
}

/** Require a finite number field >= min. */
export function num(o: Obj, k: string, where: string, min = -Infinity): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) fail(where, `"${k}" must be a number >= ${min}`);
  return v;
}

/** Require a non-empty string field. */
export function str(o: Obj, k: string, where: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') fail(where, `"${k}" must be a non-empty string`);
  return v;
}

/** Require a string field that is one of `allowed`. */
export function oneOf<T extends string>(o: Obj, k: string, where: string, allowed: readonly T[]): T {
  const v = o[k];
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) fail(where, `"${k}" must be one of ${allowed.join('|')}`);
  return v as T;
}

/** Require an array field. */
export function arr(o: Obj, k: string, where: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) fail(where, `"${k}" must be an array`);
  return v;
}
