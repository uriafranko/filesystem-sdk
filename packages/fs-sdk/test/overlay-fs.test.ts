import { describe, expect, test } from "vitest";

import { OverlayFs } from "../src/index.js";
import { filesSdkStorage, overlayFromFilesSdk } from "../src/files-sdk/index.js";
import { createJustBashFs } from "../src/just-bash/index.js";
import { MemoryStorage } from "./memory-storage.js";

class CopyTrackingStorage extends MemoryStorage {
  readonly copies: Array<{ from: string; to: string }> = [];

  override async copy(from: string, to: string): Promise<void> {
    this.copies.push({ from, to });
    await super.copy(from, to);
  }
}

class FailingMetadataUploadStorage extends MemoryStorage {
  override async upload(
    key: string,
    body: Parameters<MemoryStorage["upload"]>[1],
    options?: Parameters<MemoryStorage["upload"]>[2],
  ) {
    if (key.startsWith("meta/")) {
      throw Object.assign(new Error(`failed metadata upload: ${key}`), {
        code: "StorageError",
      });
    }
    return super.upload(key, body, options);
  }
}

class FailingContentDeleteStorage extends MemoryStorage {
  failContentDelete = false;

  override async delete(key: string): Promise<void> {
    if (this.failContentDelete && key.startsWith("objects/")) {
      throw Object.assign(new Error(`failed content delete: ${key}`), {
        code: "StorageError",
      });
    }
    await super.delete(key);
  }
}

describe("OverlayFs", () => {
  test("writes, reads, stats, and lists files through object storage", async () => {
    const storage = new MemoryStorage();
    const fs = new OverlayFs({ storage, prefix: "session" });

    await fs.writeFile("/home/user/a.txt", "hello");

    expect(await fs.readFile("/home/user/a.txt")).toBe("hello");
    const stat = await fs.stat("/home/user/a.txt");
    expect(stat.isFile).toBe(true);
    expect(stat.size).toBe(5);
    expect(await fs.readdir("/home/user")).toEqual(["a.txt"]);
    expect(await fs.readdir("/home")).toEqual(["user"]);
  });

  test("supports explicit directories and recursive removal", async () => {
    const fs = new OverlayFs({ storage: new MemoryStorage() });

    await fs.mkdir("/tmp/work", { recursive: true });
    await fs.writeFile("/tmp/work/file.txt", "x");

    expect((await fs.stat("/tmp/work")).isDirectory).toBe(true);
    await fs.rm("/tmp", { recursive: true });
    expect(await fs.exists("/tmp/work/file.txt")).toBe(false);
  });

  test("supports symlinks and realpath", async () => {
    const fs = new OverlayFs({ storage: new MemoryStorage() });

    await fs.writeFile("/target.txt", "target");
    await fs.symlink("/target.txt", "/link.txt");

    expect(await fs.readlink("/link.txt")).toBe("/target.txt");
    expect(await fs.realpath("/link.txt")).toBe("/target.txt");
    expect(await fs.readFile("/link.txt")).toBe("target");
    expect((await fs.lstat("/link.txt")).isSymbolicLink).toBe(true);
    expect((await fs.stat("/link.txt")).isFile).toBe(true);
  });

  test("copies and moves directories", async () => {
    const fs = new OverlayFs({ storage: new MemoryStorage() });

    await fs.writeFile("/src/a.txt", "a");
    await fs.writeFile("/src/nested/b.txt", "b");
    await fs.cp("/src", "/dst", { recursive: true });
    await fs.mv("/dst", "/moved");

    expect(await fs.readFile("/moved/a.txt")).toBe("a");
    expect(await fs.readFile("/moved/nested/b.txt")).toBe("b");
    expect(await fs.exists("/dst/a.txt")).toBe(false);
  });

  test("rejects recursive copies and moves into the source tree", async () => {
    const fs = new OverlayFs({ storage: new MemoryStorage() });

    await fs.writeFile("/src/a.txt", "a");

    await expect(fs.cp("/src", "/src/nested", { recursive: true })).rejects.toMatchObject({
      code: "EINVAL",
    });
    await expect(fs.mv("/src", "/src/nested")).rejects.toMatchObject({
      code: "EINVAL",
    });
    expect(await fs.exists("/src/nested/a.txt")).toBe(false);
    expect(await fs.readFile("/src/a.txt")).toBe("a");
  });

  test("uses storage-level copy when available", async () => {
    const storage = new CopyTrackingStorage();
    const fs = new OverlayFs({ storage });

    await fs.writeFile("/source.txt", "hello", {
      contentType: "text/plain",
      metadata: { owner: "test" },
    });
    await fs.cp("/source.txt", "/target.txt");

    expect(storage.copies).toEqual([
      { from: "objects/source.txt", to: "objects/target.txt" },
    ]);
    expect(await fs.readFile("/target.txt")).toBe("hello");

    const rawMetadata = await storage.download("meta/target.txt.json");
    expect(JSON.parse(await rawMetadata.text())).toMatchObject({
      kind: "file",
      contentType: "text/plain",
      metadata: { owner: "test" },
      size: 5,
    });
  });

  test("cleans new file content when metadata upload fails", async () => {
    const storage = new FailingMetadataUploadStorage();
    const fs = new OverlayFs({ storage });

    await expect(fs.writeFile("/broken.txt", "broken")).rejects.toMatchObject({
      code: "ESTORAGE",
    });

    expect(storage.entries.has("objects/broken.txt")).toBe(false);
  });

  test("restores metadata when file removal fails after metadata deletion", async () => {
    const storage = new FailingContentDeleteStorage();
    const fs = new OverlayFs({ storage });

    await fs.writeFile("/kept.txt", "kept", {
      metadata: { state: "original" },
    });
    storage.failContentDelete = true;

    await expect(fs.rm("/kept.txt")).rejects.toMatchObject({
      code: "ESTORAGE",
    });

    expect(await fs.readFile("/kept.txt")).toBe("kept");
    const rawMetadata = await storage.download("meta/kept.txt.json");
    expect(JSON.parse(await rawMetadata.text())).toMatchObject({
      metadata: { state: "original" },
    });
  });

  test("adapts files-sdk-compatible storage", async () => {
    const storage = new MemoryStorage();
    const fs = overlayFromFilesSdk({
      files: filesSdkStorage(storage),
      prefix: "files",
    });

    await fs.writeFile("/doc.md", "# title");

    expect(await fs.readFile("/doc.md")).toBe("# title");
  });

  test("rejects incomplete files-sdk-compatible storage", () => {
    expect(() => filesSdkStorage({ name: "incomplete" })).toThrow(
      "requires a upload() method",
    );
  });

  test("creates a just-bash compatible filesystem", async () => {
    const fs = createJustBashFs({ storage: new MemoryStorage(), prefix: "bash" });

    await fs.writeFile("/home/user/test.txt", "ok");
    await fs.hydratePaths();

    expect(await fs.readFile("/home/user/test.txt")).toBe("ok");
    expect(fs.getAllPaths()).toContain("/home/user/test.txt");
    expect(await fs.readFileBytes("/home/user/test.txt")).toBe("ok");
  });
});
