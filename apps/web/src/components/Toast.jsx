import Icon from "../icons.jsx";

export default function ToastStack({ toasts }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div className={"toast" + (t.leaving ? " leaving" : "")} key={t.id}>
          <span className="toast-ic">
            <Icon name={t.icon} size={16} />
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
