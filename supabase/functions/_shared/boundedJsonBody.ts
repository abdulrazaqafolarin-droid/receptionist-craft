/** Read and parse a JSON request without buffering more than the configured limit. */
export type BoundedJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: "invalid_json" | "request_too_large" };

export async function readBoundedJsonBody(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<BoundedJsonBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    return { ok: false, status: 413, error: "request_too_large" };
  }
  if (!request.body) return { ok: false, status: 400, error: "invalid_json" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // The stream may already be closed; the limit still applies.
      }
      return { ok: false, status: 413, error: "request_too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}
