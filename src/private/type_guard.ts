// Created by Autokaka (qq1909698494@gmail.com) on 2023/06/21.

export function isNull(x: unknown): x is null {
  return x === null;
}

export function isUndefined(x: unknown): x is undefined {
  return x === undefined;
}

export function isNullOrUndefined(x: unknown): x is null | undefined {
  return isNull(x) || isUndefined(x);
}

export function isNumber(x: unknown): x is number {
  return x !== null && typeof x === "number" && !isNaN(x);
}

export function isBoolean(x: unknown): x is boolean {
  return x !== null && typeof x === "boolean";
}

export function isString(x: unknown): x is string {
  return typeof x === "string";
}

export function isArrayLike(x: unknown): x is ArrayLike<unknown> {
  return isRecord(x) && isNumber(x.length) && !isFunction(x);
}

export function isArray(x: unknown): x is Array<unknown> {
  return x instanceof Array;
}

export function isTypedArray<T>(x: unknown, guard: (elem: unknown) => elem is T): x is Array<T> {
  if (!isArray(x)) {
    return false;
  }
  return x.every((elem) => {
    return guard(elem);
  });
}

export function isFunction(x: unknown): x is (...args: unknown[]) => unknown {
  return typeof x === "function";
}

export function isRecord(x: unknown): x is Record<PropertyKey, unknown> {
  return typeof x === "object" ? x !== null : typeof x === "function";
}

export function isStringOrNumber(x: unknown): x is string | number {
  return isString(x) || isNumber(x);
}

export function isError(v: unknown): v is Error {
  return isRecord(v) && v instanceof Error;
}
