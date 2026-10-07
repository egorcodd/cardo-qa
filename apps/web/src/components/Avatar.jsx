export default function Avatar({ c }) {
  if (c.empty) return <span className="ava ava-empty" />;
  return (
    <span
      className={"ava tone-" + c.tone}
      style={c.img ? { backgroundImage: `url(${c.img})` } : undefined}
    >
      {c.img ? "" : c.initial}
    </span>
  );
}
