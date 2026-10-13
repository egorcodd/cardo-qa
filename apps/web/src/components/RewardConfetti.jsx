import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
const colors = ["#cef43b", "#3d84f5", "#c898fa", "#ff9b62", "#55cfa6", "#ffd46a"];
export default function RewardConfetti() {
  const [active, setActive] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setActive(false), 3000);
    return () => clearTimeout(timer);
  }, [active]);
  if (!active) return null;
  return createPortal(
    <div className="reward-confetti" aria-hidden="true">
      {Array.from({ length: 72 }, (_, i) => (
        <span
          className="reward-confetti-particle"
          key={i}
          style={{
            left: i % 2 ? "98%" : "2%",
            "--dx": ((i % 2 ? -1 : 1) * (18 + ((i * 29) % 72))) + "vw",
            "--rise": (38 + ((i * 17) % 45)) + "vh",
            "--duration": (1800 + ((i * 43) % 650)) + "ms",
            "--delay": ((i * 19) % 130) + "ms",
            "--rotation": ((i * 71) % 360) + "deg",
          }}
        >
          <i style={{
            background: colors[i % colors.length],
            width: (5 + i % 4) + "px",
            height: (8 + i % 7) + "px",
            borderRadius: i % 5 === 0 ? "50%" : "2px",
          }} />
        </span>
      ))}
    </div>,
    document.body,
  );
}
