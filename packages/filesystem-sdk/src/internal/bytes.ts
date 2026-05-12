import type { Body, BufferEncoding, FileContent, ReadFileOptions, WriteFileOptions } from "../types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const getEncoding = (
  options?: ReadFileOptions | WriteFileOptions | BufferEncoding,
): BufferEncoding =>
  typeof options === "string" ? options : options?.encoding ?? "utf8";

export const toBytes = async (
  content: Body | FileContent,
  options?: WriteFileOptions | BufferEncoding,
): Promise<Uint8Array> => {
  if (typeof content === "string") {
    return encodeString(content, getEncoding(options));
  }
  if (content instanceof Uint8Array) {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  if (content instanceof Blob) {
    return new Uint8Array(await content.arrayBuffer());
  }
  return drainStream(content);
};

export const decodeBytes = (
  bytes: Uint8Array,
  options?: ReadFileOptions | BufferEncoding,
): string => {
  const encoding = getEncoding(options);
  switch (encoding) {
    case "utf8":
    case "utf-8":
      return decoder.decode(bytes);
    case "ascii":
      return Array.from(bytes, (byte) => String.fromCharCode(byte & 0x7f)).join("");
    case "binary":
    case "latin1":
      return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    case "base64":
      return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
    case "hex":
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
};

export const encodeString = (value: string, encoding: BufferEncoding): Uint8Array => {
  switch (encoding) {
    case "utf8":
    case "utf-8":
      return encoder.encode(value);
    case "ascii":
      return Uint8Array.from(value, (char) => char.charCodeAt(0) & 0x7f);
    case "binary":
    case "latin1":
      return Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    case "base64":
      return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    case "hex":
      return Uint8Array.from(value.match(/.{1,2}/g) ?? [], (byte) =>
        Number.parseInt(byte, 16),
      );
  }
};

export const concatBytes = (first: Uint8Array, second: Uint8Array): Uint8Array => {
  const out = new Uint8Array(first.byteLength + second.byteLength);
  out.set(first, 0);
  out.set(second, first.byteLength);
  return out;
};

export const latin1ByteString = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

export const arrayBufferFromBytes = (bytes: Uint8Array): ArrayBuffer =>
  new Uint8Array(bytes).buffer;

const drainStream = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = stream.getReader();
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
