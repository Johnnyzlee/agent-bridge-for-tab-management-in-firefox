import { once } from "node:events";
import type { Readable, Writable } from "node:stream";

export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;

export function encodeFrame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export function decodeFrame(buffer: Buffer): unknown {
  if (buffer.length < 4) {
    throw new Error("Truncated native message header.");
  }
  const length = buffer.readUInt32LE(0);
  if (length > MAX_NATIVE_MESSAGE_BYTES) {
    throw new Error("Native message exceeds the size limit.");
  }
  if (buffer.length < 4 + length) {
    throw new Error("Truncated native message body.");
  }
  return JSON.parse(buffer.subarray(4, 4 + length).toString("utf8"));
}

async function readExactly(stream: Readable, length: number): Promise<Buffer | null> {
  if (length === 0) {
    if (stream.readableEnded) return null;
    return Buffer.alloc(0);
  }
  const chunks: Buffer[] = [];
  let remaining = length;
  while (remaining > 0) {
    const chunk = stream.read(remaining) as Buffer | null;
    if (chunk !== null && chunk.length > 0) {
      chunks.push(chunk);
      remaining -= chunk.length;
      continue;
    }
    if (stream.readableEnded) {
      return null;
    }
    await once(stream, "readable");
  }
  return Buffer.concat(chunks);
}

export async function readFramedMessage(stream: Readable, maxBytes: number): Promise<unknown | null> {
  const header = await readExactly(stream, 4);
  if (header === null) {
    return null;
  }
  const length = header.readUInt32LE(0);
  if (length > maxBytes) {
    throw new Error("Native message exceeds the size limit.");
  }
  const body = await readExactly(stream, length);
  if (body === null) {
    throw new Error("Truncated native message body.");
  }
  return JSON.parse(body.toString("utf8"));
}

export function writeFramedMessage(stream: Writable, message: unknown): void {
  const frame = encodeFrame(message);
  stream.write(frame);
}
