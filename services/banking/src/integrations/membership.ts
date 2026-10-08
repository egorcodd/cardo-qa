import { upstream, fail } from "../../../../packages/shared/http.ts";
export type Membership = {
  premium: boolean;
  plan: "standard" | "plus";
  expiresAt: string | null;
};
export type MembershipClient = {
  current(userId: string, requestId: string): Promise<Membership>;
};
export function createMembershipClient(baseUrl: string): MembershipClient {
  return {
    async current(userId, requestId) {
      let data: Membership;
      try {
        const response = await upstream(
          baseUrl + "/api/membership",
          { headers: { "X-User-Id": userId } },
          requestId,
        );
        if (!response.ok) throw new Error("Membership unavailable");
        data = (await response.json()) as Membership;
      } catch {
        fail(503, "MEMBERSHIP_UNAVAILABLE", "Тариф временно недоступен");
      }
      if (
        !data ||
        typeof data !== "object" ||
        typeof data.premium !== "boolean" ||
        data.plan !== (data.premium ? "plus" : "standard") ||
        (data.premium
          ? typeof data.expiresAt !== "string" ||
            !Number.isFinite(Date.parse(data.expiresAt))
          : data.expiresAt !== null)
      )
        fail(503, "MEMBERSHIP_UNAVAILABLE", "Тариф временно недоступен");
      if (data.premium && Date.parse(data.expiresAt!) <= Date.now())
        return { premium: false, plan: "standard", expiresAt: null };
      return data;
    },
  };
}
