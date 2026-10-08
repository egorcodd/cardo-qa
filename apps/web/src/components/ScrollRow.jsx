import { useEffect, useRef } from "react";

export default function ScrollRow({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const canScroll = () => el.scrollWidth > el.clientWidth + 1;
    const onWheel = (e) => {
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta || !canScroll()) return;
      const before = el.scrollLeft;
      el.scrollLeft += delta;
      if (el.scrollLeft !== before) e.preventDefault();
    };
    let pointerId = null, startX = 0, startScroll = 0, dragged = false, ignoreClick = false;
    const down = (e) => {
      pointerId = null; dragged = false; ignoreClick = false;
      if (e.pointerType !== "mouse" || e.button !== 0 || !canScroll()) return;
      pointerId = e.pointerId;
      startX = e.pageX;
      startScroll = el.scrollLeft;
    };
    const move = (e) => {
      if (e.pointerId !== pointerId || pointerId === null) return;
      if (!canScroll()) { pointerId = null; dragged = false; ignoreClick = false; return; }
      const distance = e.pageX - startX;
      if (!dragged && Math.abs(distance) < 8) return;
      if (!dragged) {
        dragged = true;
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
      ignoreClick = true;
      el.scrollLeft = startScroll - distance;
      e.preventDefault();
    };
    const release = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch {}
    };
    const cancel = (e) => {
      release(e);
      dragged = false; ignoreClick = false;
    };
    const clickGuard = (e) => {
      if (!ignoreClick || e.detail === 0) return;
      ignoreClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancel);
    el.addEventListener("click", clickGuard, true);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel);
      el.removeEventListener("click", clickGuard, true);
    };
  }, []);
  return <div className="people-scroll" ref={ref}>{children}</div>;
}
