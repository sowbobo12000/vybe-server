import { PaginationMeta, PaginationParams } from '../types/common';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse and validate pagination parameters from query string.
 */
export function parsePaginationParams(query: {
  cursor?: string;
  limit?: string | number;
}): PaginationParams {
  const limit = Math.min(
    Math.max(1, Number(query.limit) || DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  return {
    cursor: query.cursor || undefined,
    limit,
  };
}

/**
 * Build Prisma cursor-based pagination arguments.
 */
export function buildCursorPagination(params: PaginationParams): {
  take: number;
  skip: number;
  cursor?: { id: string };
} {
  const take = params.limit ?? DEFAULT_LIMIT;

  if (params.cursor) {
    return {
      take: take + 1, // Take one extra to know if there are more
      skip: 1, // Skip the cursor item itself
      cursor: { id: params.cursor },
    };
  }

  return {
    take: take + 1,
    skip: 0,
  };
}

/**
 * Process the results from a cursor-based query and build pagination meta.
 */
export function buildPaginationMeta<T extends { id: string }>(
  items: T[],
  limit: number,
  total?: number,
): { items: T[]; pagination: PaginationMeta } {
  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? resultItems[resultItems.length - 1]?.id ?? null : null;

  return {
    items: resultItems,
    pagination: {
      hasMore,
      nextCursor,
      ...(total !== undefined && { total }),
    },
  };
}
