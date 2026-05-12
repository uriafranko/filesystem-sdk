import { OverlayFs } from "../overlay-fs.js";
import type {
  BufferEncoding,
  CpOptions,
  DirentEntry,
  FileContent,
  FsStat,
  MkdirOptions,
  OverlayFsOptions,
  ReadFileOptions,
  RmOptions,
  WriteFileOptions,
} from "../types.js";

export interface JustBashCompatibleFileSystem {
  readFile(
    path: string,
    options?: ReadFileOptions | BufferEncoding,
  ): Promise<string>;
  readFileBytes?(path: string): Promise<string>;
  readFileBuffer(path: string): Promise<Uint8Array>;
  writeFile(
    path: string,
    content: FileContent,
    options?: WriteFileOptions | BufferEncoding,
  ): Promise<void>;
  appendFile(
    path: string,
    content: FileContent,
    options?: WriteFileOptions | BufferEncoding,
  ): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FsStat>;
  lstat(path: string): Promise<FsStat>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  readdir(path: string): Promise<string[]>;
  readdirWithFileTypes?(path: string): Promise<DirentEntry[]>;
  rm(path: string, options?: RmOptions): Promise<void>;
  cp(src: string, dest: string, options?: CpOptions): Promise<void>;
  mv(src: string, dest: string): Promise<void>;
  resolvePath(base: string, path: string): string;
  getAllPaths(): string[];
  chmod(path: string, mode: number): Promise<void>;
  symlink(target: string, linkPath: string): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  readlink(path: string): Promise<string>;
  realpath(path: string): Promise<string>;
  utimes(path: string, atime: Date, mtime: Date): Promise<void>;
}

export class JustBashOverlayFs
  extends OverlayFs
  implements JustBashCompatibleFileSystem {}

export const createJustBashFs = (
  options: OverlayFsOptions,
): JustBashOverlayFs => new JustBashOverlayFs(options);
