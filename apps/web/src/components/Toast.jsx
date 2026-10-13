import Icon from "../icons.jsx";
const toastIcons = {
  check: "toast-success",
  close: "toast-error",
  copy: "toast-copy",
  settings: "toast-success",
  gift: "party",
  freeze: "freeze",
  unfreeze: "toast-unfreeze",
  bell: "toast-bell",
};
export default function ToastStack({ toasts }) {
  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div className={"toast" + (t.leaving ? " leaving" : "")} key={t.id}>
          <span className="toast-ic">
            <Icon name={toastIcons[t.icon] || "toast-success"} size={26} />
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
