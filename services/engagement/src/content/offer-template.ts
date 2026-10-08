export interface OfferTemplate {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly url: "/" | "/history" | "/cards" | "/rewards" | "/notifications" | "/exchange" | "/send" | "/settings" | "/profile";
}
