import { ApiError } from './errors';

interface ApiResponseLike<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Awaits a generated-client call and normalises failures into `ApiError`
 * (RFC 7807 `detail` included): a rejected fetch → status 0 (network), any
 * non-2xx → its status + `detail`. Success resolves to the typed body
 * (`undefined` for 204/empty responses). Keeps hooks free of try/catch
 * boilerplate (spec F0 §5, F1 §4).
 */
export async function callApi<T>(call: PromiseLike<ApiResponseLike<T>>): Promise<T> {
  let result: ApiResponseLike<T>;
  try {
    result = await call;
  } catch (cause) {
    throw ApiError.network(cause);
  }
  if (!result.response.ok) throw ApiError.fromResponse(result.response, result.error);
  return result.data as T;
}
