import { useEffect, useRef } from "react";

export default function ScrollRow({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (d && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += d;
        e.preventDefault();
      }
    };
    let down = false,
      sx = 0,
      sl = 0,
      moved = false;
    const md = (e) => {
      down = true;
      moved = false;
      sx = e.pageX;
      sl = el.scrollLeft;
    };
    const mm = (e) => {
      if (!down) return;
      const dx = e.pageX - sx;
      if (Math.abs(dx) > 3) moved = true;
      el.scrollLeft = sl - dx;
    };
    const up = () => {
      down = false;
    };
    const clickGuard = (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", md);
    window.addEventListener("pointermove", mm);
    window.addEventListener("pointerup", up);
    el.addEventListener("click", clickGuard, true);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", md);
      window.removeEventListener("pointermove", mm);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("click", clickGuard, true);
    };
  }, []);
  return (
    <div className="people-scroll" ref={ref}>
      {children}
    </div>
  );
}
