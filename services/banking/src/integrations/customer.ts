import { upstream, fail } from "../../../../packages/shared/http.ts";
export type ResolvedCustomer = { id: string; name: string; phone: string };
export type CustomerClient = {
  resolve(lookup: { phone: string } | { id: string }, requestId: string): Promise<ResolvedCustomer>;
};
export function createCustomerClient(baseUrl: string): CustomerClient {
  return {
    async resolve(lookup, requestId) {
      let response: Response;
      try {
        response = await upstream(
          baseUrl + "/internal/users/resolve?" + new URLSearchParams(lookup),
          {},
          requestId,
        );
      } catch {
        fail(503, "CUSTOMER_UNAVAILABLE", "Поиск клиентов временно недоступен");
      }
      if (response.status === 404)
        fail(404, "RECIPIENT_NOT_FOUND", "Клиент Cardo не найден");
      if (!response.ok)
        fail(503, "CUSTOMER_UNAVAILABLE", "Поиск клиентов временно недоступен");
      let data: ResolvedCustomer;
      try {
        data = (await response.json()) as ResolvedCustomer;
      } catch {
        fail(503, "CUSTOMER_UNAVAILABLE", "Поиск клиентов временно недоступен");
      }
      if (
        !data || typeof data !== "object" ||
        typeof data.id !== "string" ||
        !/^[0-9a-f-]{36}$/.test(data.id) ||
        typeof data.name !== "string" ||
        typeof data.phone !== "string"
      )
        fail(503, "CUSTOMER_UNAVAILABLE", "Поиск клиентов временно недоступен");
      return data;
    },
  };
}
