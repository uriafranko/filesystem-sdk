export type OverlayFsErrorCode =
  | "EEXIST"
  | "EFBIG"
  | "EISDIR"
  | "EINVAL"
  | "ENOENT"
  | "ENOTDIR"
  | "ENOTEMPTY"
  | "ENOTSUP"
  | "ELOOP"
  | "ESTORAGE";

export class OverlayFsError extends Error {
  readonly code: OverlayFsErrorCode;
  readonly path?: string;
  readonly cause?: unknown;

  constructor(
    code: OverlayFsErrorCode,
    message: string,
    options?: { path?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "OverlayFsError";
    this.code = code;
    this.path = options?.path;
    this.cause = options?.cause;
  }
}

export const fsError = (
  code: OverlayFsErrorCode,
  syscall: string,
  path: string,
  message?: string,
): OverlayFsError => {
  const detail = message ?? defaultMessage(code);
  return new OverlayFsError(code, `${code}: ${detail}, ${syscall} '${path}'`, {
    path,
  });
};

export const storageError = (operation: string, cause: unknown): OverlayFsError =>
  new OverlayFsError(
    "ESTORAGE",
    `ESTORAGE: storage operation failed during ${operation}`,
    { cause },
  );

export const isNotFoundError = (error: unknown): boolean => {
  if (error instanceof OverlayFsError) {
    return error.code === "ENOENT";
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return code === "ENOENT" || code === "NotFound";
  }
  if (error instanceof Error) {
    return /not found|no such file|ENOENT/i.test(error.message);
  }
  return false;
};

const defaultMessage = (code: OverlayFsErrorCode): string => {
  switch (code) {
    case "EEXIST":
      return "file already exists";
    case "EFBIG":
      return "file too large";
    case "EISDIR":
      return "illegal operation on a directory";
    case "EINVAL":
      return "invalid argument";
    case "ENOENT":
      return "no such file or directory";
    case "ENOTDIR":
      return "not a directory";
    case "ENOTEMPTY":
      return "directory not empty";
    case "ENOTSUP":
      return "operation not supported";
    case "ELOOP":
      return "too many symbolic links";
    case "ESTORAGE":
      return "storage backend error";
  }
};
