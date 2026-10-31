export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  idempotencyKey?: string;
}

export class ApiError extends Error {
  public statusCode: number;
  public code?: string;
  public details?: unknown;

  constructor(message: string, statusCode: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Robust centralized API client with timeout, cancellation,
 * idempotency key support, and consistent error handling.
 */
export async function apiClient<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const timeoutMs = options?.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  // If caller provided an external signal, propagate it
  if (options?.signal) {
    options.signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort(options.signal?.reason);
    });
  }

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (options?.idempotencyKey) {
    defaultHeaders['Idempotency-Key'] = options.idempotencyKey;
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...defaultHeaders,
        ...(options?.headers as Record<string, string>),
      },
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error?.message ||
        response.statusText ||
        'Backend operation failed';
      const code = data?.code || data?.error?.code || 'API_ERROR';
      const details = data?.details || data?.error?.details;
      throw new ApiError(message, response.status, code, details);
    }

    return data as T;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError) {
      throw error;
    }

    // Check for Abort / Timeout errors
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        `Request to ${endpoint} was aborted or timed out (${timeoutMs}ms)`,
        408,
        'REQUEST_TIMEOUT'
      );
    }

    // Network / unreachable server errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError(
        'Backend service unreachable. Please ensure the DispatchGrid API server is active on port 5000.',
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    const message = error instanceof Error ? error.message : 'An unexpected network error occurred';
    throw new ApiError(message, 500, 'NETWORK_ERROR');
  }
}
