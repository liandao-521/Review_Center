export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = payload?.message;
    throw new Error(Array.isArray(message) ? message.join('；') : message || '请求失败，请稍后重试');
  }
  return payload as T;
}

export const imageUrl = (fileName: string) => `/api/files/${encodeURIComponent(fileName)}`;
