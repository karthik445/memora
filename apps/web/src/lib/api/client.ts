import type { ApiError } from '@/types/api'
import { useAuthStore } from '@/lib/stores/auth.store'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { skipAuth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(init.headers as Record<string, string>),
  }

  if (!options.skipAuth) {
    const token = useAuthStore.getState().accessToken
    if (token) headers['Authorization'] = `Bearer ${token}`

    const tenantId = useAuthStore.getState().tenantId
    if (tenantId) headers['X-Tenant-Id'] = tenantId
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const err = data as ApiError | null
    throw new ApiRequestError(
      err?.error?.code ?? 'REQUEST_ERROR',
      err?.error?.message ?? res.statusText,
      res.status,
      err?.requestId,
    )
  }

  return data as T
}

export const api = {
  get:    <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
  post:   <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch:  <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put:    <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'DELETE' }),

  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form }),
}
