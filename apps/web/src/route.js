import { useState, useEffect } from "react";
export function readRoute() {
  const [view = "", id] = window.location.pathname.split("/").filter(Boolean);
  const allowed = [
    "home",
    "send",
    "history",
    "cards",
    "profile",
    "settings",
    "rewards",
    "notifications",
    "exchange",
  ];
  return {
    view: allowed.includes(view) ? view : "home",
    id,
    recipient: new URLSearchParams(window.location.search).get("recipient"),
  };
}
export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function go(target) {
    const path = target.startsWith("/")
      ? target
      : target === "home"
        ? "/"
        : "/" + target;
    window.history.pushState({}, "", path);
    setRoute(readRoute());
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  return [route, go];
}
