/** A page of results, as used by the list screens. */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** Normalised error shape produced by the error interceptor. */
export interface ApiError {
  status: number;
  message: string;
}
