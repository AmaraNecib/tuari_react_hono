/**
 * Pagination utilities for list operations.
 * Prevents unbounded queries and enables efficient data fetching.
 */

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export class Paginator {
  /** Default limit for list operations */
  static readonly DEFAULT_LIMIT = 50;
  /** Maximum allowed limit */
  static readonly MAX_LIMIT = 500;

  /**
   * Normalize pagination parameters.
   * Returns safe limit and offset values.
   */
  static normalize(params?: PaginationParams): { limit: number; offset: number } {
    let limit = params?.limit ?? this.DEFAULT_LIMIT;
    let offset = params?.offset ?? 0;

    // Enforce bounds
    limit = Math.min(Math.max(limit, 1), this.MAX_LIMIT);
    offset = Math.max(offset, 0);

    return { limit, offset };
  }

  /**
   * Paginate an array of items.
   * Useful for in-memory pagination of query results.
   */
  static paginate<T>(
    items: T[],
    params?: PaginationParams,
  ): PaginatedResult<T> {
    const { limit, offset } = this.normalize(params);
    const total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);

    return {
      items: paginatedItems,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Create paginated response from items.
   */
  static createResult<T>(
    items: T[],
    total: number,
    limit: number,
    offset: number,
  ): PaginatedResult<T> {
    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }
}
