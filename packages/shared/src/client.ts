import type { RequestOtpInput, UpdateMeInput, VerifyOtpInput } from './schemas';
import type { ApiErrorBody, AuthSession, ErrorCode, Health, OtpSent, User } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public issues?: ApiErrorBody['issues'],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenSource = () => string | null | undefined | Promise<string | null | undefined>;
type Query = Record<string, string | number | boolean | undefined | null>;

export type RequestOptions = { method?: string; body?: unknown; query?: Query; headers?: Record<string, string> };

/** Typed API client shared by the website and the mobile app. */
export function createApiClient(baseUrl: string, getToken: TokenSource = () => null, fetchImpl: typeof fetch = fetch) {
  const base = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetchImpl(url.toString(), {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      const body = (data ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(res.status, body.error ?? 'internal', body.message ?? `Request failed (${res.status})`, body.issues);
    }
    return data as T;
  }

  return {
    request,
    health: () => request<Health>('/'),
    auth: {
      requestOtp: (input: RequestOtpInput) => request<OtpSent>('/auth/otp', { body: input }),
      verifyOtp: (input: VerifyOtpInput) => request<AuthSession>('/auth/verify', { body: input }),
      logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
    },
    me: {
      get: () => request<User>('/me'),
      update: (input: UpdateMeInput) => request<User>('/me', { method: 'PATCH', body: input }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
