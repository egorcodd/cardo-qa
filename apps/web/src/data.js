export const NAV = [
  { id: "home", key: "nav.home", icon: "home" },
  { id: "send", key: "nav.send", icon: "ruble" },
  { id: "history", key: "nav.history", icon: "clock" },
  { id: "cards", key: "nav.cards", icon: "card" },
];

export const FAQ = [
  { q: "faq.q1", a: "faq.a1" },
  { q: "faq.q2", a: "faq.a2" },
  { q: "faq.q3", a: "faq.a3" },
  { q: "faq.q4", a: "faq.a4" },
];

export const PROFILE_MENU = [
  { id: "settings", key: "menu.settings", icon: "settings" },
  { id: "limits", key: "menu.limits", icon: "card" },
  { id: "support", key: "menu.support", icon: "help" },
  { id: "exit", key: "menu.exit", icon: "exit", danger: true },
];

export const INIT_BALANCE = 521098.31;

export const CREDIT = {
  name: "Кредитная карта Cardo",
  debt: 12480.0,
  limit: 100000,
};

export function fmt(n, dec = 2) {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function money(n, cur = "₽", dec = 2) {
  return fmt(n, dec) + " " + cur;
}
