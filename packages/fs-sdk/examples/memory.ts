import {
  FilesError,
  createStoredFile,
  type Adapter,
  type Body,
  type ListOptions,
  type ListResult,
  type StoredFile,
  type UploadOptions,
  type UploadResult,
} from "files-sdk";
import { FileSystem } from "@uriafranko/fs-sdk";

// Memory is implemented as a files-sdk adapter; fs-sdk still only wraps files-sdk.
interface MemoryEntry {
  bytes: Uint8Array;
  contentType: string;
  lastModified: number;
  etag: string;
  metadata?: Record<string, string>;
}

const memory = (): Adapter<Map<string, MemoryEntry>> => {
  const entries = new Map<string, MemoryEntry>();

  return {
    name: "memory",
    raw: entries,

    async upload(
      key: string,
      body: Body,
      options?: UploadOptions,
    ): Promise<UploadResult> {
      const bytes = await bodyToBytes(body);
      const contentType = options?.contentType ?? "application/octet-stream";
      const entry = {
        bytes,
        contentType,
        lastModified: Date.now(),
        etag: crypto.randomUUID(),
        metadata: options?.metadata,
      };

      entries.set(key, entry);

      return {
        key,
        size: bytes.byteLength,
        contentType,
        etag: entry.etag,
        lastModified: entry.lastModified,
      };
    },

    async download(key: string): Promise<StoredFile> {
      return storedFile(key, entryFor(entries, key));
    },

    async head(key: string): Promise<StoredFile> {
      return storedFile(key, entryFor(entries, key));
    },

    async delete(key: string): Promise<void> {
      entries.delete(key);
    },

    async copy(from: string, to: string): Promise<void> {
      const entry = entryFor(entries, from);
      entries.set(to, {
        ...entry,
        bytes: new Uint8Array(entry.bytes),
        lastModified: Date.now(),
        etag: crypto.randomUUID(),
      });
    },

    async list(options?: ListOptions): Promise<ListResult> {
      const prefix = options?.prefix ?? "";
      const limit = options?.limit ?? 1000;
      const keys = Array.from(entries.keys())
        .filter((key) => key.startsWith(prefix))
        .sort();
      const pageStart = options?.cursor
        ? keys.findIndex((key) => key > options.cursor!)
        : 0;
      const start = pageStart < 0 ? keys.length : pageStart;
      const page = keys.slice(start, start + limit);
      const last = page.at(-1);

      return {
        items: page.map((key) => storedFile(key, entryFor(entries, key))),
        ...(last && last !== keys.at(-1) ? { cursor: last } : {}),
      };
    },

    async url(key: string): Promise<string> {
      entryFor(entries, key);
      return `memory://${key}`;
    },

    async signedUploadUrl() {
      throw new Error("signedUploadUrl is not supported by the memory adapter");
    },
  };
};

const fs = new FileSystem({
  adapter: memory(),
  prefix: "examples/memory",
});

const main = async () => {
  await fs.writeFile("/workspace/readme.md", "# Stored through files-sdk memory\n", {
    contentType: "text/markdown",
  });
  await fs.symlink("/workspace/readme.md", "/workspace/current.md");

  console.log({
    workspace: await fs.readdir("/workspace"),
    current: await fs.readFile("/workspace/current.md"),
  });
};

main().catch((error: unknown) => {
  console.error(error);
  throw error;
});

function storedFile(key: string, entry: MemoryEntry): StoredFile {
  return createStoredFile(
    {
      key,
      size: entry.bytes.byteLength,
      type: entry.contentType,
      lastModified: entry.lastModified,
      etag: entry.etag,
      metadata: entry.metadata,
    },
    { kind: "buffer", data: entry.bytes },
  );
}

function entryFor(
  entries: Map<string, MemoryEntry>,
  key: string,
): MemoryEntry {
  const entry = entries.get(key);
  if (!entry) {
    throw new FilesError("NotFound", `Not found: ${key}`);
  }
  return entry;
}

async function bodyToBytes(body: Body): Promise<Uint8Array> {
  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }
  if (body instanceof Uint8Array) {
    return body;
  }
  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
