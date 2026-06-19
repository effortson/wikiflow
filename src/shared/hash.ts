import { toArrayBuffer } from "./buffer";

/** SHA-256 hex digest of raw bytes (Web Crypto). */
export async function sha256Hex(
  data: ArrayBuffer | ArrayBufferView,
): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text).buffer);
}
