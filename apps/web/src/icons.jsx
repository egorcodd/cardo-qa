const P = {
  home: (
    <>
      <path d="M3.5 11L12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.2 2" />
    </>
  ),
  ruble: (
    <>
      <path d="M8 20V5h4.4a4 4 0 0 1 0 8H6" />
      <path d="M6 16.5h6.5" />
    </>
  ),
  send: (
    <>
      <path d="M6.5 17.5L17.5 6.5" />
      <path d="M8 6.5h9.5v9.5" />
    </>
  ),
  receive: (
    <>
      <path d="M17.5 6.5L6.5 17.5" />
      <path d="M16 17.5H6.5V8" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  backspace: (
    <>
      <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" />
      <path d="M13 10l4 4M17 10l-4 4" />
    </>
  ),
  check: (
    <>
      <path d="M4.5 12.5l4.5 4.5L19.5 6.5" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  chevronr: (
    <>
      <path d="M9.5 6l6 6-6 6" />
    </>
  ),
  chevrond: (
    <>
      <path d="M6 9.5l6 6 6-6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.4a2.7 2.7 0 1 1 3.9 2.6c-.8.5-1.2 1-1.2 1.9v.3" />
      <path d="M12 16.9h.01" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8.5" width="17" height="12" rx="2" />
      <path d="M3.5 12.5h17M12 8.5v12" />
      <path d="M12 8.5S10.8 4.5 8.4 4.5a2 2 0 0 0 0 4zM12 8.5s1.2-4 3.6-4a2 2 0 0 1 0 4z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h3v3M20 14v6M14 20h3" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9.5h18" />
    </>
  ),
  income: (
    <>
      <path d="M17 7L7 17" />
      <path d="M8 8v8.5h8.5" />
    </>
  ),
  expense: (
    <>
      <path d="M7 17L17 7" />
      <path d="M9 7.5h8v8" />
    </>
  ),
  freeze: (
    <>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
      <path d="M9.5 4.2L12 6l2.5-1.8M9.5 19.8L12 18l2.5 1.8M4.6 10.2L6 12l-1.4 1.8M19.4 10.2L18 12l1.4 1.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6" />
    </>
  ),
  exit: (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 12h10M16 8l4 4-4 4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeoff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.5 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.8 3.4M6.2 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.3-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  telegram: (
    <>
      <path d="M21.5 4.5 2.6 11.1l6.3 2.4 2.4 6.3L21.5 4.5z" />
      <path d="m8.9 13.5 12.6-9" />
    </>
  ),
};

export default function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {P[name] || null}
    </svg>
  );
}

export function PayMark({ light }) {
  const a = light ? "#fff" : "#16181d";
  return (
    <svg
      width="36"
      height="22"
      viewBox="0 0 36 22"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="14" cy="11" r="9" fill={a} opacity="0.9" />
      <circle cx="22" cy="11" r="9" fill={a} opacity="0.45" />
    </svg>
  );
}
