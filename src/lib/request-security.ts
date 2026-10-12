export class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export function securityConfig() {
  const enabled = process.env.TURNSTILE_ENABLED === "true";
  return {
    enabled,
    siteKey: enabled ? process.env.TURNSTILE_SITE_KEY || "" : "",
  };
}
export async function readLimitedJson(req: Request, limit: number) {
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new RequestError("Yêu cầu phải dùng JSON.", 415);
  if (Number(req.headers.get("content-length")) > limit)
    throw new RequestError("Dữ liệu gửi quá lớn.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError("Thiếu dữ liệu.", 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError("Dữ liệu gửi quá lớn.", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new RequestError("Dữ liệu JSON không hợp lệ.", 400);
  }
}
export async function verifyTurnstile(
  value: unknown,
  action: string,
  hostname: string,
) {
  if (!securityConfig().enabled) return;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !securityConfig().siteKey)
    throw new RequestError(
      "Xác minh chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
      503,
    );
  if (typeof value !== "string" || !value || value.length > 2048)
    throw new RequestError("Vui lòng xác minh trước khi tiếp tục.", 403);
  let data;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({ secret, response: value }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error();
    data = await response.json();
  } catch {
    throw new RequestError(
      "Không kết nối được dịch vụ xác minh. Hãy thử lại; thông tin của bạn vẫn được giữ.",
      503,
    );
  }
  if (!data.success || data.action !== action || data.hostname !== hostname)
    throw new RequestError(
      "Xác minh thất bại hoặc hết hạn. Hãy xác minh lại.",
      403,
    );
}
