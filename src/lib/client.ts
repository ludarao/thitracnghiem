export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "Không nhận được phản hồi từ hệ thống. Hãy thử lại; bài đang làm vẫn được giữ trên máy.",
    );
  const data = await response.json();
  if (!response.ok || data.success === false)
    throw new ApiError(
      data.error || "Không thể kết nối hệ thống.",
      response.status,
      data.errorCode,
    );
  return data;
}
