import { isNotFoundError, storageError } from "./errors.js";
import type { ObjectStorage, StorageListOptions } from "../types.js";

export const listKeys = async (
  storage: ObjectStorage,
  options: StorageListOptions = {},
): Promise<string[]> => {
  const keys: string[] = [];
  let cursor = options.cursor;

  do {
    let page;
    try {
      page = await storage.list({
        ...options,
        cursor,
        limit: options.limit ?? 1000,
      });
    } catch (error) {
      throw storageError("list", error);
    }
    for (const item of page.items) {
      keys.push(item.key);
    }
    cursor = page.cursor;
  } while (cursor);

  return keys;
};

export const hasAnyKey = async (
  storage: ObjectStorage,
  prefix: string,
): Promise<boolean> => {
  try {
    const page = await storage.list({ prefix, limit: 1 });
    return page.items.length > 0;
  } catch (error) {
    throw storageError("list", error);
  }
};

export const safeDelete = async (
  storage: ObjectStorage,
  key: string,
): Promise<void> => {
  try {
    await storage.delete(key);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw storageError("delete", error);
    }
  }
};
