import type { ApiErrorBody, ErrorCode } from '@hostels/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const DEFAULT_STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  otp_rate_limited: 429,
  internal: 500,
};

export class AppError extends Error {
  status: ContentfulStatusCode;
  constructor(
    public code: ErrorCode,
    message: string,
    status?: ContentfulStatusCode,
    public issues?: ApiErrorBody['issues'],
  ) {
    super(message);
    this.status = status ?? DEFAULT_STATUS[code] ?? 409;
  }

  toBody(): ApiErrorBody {
    return { error: this.code, message: this.message, ...(this.issues ? { issues: this.issues } : {}) };
  }
}

export const notFound = (what = 'Resource') => new AppError('not_found', `${what} not found`);
export const forbidden = (message = 'You do not have access to this') => new AppError('forbidden', message);
