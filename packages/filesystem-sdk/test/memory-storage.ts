import { arrayBufferFromBytes } from "../src/internal/bytes.js";
import type {
  Body,
  ObjectStorage,
  StorageListOptions,
  StoredObject,
} from "../src/types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface MemoryEntry {
  bytes: Uint8Array;
  contentType: string;
  lastModified: number;
  metadata?: Record<string, string>;
}

export class MemoryStorage implements ObjectStorage {
  readonly name = "memory";
  readonly entries = new Map<string, MemoryEntry>();

  async upload(key: string, body: Body, options?: { contentType?: string; metadata?: Record<string, string> }) {
    const bytes = await bodyToBytes(body);
    this.entries.set(key, {
      bytes,
      contentType: options?.contentType ?? "application/octet-stream",
      lastModified: Date.now(),
      metadata: options?.metadata,
    });
    return {
      key,
      size: bytes.byteLength,
      contentType: options?.contentType ?? "application/octet-stream",
      lastModified: Date.now(),
    };
  }

  async download(key: string): Promise<StoredObject> {
    return this.toStoredObject(key);
  }

  async head(key: string): Promise<StoredObject> {
    return this.toStoredObject(key);
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async copy(from: string, to: string): Promise<void> {
    const entry = this.entries.get(from);
    if (!entry) {
      throw Object.assign(new Error(`ENOENT: ${from}`), { code: "ENOENT" });
    }
    this.entries.set(to, {
      ...entry,
      bytes: new Uint8Array(entry.bytes),
      lastModified: Date.now(),
    });
  }

  async list(options?: StorageListOptions) {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;
    const sorted = Array.from(this.entries.keys())
      .filter((key) => key.startsWith(prefix))
      .sort();
    const start = options?.cursor
      ? sorted.findIndex((key) => key > options.cursor!)
      : 0;
    const page = sorted.slice(start < 0 ? sorted.length : start, (start < 0 ? sorted.length : start) + limit);
    return {
      items: await Promise.all(page.map((key) => this.toStoredObject(key))),
      ...(page.length > 0 && page.at(-1) !== sorted.at(-1)
        ? { cursor: page.at(-1) }
        : {}),
    };
  }

  private async toStoredObject(key: string): Promise<StoredObject> {
    const entry = this.entries.get(key);
    if (!entry) {
      throw Object.assign(new Error(`ENOENT: ${key}`), { code: "ENOENT" });
    }
    return {
      key,
      size: entry.bytes.byteLength,
      type: entry.contentType,
      lastModified: entry.lastModified,
      metadata: entry.metadata,
      arrayBuffer: async () => arrayBufferFromBytes(entry.bytes),
      text: async () => decoder.decode(entry.bytes),
      stream: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(entry.bytes);
            controller.close();
          },
        }),
      blob: async () => new Blob([arrayBufferFromBytes(entry.bytes)], { type: entry.contentType }),
    };
  }
}

const bodyToBytes = async (body: Body): Promise<Uint8Array> => {
  if (typeof body === "string") {
    return encoder.encode(body);
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
};
