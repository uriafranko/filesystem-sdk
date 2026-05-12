import {
  arrayBufferFromBytes,
  concatBytes,
  decodeBytes,
  getEncoding,
  latin1ByteString,
  toBytes,
} from "./internal/bytes.js";
import {
  OverlayFsError,
  fsError,
  isNotFoundError,
  storageError,
} from "./internal/errors.js";
import {
  ancestorsOf,
  basename,
  dirname,
  isDescendantOrSelf,
  joinKey,
  joinPath,
  normalizePath,
  relativePath,
  resolvePath as resolveVirtualPath,
  ROOT,
} from "./internal/path.js";
import { hasAnyKey, listKeys, safeDelete } from "./internal/storage.js";
import type {
  Body,
  BufferEncoding,
  CpOptions,
  DirentEntry,
  FileContent,
  FsStat,
  MkdirOptions,
  ObjectStorage,
  OverlayFsOptions,
  OverlayNodeMetadata,
  ReadFileOptions,
  RmOptions,
  WriteFileOptions,
} from "./types.js";

const DEFAULT_FILE_MODE = 0o100644;
const DEFAULT_DIR_MODE = 0o040755;
const DEFAULT_SYMLINK_MODE = 0o120777;
const MAX_SYMLINK_DEPTH = 40;
const METADATA_CONTENT_TYPE = "application/json";

type ResolvedStat = FsStat & { kind: OverlayNodeMetadata["kind"]; target?: string };

export class OverlayFs {
  readonly storage: ObjectStorage;
  readonly prefix: string;

  private readonly createParentDirectories: boolean;
  private readonly defaultFileMode: number;
  private readonly defaultDirectoryMode: number;
  private readonly defaultSymlinkMode: number;
  private readonly pathCache = new Set<string>([ROOT]);

  constructor(options: OverlayFsOptions) {
    this.storage = options.storage;
    this.prefix = options.prefix?.replace(/^\/+|\/+$/g, "") ?? "";
    this.createParentDirectories = options.createParentDirectories ?? true;
    this.defaultFileMode = options.defaultFileMode ?? DEFAULT_FILE_MODE;
    this.defaultDirectoryMode = options.defaultDirectoryMode ?? DEFAULT_DIR_MODE;
    this.defaultSymlinkMode = options.defaultSymlinkMode ?? DEFAULT_SYMLINK_MODE;
  }

  resolvePath(base: string, path: string): string {
    return resolveVirtualPath(base, path);
  }

  async readFile(
    path: string,
    options?: ReadFileOptions | BufferEncoding,
  ): Promise<string> {
    const bytes = await this.readFileBuffer(path);
    return decodeBytes(bytes, getEncoding(options));
  }

  async readFileBytes(path: string): Promise<string> {
    return latin1ByteString(await this.readFileBuffer(path));
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const resolved = await this.resolveSymlinks(path, true, "open");
    const stat = await this.lstatResolved(resolved);
    if (stat.kind === "directory") {
      throw fsError("EISDIR", "open", path);
    }
    if (stat.kind === "symlink") {
      throw fsError("ELOOP", "open", path);
    }

    try {
      const object = await this.storage.download(this.contentKey(resolved));
      return new Uint8Array(await object.arrayBuffer());
    } catch (error) {
      if (isNotFoundError(error)) {
        throw fsError("ENOENT", "open", path);
      }
      throw storageError("download", error);
    }
  }

  async writeFile(
    path: string,
    content: Body | FileContent,
    options?: WriteFileOptions | BufferEncoding,
  ): Promise<void> {
    const resolved = await this.resolveSymlinksForWrite(path);
    const existing = await this.tryLstat(resolved);
    if (existing?.kind === "directory") {
      throw fsError("EISDIR", "write", path);
    }

    await this.ensureParentDirectories(dirname(resolved), "write");
    const bytes = await toBytes(content, options);
    const contentType =
      typeof options === "object" && options?.contentType
        ? options.contentType
        : "application/octet-stream";

    const contentKey = this.contentKey(resolved);
    let contentUploaded = false;
    try {
      await this.storage.upload(contentKey, bytes, {
        contentType,
        metadata: typeof options === "object" ? options.metadata : undefined,
      });
      contentUploaded = true;
      await this.writeFileMetadata(resolved, {
        contentType,
        metadata: typeof options === "object" ? options.metadata : undefined,
        mode: existing?.mode ?? this.defaultFileMode,
        mtimeMs: Date.now(),
        size: bytes.byteLength,
      });
    } catch (error) {
      if (contentUploaded && !existing) {
        await this.rollbackUploadedContent(contentKey, error);
      }
      throw storageError("upload", error);
    }

    this.rememberPath(resolved);
  }

  async appendFile(
    path: string,
    content: FileContent,
    options?: WriteFileOptions | BufferEncoding,
  ): Promise<void> {
    const existing = (await this.exists(path))
      ? await this.readFileBuffer(path)
      : new Uint8Array();
    const next = concatBytes(existing, await toBytes(content, options));
    await this.writeFile(path, next, options);
  }

  async exists(path: string): Promise<boolean> {
    return (await this.tryLstat(path)) !== undefined;
  }

  async stat(path: string): Promise<FsStat> {
    const resolved = await this.resolveSymlinks(path, true, "stat");
    return this.stripKind(await this.lstatResolved(resolved));
  }

  async lstat(path: string): Promise<FsStat> {
    const resolved = await this.resolveSymlinks(path, false, "lstat");
    return this.stripKind(await this.lstatResolved(resolved));
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    const normalized = normalizePath(path);
    if (normalized === ROOT) {
      return;
    }

    const existing = await this.tryLstat(normalized);
    if (existing) {
      if (existing.kind === "directory" && options?.recursive) {
        return;
      }
      throw fsError("EEXIST", "mkdir", path);
    }

    if (options?.recursive) {
      for (const ancestor of ancestorsOf(normalized)) {
        const stat = await this.tryLstat(ancestor);
        if (stat && stat.kind !== "directory") {
          throw fsError("ENOTDIR", "mkdir", ancestor);
        }
        if (!stat) {
          await this.writeDirectoryMetadata(ancestor);
          this.rememberPath(ancestor);
        }
      }
    } else {
      const parent = await this.tryLstat(dirname(normalized));
      if (!parent) {
        throw fsError("ENOENT", "mkdir", dirname(normalized));
      }
      if (parent.kind !== "directory") {
        throw fsError("ENOTDIR", "mkdir", dirname(normalized));
      }
    }

    await this.writeDirectoryMetadata(normalized);
    this.rememberPath(normalized);
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await this.readdirWithFileTypes(path);
    return entries.map((entry) => entry.name).sort();
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    const resolved = await this.resolveSymlinks(path, true, "readdir");
    const stat = await this.lstatResolved(resolved);
    if (stat.kind !== "directory") {
      throw fsError("ENOTDIR", "readdir", path);
    }

    const names = await this.listDirectChildren(resolved);
    const entries: DirentEntry[] = [];
    for (const name of names.sort()) {
      const child = joinPath(resolved, name);
      const childStat = await this.lstatResolved(child);
      entries.push({
        name,
        isFile: childStat.kind === "file",
        isDirectory: childStat.kind === "directory",
        isSymbolicLink: childStat.kind === "symlink",
      });
    }
    return entries;
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    const normalized = await this.resolveSymlinks(path, false, "rm");
    const stat = await this.tryLstat(normalized);
    if (!stat) {
      if (options?.force) {
        return;
      }
      throw fsError("ENOENT", "rm", path);
    }

    if (stat.kind === "directory") {
      const children = await this.listDirectChildren(normalized);
      if (children.length > 0 && !options?.recursive) {
        throw fsError("ENOTEMPTY", "rm", path);
      }
      await this.deleteDirectoryTree(normalized);
      return;
    }

    await this.deleteNode(normalized, stat.kind);
    this.forgetPath(normalized);
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const source = await this.resolveSymlinks(src, false, "cp");
    const sourceStat = await this.lstatResolved(source);
    let target = await this.resolveSymlinksForWrite(dest);
    const destStat = await this.tryLstat(target);
    if (destStat?.kind === "directory") {
      target = joinPath(target, basename(source));
    }

    if (sourceStat.kind === "directory") {
      if (isDescendantOrSelf(target, source)) {
        throw fsError("EINVAL", "cp", dest, "cannot copy a directory into itself");
      }
      if (!options?.recursive) {
        throw fsError("ENOTDIR", "cp", src, "source is a directory");
      }
      await this.mkdir(target, { recursive: true });
      for (const child of await this.readdir(source)) {
        await this.cp(joinPath(source, child), joinPath(target, child), {
          recursive: true,
        });
      }
      return;
    }

    if (sourceStat.kind === "symlink") {
      await this.symlink(sourceStat.target ?? "", target);
      return;
    }

    await this.copyFile(source, target, sourceStat);
  }

  async mv(src: string, dest: string): Promise<void> {
    const source = await this.resolveSymlinks(src, false, "mv");
    const sourceStat = await this.lstatResolved(source);
    let target = await this.resolveSymlinksForWrite(dest);
    const destStat = await this.tryLstat(target);
    if (destStat?.kind === "directory") {
      target = joinPath(target, basename(source));
    }
    if (sourceStat.kind === "directory" && isDescendantOrSelf(target, source)) {
      throw fsError("EINVAL", "mv", dest, "cannot move a directory into itself");
    }

    await this.cp(src, dest, { recursive: true });
    await this.rm(src, { recursive: true, force: true });
  }

  async chmod(path: string, mode: number): Promise<void> {
    const normalized = await this.resolveSymlinks(path, true, "chmod");
    const metadata = await this.metadataForUpdate(normalized, "chmod");
    await this.writeMetadataForPath(normalized, { ...metadata, mode });
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    const parent = await this.resolveSymlinks(dirname(linkPath), true, "symlink");
    const normalized = joinPath(parent, basename(linkPath));
    if (await this.exists(normalized)) {
      throw fsError("EEXIST", "symlink", linkPath);
    }
    await this.ensureParentDirectories(dirname(normalized), "symlink");
    await this.writeMetadataForPath(normalized, {
      version: 1,
      kind: "symlink",
      mode: this.defaultSymlinkMode,
      mtimeMs: Date.now(),
      size: target.length,
      target,
    });
    this.rememberPath(normalized);
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    const stat = await this.stat(existingPath);
    if (!stat.isFile) {
      throw fsError("ENOTSUP", "link", existingPath, "only file hard links are supported");
    }
    await this.cp(existingPath, newPath);
  }

  async readlink(path: string): Promise<string> {
    const resolved = await this.resolveSymlinks(path, false, "readlink");
    const metadata = await this.readNodeMetadata(resolved);
    if (metadata?.kind !== "symlink" || !metadata.target) {
      throw fsError("EINVAL", "readlink", path, "not a symbolic link");
    }
    return metadata.target;
  }

  async realpath(path: string): Promise<string> {
    const resolved = await this.resolveSymlinks(path, true, "realpath");
    await this.lstatResolved(resolved);
    return resolved;
  }

  async utimes(path: string, _atime: Date, mtime: Date): Promise<void> {
    const normalized = await this.resolveSymlinks(path, true, "utimes");
    const metadata = await this.metadataForUpdate(normalized, "utimes");
    await this.writeMetadataForPath(normalized, {
      ...metadata,
      mtimeMs: mtime.getTime(),
    });
  }

  getAllPaths(): string[] {
    return Array.from(this.pathCache).sort();
  }

  async listPaths(): Promise<string[]> {
    const paths = new Set<string>([ROOT]);
    for (const key of await listKeys(this.storage, { prefix: this.contentRootPrefix() })) {
      const path = this.pathFromContentKey(key);
      if (path) {
        paths.add(path);
        for (const ancestor of ancestorsOf(path)) {
          paths.add(ancestor);
        }
      }
    }
    for (const key of await listKeys(this.storage, { prefix: this.metaRootPrefix() })) {
      const path = this.pathFromMetadataKey(key);
      if (path) {
        paths.add(path);
        for (const ancestor of ancestorsOf(path)) {
          paths.add(ancestor);
        }
      }
    }
    this.pathCache.clear();
    for (const path of paths) {
      this.pathCache.add(path);
    }
    return this.getAllPaths();
  }

  async hydratePaths(): Promise<void> {
    await this.listPaths();
  }

  private async lstatResolved(path: string): Promise<ResolvedStat> {
    const normalized = normalizePath(path);
    if (normalized === ROOT) {
      return this.statFromMetadata({
        version: 1,
        kind: "directory",
        mode: this.defaultDirectoryMode,
        mtimeMs: 0,
        size: 0,
      });
    }

    const nodeMetadata = await this.readNodeMetadata(normalized);
    if (nodeMetadata) {
      return this.statFromMetadata(nodeMetadata);
    }

    const dirMetadata = await this.readDirectoryMetadata(normalized);
    if (dirMetadata) {
      return this.statFromMetadata(dirMetadata);
    }

    const storageHead = await this.tryHead(this.contentKey(normalized));
    if (storageHead) {
      return {
        kind: "file",
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
        mode: this.defaultFileMode,
        size: storageHead.size,
        mtime: new Date(storageHead.lastModified ?? 0),
      };
    }

    if (await this.hasChildren(normalized)) {
      return {
        kind: "directory",
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        mode: this.defaultDirectoryMode,
        size: 0,
        mtime: new Date(0),
      };
    }

    throw fsError("ENOENT", "stat", path);
  }

  private async tryLstat(path: string): Promise<ResolvedStat | undefined> {
    try {
      return await this.lstatResolved(path);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private stripKind(stat: ResolvedStat): FsStat {
    const { isFile, isDirectory, isSymbolicLink, mode, size, mtime } = stat;
    return { isFile, isDirectory, isSymbolicLink, mode, size, mtime };
  }

  private statFromMetadata(metadata: OverlayNodeMetadata): ResolvedStat {
    return {
      kind: metadata.kind,
      isFile: metadata.kind === "file",
      isDirectory: metadata.kind === "directory",
      isSymbolicLink: metadata.kind === "symlink",
      mode: metadata.mode,
      size: metadata.size,
      mtime: new Date(metadata.mtimeMs),
      target: metadata.target,
    };
  }

  private async metadataForUpdate(
    path: string,
    syscall: string,
  ): Promise<OverlayNodeMetadata> {
    const normalized = normalizePath(path);
    const existing =
      (await this.readNodeMetadata(normalized)) ??
      (await this.readDirectoryMetadata(normalized));
    if (existing) {
      return existing;
    }

    const stat = await this.lstatResolved(normalized);
    if (stat.kind === "file") {
      return {
        version: 1,
        kind: "file",
        mode: stat.mode,
        mtimeMs: stat.mtime.getTime(),
        size: stat.size,
      };
    }
    if (stat.kind === "directory") {
      return {
        version: 1,
        kind: "directory",
        mode: stat.mode,
        mtimeMs: stat.mtime.getTime(),
        size: 0,
      };
    }
    throw fsError("ENOENT", syscall, path);
  }

  private async resolveSymlinksForWrite(path: string): Promise<string> {
    const normalized = normalizePath(path);
    const existing = await this.tryLstat(normalized);
    if (existing?.kind === "symlink") {
      return this.resolveSymlinks(normalized, true, "write");
    }
    const parent = await this.resolveSymlinks(dirname(normalized), true, "write");
    return joinPath(parent, basename(normalized));
  }

  private async resolveSymlinks(
    path: string,
    followFinal: boolean,
    syscall: string,
    depth = 0,
  ): Promise<string> {
    if (depth > MAX_SYMLINK_DEPTH) {
      throw fsError("ELOOP", syscall, path);
    }

    const normalized = normalizePath(path);
    if (normalized === ROOT) {
      return ROOT;
    }

    const segments = normalized.slice(1).split("/");
    let current = ROOT;

    for (let index = 0; index < segments.length; index += 1) {
      current = joinPath(current, segments[index]);
      const shouldFollow = followFinal || index < segments.length - 1;
      if (!shouldFollow) {
        continue;
      }

      const metadata = await this.readNodeMetadata(current);
      if (metadata?.kind === "symlink" && metadata.target) {
        const remaining = segments.slice(index + 1).join("/");
        const target = metadata.target.startsWith("/")
          ? metadata.target
          : joinPath(dirname(current), metadata.target);
        const next = remaining ? joinPath(target, remaining) : target;
        return this.resolveSymlinks(next, followFinal, syscall, depth + 1);
      }
    }

    return current;
  }

  private async ensureParentDirectories(path: string, syscall: string): Promise<void> {
    const normalized = normalizePath(path);
    if (normalized === ROOT) {
      return;
    }

    for (const ancestor of [...ancestorsOf(normalized), normalized]) {
      const stat = await this.tryLstat(ancestor);
      if (stat) {
        if (stat.kind !== "directory") {
          throw fsError("ENOTDIR", syscall, ancestor);
        }
        continue;
      }
      if (!this.createParentDirectories) {
        throw fsError("ENOENT", syscall, ancestor);
      }
      await this.writeDirectoryMetadata(ancestor);
      this.rememberPath(ancestor);
    }
  }

  private async copyFile(
    source: string,
    target: string,
    sourceStat: ResolvedStat,
  ): Promise<void> {
    const existing = await this.tryLstat(target);
    if (existing?.kind === "directory") {
      throw fsError("EISDIR", "cp", target);
    }

    await this.ensureParentDirectories(dirname(target), "cp");
    const sourceMetadata = await this.metadataForUpdate(source, "cp");
    if (sourceMetadata.kind !== "file") {
      throw fsError("EINVAL", "cp", source, "source is not a file");
    }

    if (this.storage.copy) {
      const targetKey = this.contentKey(target);
      let copied = false;
      try {
        await this.storage.copy(this.contentKey(source), targetKey);
        copied = true;
        await this.writeMetadataForPath(target, sourceMetadata);
      } catch (error) {
        if (copied && !existing) {
          await this.rollbackUploadedContent(targetKey, error);
        }
        throw storageError("copy", error);
      }
    } else {
      const bytes = await this.readFileBuffer(source);
      await this.writeFile(target, bytes, {
        contentType: sourceMetadata.contentType,
        metadata: sourceMetadata.metadata,
      });
      await this.writeMetadataForPath(target, sourceMetadata);
    }

    this.rememberPath(target);
    if (sourceStat.mode !== sourceMetadata.mode) {
      await this.chmod(target, sourceStat.mode);
    }
  }

  private async deleteNode(
    path: string,
    kind: OverlayNodeMetadata["kind"],
  ): Promise<void> {
    const existingMetadata = await this.readNodeMetadata(path);
    const metadataKey = this.nodeMetadataKey(path);
    let metadataDeleted = false;

    try {
      await safeDelete(this.storage, metadataKey);
      metadataDeleted = true;
      if (kind === "file") {
        await safeDelete(this.storage, this.contentKey(path));
      }
    } catch (error) {
      if (metadataDeleted && existingMetadata) {
        await this.restoreMetadataAfterFailedDelete(path, existingMetadata, error);
      }
      throw error;
    }
  }

  private async rollbackUploadedContent(
    key: string,
    originalError: unknown,
  ): Promise<void> {
    try {
      await safeDelete(this.storage, key);
    } catch (rollbackError) {
      throw new OverlayFsError(
        "ESTORAGE",
        `ESTORAGE: storage operation failed during rollback for '${key}'`,
        { cause: { originalError, rollbackError } },
      );
    }
  }

  private async restoreMetadataAfterFailedDelete(
    path: string,
    metadata: OverlayNodeMetadata,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.writeMetadataForPath(path, metadata);
    } catch (rollbackError) {
      throw new OverlayFsError(
        "ESTORAGE",
        `ESTORAGE: storage operation failed while restoring metadata for '${path}'`,
        { path, cause: { originalError, rollbackError } },
      );
    }
  }

  private async listDirectChildren(path: string): Promise<string[]> {
    const normalized = normalizePath(path);
    const names = new Set<string>();

    for (const key of await listKeys(this.storage, { prefix: this.contentDirPrefix(normalized) })) {
      const child = this.directChildFromContentKey(normalized, key);
      if (child) {
        names.add(child);
      }
    }

    for (const key of await listKeys(this.storage, { prefix: this.metaDirPrefix(normalized) })) {
      const child = this.directChildFromMetadataKey(normalized, key);
      if (child) {
        names.add(child);
      }
    }

    for (const name of names) {
      this.rememberPath(joinPath(normalized, name));
    }
    return Array.from(names);
  }

  private async hasChildren(path: string): Promise<boolean> {
    return (
      (await hasAnyKey(this.storage, this.contentDirPrefix(path))) ||
      (await hasAnyKey(this.storage, this.metaDirPrefix(path)))
    );
  }

  private async deleteDirectoryTree(path: string): Promise<void> {
    const normalized = normalizePath(path);
    for (const key of await listKeys(this.storage, { prefix: this.contentDirPrefix(normalized) })) {
      await safeDelete(this.storage, key);
    }
    for (const key of await listKeys(this.storage, { prefix: this.metaDirPrefix(normalized) })) {
      await safeDelete(this.storage, key);
    }
    await safeDelete(this.storage, this.directoryMetadataKey(normalized));
    for (const cached of [...this.pathCache]) {
      if (isDescendantOrSelf(cached, normalized)) {
        this.pathCache.delete(cached);
      }
    }
    this.pathCache.add(ROOT);
  }

  private async tryHead(key: string) {
    try {
      return await this.storage.head(key);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw storageError("head", error);
    }
  }

  private async readNodeMetadata(path: string): Promise<OverlayNodeMetadata | undefined> {
    return this.readMetadata(this.nodeMetadataKey(path));
  }

  private async readDirectoryMetadata(
    path: string,
  ): Promise<OverlayNodeMetadata | undefined> {
    return this.readMetadata(this.directoryMetadataKey(path));
  }

  private async readMetadata(key: string): Promise<OverlayNodeMetadata | undefined> {
    try {
      const file = await this.storage.download(key);
      const parsed = JSON.parse(await file.text()) as Partial<OverlayNodeMetadata>;
      if (
        parsed.version === 1 &&
        (parsed.kind === "file" ||
          parsed.kind === "directory" ||
          parsed.kind === "symlink") &&
        typeof parsed.mode === "number" &&
        typeof parsed.mtimeMs === "number" &&
        typeof parsed.size === "number"
      ) {
        return parsed as OverlayNodeMetadata;
      }
      return undefined;
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      if (error instanceof SyntaxError) {
        throw new OverlayFsError("EINVAL", `EINVAL: invalid overlay metadata at '${key}'`, {
          cause: error,
        });
      }
      throw storageError("download metadata", error);
    }
  }

  private async writeFileMetadata(
    path: string,
    options: {
      mode: number;
      mtimeMs: number;
      size: number;
      contentType?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<void> {
    await this.writeMetadataForPath(path, {
      version: 1,
      kind: "file",
      mode: options.mode,
      mtimeMs: options.mtimeMs,
      size: options.size,
      contentType: options.contentType,
      metadata: options.metadata,
    });
  }

  private async writeDirectoryMetadata(path: string): Promise<void> {
    await this.writeMetadataForPath(path, {
      version: 1,
      kind: "directory",
      mode: this.defaultDirectoryMode,
      mtimeMs: Date.now(),
      size: 0,
    });
  }

  private async writeMetadataForPath(
    path: string,
    metadata: OverlayNodeMetadata,
  ): Promise<void> {
    const key =
      metadata.kind === "directory"
        ? this.directoryMetadataKey(path)
        : this.nodeMetadataKey(path);
    await this.storage.upload(key, JSON.stringify(metadata), {
      contentType: METADATA_CONTENT_TYPE,
    });
  }

  private rememberPath(path: string): void {
    const normalized = normalizePath(path);
    this.pathCache.add(ROOT);
    this.pathCache.add(normalized);
    for (const ancestor of ancestorsOf(normalized)) {
      this.pathCache.add(ancestor);
    }
  }

  private forgetPath(path: string): void {
    this.pathCache.delete(normalizePath(path));
  }

  private contentRootPrefix(): string {
    return joinKey(this.prefix, "objects") + "/";
  }

  private metaRootPrefix(): string {
    return joinKey(this.prefix, "meta") + "/";
  }

  private contentKey(path: string): string {
    const rel = relativePath(path);
    if (!rel) {
      throw fsError("EISDIR", "open", path);
    }
    return joinKey(this.prefix, "objects", rel);
  }

  private nodeMetadataKey(path: string): string {
    const rel = relativePath(path);
    if (!rel) {
      return joinKey(this.prefix, "meta", ".root.json");
    }
    return joinKey(this.prefix, "meta", `${rel}.json`);
  }

  private directoryMetadataKey(path: string): string {
    const rel = relativePath(path);
    return rel
      ? joinKey(this.prefix, "meta", rel, ".dir.json")
      : joinKey(this.prefix, "meta", ".root.dir.json");
  }

  private contentDirPrefix(path: string): string {
    const rel = relativePath(path);
    return rel
      ? `${joinKey(this.prefix, "objects", rel)}/`
      : this.contentRootPrefix();
  }

  private metaDirPrefix(path: string): string {
    const rel = relativePath(path);
    return rel ? `${joinKey(this.prefix, "meta", rel)}/` : this.metaRootPrefix();
  }

  private directChildFromContentKey(parent: string, key: string): string | undefined {
    const prefix = this.contentDirPrefix(parent);
    if (!key.startsWith(prefix)) {
      return undefined;
    }
    const rest = key.slice(prefix.length);
    return rest.split("/")[0] || undefined;
  }

  private directChildFromMetadataKey(parent: string, key: string): string | undefined {
    const prefix = this.metaDirPrefix(parent);
    if (!key.startsWith(prefix)) {
      return undefined;
    }
    const rest = key.slice(prefix.length);
    if (!rest || rest === ".dir.json" || rest === ".root.dir.json") {
      return undefined;
    }
    const [first, ...tail] = rest.split("/");
    if (!first) {
      return undefined;
    }
    if (tail.length > 0) {
      return first;
    }
    return first.endsWith(".json") ? first.slice(0, -".json".length) : first;
  }

  private pathFromContentKey(key: string): string | undefined {
    const prefix = this.contentRootPrefix();
    if (!key.startsWith(prefix)) {
      return undefined;
    }
    const rest = key.slice(prefix.length);
    return rest ? normalizePath(`/${rest}`) : undefined;
  }

  private pathFromMetadataKey(key: string): string | undefined {
    const prefix = this.metaRootPrefix();
    if (!key.startsWith(prefix)) {
      return undefined;
    }
    const rest = key.slice(prefix.length);
    if (!rest || rest === ".root.dir.json" || rest === ".root.json") {
      return ROOT;
    }
    if (rest.endsWith("/.dir.json")) {
      return normalizePath(`/${rest.slice(0, -"/.dir.json".length)}`);
    }
    if (rest.endsWith(".json")) {
      return normalizePath(`/${rest.slice(0, -".json".length)}`);
    }
    return undefined;
  }
}
