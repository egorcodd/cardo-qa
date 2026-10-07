import { upstream, fail } from "../../../packages/shared/http.ts";
export type ServiceUrls = {
  customer: string;
  banking: string;
  engagement: string;
  rates: string;
};
export async function call(
  url: string,
  options: RequestInit,
  requestId: string,
) {
  try {
    return await upstream(url, options, requestId);
  } catch {
    fail(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Сервис временно недоступен. Попробуй ещё раз",
    );
  }
}
