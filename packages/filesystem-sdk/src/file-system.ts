import { Files, type Adapter, type FilesOptions } from "files-sdk";

import { filesSdkStorage, type FilesSdkLike } from "./files-sdk/index.js";
import type { JustBashCompatibleFileSystem } from "./just-bash/index.js";
import { OverlayFs } from "./overlay-fs.js";
import type { OverlayFsOptions } from "./types.js";

export interface FileSystemFromFilesOptions
  extends Omit<OverlayFsOptions, "storage"> {
  files: FilesSdkLike;
}

export type FileSystemFromAdapterOptions<A extends Adapter = Adapter> =
  FilesOptions<A> & Omit<OverlayFsOptions, "storage">;

export type FileSystemOptions<A extends Adapter = Adapter> =
  | FileSystemFromFilesOptions
  | FileSystemFromAdapterOptions<A>;

export class FileSystem<A extends Adapter = Adapter>
  extends OverlayFs
  implements JustBashCompatibleFileSystem
{
  readonly files: FilesSdkLike;

  constructor(options: FileSystemOptions<A>) {
    const files = isFromFilesOptions(options)
      ? options.files
      : new Files(filesOptionsFrom(options));

    super({
      storage: filesSdkStorage(files),
      prefix: options.prefix,
      createParentDirectories: options.createParentDirectories,
      defaultFileMode: options.defaultFileMode,
      defaultDirectoryMode: options.defaultDirectoryMode,
      defaultSymlinkMode: options.defaultSymlinkMode,
    });

    this.files = files;
  }
}

const isFromFilesOptions = <A extends Adapter>(
  options: FileSystemOptions<A>,
): options is FileSystemFromFilesOptions => "files" in options;

const filesOptionsFrom = <A extends Adapter>({
  prefix: _prefix,
  createParentDirectories: _createParentDirectories,
  defaultFileMode: _defaultFileMode,
  defaultDirectoryMode: _defaultDirectoryMode,
  defaultSymlinkMode: _defaultSymlinkMode,
  ...filesOptions
}: FileSystemFromAdapterOptions<A>): FilesOptions<A> => filesOptions;
