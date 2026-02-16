export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export interface PaginationMeta {
  hasMore: boolean;
  nextCursor: string | null;
  total?: number;
}

export interface ApiResponse<T> {
  data: T;
  pagination?: PaginationMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface JwtPayload {
  userId: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
}
