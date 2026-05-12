import { fsError } from "./errors.js";

export const ROOT = "/";

export const normalizePath = (input: string): string => {
  validatePath(input, "access");
  const absolute = input.startsWith("/") ? input : `/${input}`;
  const parts: string[] = [];

  for (const part of absolute.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.length === 0 ? ROOT : `/${parts.join("/")}`;
};

export const resolvePath = (base: string, target: string): string => {
  if (target.startsWith("/")) {
    return normalizePath(target);
  }
  return normalizePath(`${normalizePath(base)}/${target}`);
};

export const dirname = (path: string): string => {
  const normalized = normalizePath(path);
  if (normalized === ROOT) {
    return ROOT;
  }
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? ROOT : normalized.slice(0, index);
};

export const basename = (path: string): string => {
  const normalized = normalizePath(path);
  if (normalized === ROOT) {
    return ROOT;
  }
  return normalized.slice(normalized.lastIndexOf("/") + 1);
};

export const joinPath = (...parts: string[]): string => normalizePath(parts.join("/"));

export const ancestorsOf = (path: string): string[] => {
  const normalized = normalizePath(path);
  if (normalized === ROOT) {
    return [];
  }
  const segments = normalized.slice(1).split("/");
  const ancestors: string[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    ancestors.push(`/${segments.slice(0, index).join("/")}`);
  }
  return ancestors;
};

export const relativePath = (path: string): string => {
  const normalized = normalizePath(path);
  return normalized === ROOT ? "" : normalized.slice(1);
};

export const validatePath = (path: string, syscall: string): void => {
  if (typeof path !== "string" || path.length === 0) {
    throw fsError("EINVAL", syscall, String(path), "path must be a non-empty string");
  }
  if (path.includes("\0")) {
    throw fsError("EINVAL", syscall, path, "path must not contain null bytes");
  }
};

export const isDescendantOrSelf = (candidate: string, parent: string): boolean => {
  const normalizedCandidate = normalizePath(candidate);
  const normalizedParent = normalizePath(parent);
  return (
    normalizedCandidate === normalizedParent ||
    normalizedCandidate.startsWith(`${normalizedParent === ROOT ? "" : normalizedParent}/`)
  );
};

export const joinKey = (...parts: Array<string | undefined>): string =>
  parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
