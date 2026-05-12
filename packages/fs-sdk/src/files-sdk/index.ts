import { OverlayFs } from "../overlay-fs.js";
import type { ObjectStorage, OverlayFsOptions } from "../types.js";

export type FilesSdkLike = Partial<ObjectStorage> & { name?: string };

export interface OverlayFromFilesSdkOptions
  extends Omit<OverlayFsOptions, "storage"> {
  files: FilesSdkLike;
}

const REQUIRED_STORAGE_METHODS = [
  "upload",
  "download",
  "head",
  "delete",
  "list",
] as const;

export const filesSdkStorage = (files: FilesSdkLike): ObjectStorage => {
  for (const method of REQUIRED_STORAGE_METHODS) {
    if (typeof files[method] !== "function") {
      throw new TypeError(
        `files-sdk storage adapter requires a ${method}() method`,
      );
    }
  }

  const storage = files as ObjectStorage;
  return {
    name: files.name ?? "files-sdk",
    upload: storage.upload.bind(files),
    download: storage.download.bind(files),
    head: storage.head.bind(files),
    delete: storage.delete.bind(files),
    copy: storage.copy?.bind(files),
    list: storage.list.bind(files),
  };
};

export const overlayFromFilesSdk = (
  options: OverlayFromFilesSdkOptions,
): OverlayFs =>
  new OverlayFs({
    ...options,
    storage: filesSdkStorage(options.files),
  });
