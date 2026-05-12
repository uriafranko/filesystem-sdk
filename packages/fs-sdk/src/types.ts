export type Body =
  | Blob
  | ReadableStream<Uint8Array>
  | ArrayBuffer
  | ArrayBufferView
  | Uint8Array
  | string;

export type BufferEncoding =
  | "utf8"
  | "utf-8"
  | "ascii"
  | "binary"
  | "base64"
  | "hex"
  | "latin1";

export type FileContent = string | Uint8Array;

export interface ReadFileOptions {
  encoding?: BufferEncoding | null;
}

export interface WriteFileOptions {
  encoding?: BufferEncoding;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface MkdirOptions {
  recursive?: boolean;
}

export interface RmOptions {
  recursive?: boolean;
  force?: boolean;
}

export interface CpOptions {
  recursive?: boolean;
}

export interface DirentEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

export interface FsStat {
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  mode: number;
  size: number;
  mtime: Date;
}

export interface StoredObject {
  key: string;
  size: number;
  type: string;
  lastModified?: number;
  etag?: string;
  metadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  stream(): ReadableStream<Uint8Array>;
  blob?(): Promise<Blob>;
}

export interface StorageUploadOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface StorageUploadResult {
  key: string;
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: number;
}

export interface StorageDownloadOptions {
  as?: "blob" | "stream";
}

export interface StorageListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
}

export interface StorageListResult {
  items: StoredObject[];
  cursor?: string;
}

export interface ObjectStorage {
  readonly name: string;
  upload(
    key: string,
    body: Body,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResult>;
  download(key: string, options?: StorageDownloadOptions): Promise<StoredObject>;
  head(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  copy?(from: string, to: string): Promise<void>;
  list(options?: StorageListOptions): Promise<StorageListResult>;
}

export interface OverlayFsOptions {
  storage: ObjectStorage;
  prefix?: string;
  createParentDirectories?: boolean;
  defaultFileMode?: number;
  defaultDirectoryMode?: number;
  defaultSymlinkMode?: number;
}

export type OverlayNodeKind = "file" | "directory" | "symlink";

export interface OverlayNodeMetadata {
  version: 1;
  kind: OverlayNodeKind;
  mode: number;
  mtimeMs: number;
  size: number;
  target?: string;
  contentType?: string;
  metadata?: Record<string, string>;
}
