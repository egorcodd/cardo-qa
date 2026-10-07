import { useState } from "react";
import Icon from "../icons.jsx";
export default function Field({
  id,
  title,
  error,
  type = "text",
  value,
  onChange,
  autoComplete,
  ...rest
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={"fld" + (error ? " err" : "")}>
      <label htmlFor={id}>{title}</label>
      <div className={"fld-box" + (type === "password" ? " has-btn" : "")}>
        <input
          id={id}
          value={value}
          type={type === "password" && show ? "text" : type}
          onChange={onChange}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
          {...rest}
        />
        {type === "password" && (
          <button
            type="button"
            className="fld-eye"
            aria-label={
              show
                ? "Скрыть пароль / Hide password"
                : "Показать пароль / Show password"
            }
            onClick={() => setShow(!show)}
          >
            <Icon name={show ? "eyeoff" : "eye"} size={18} />
          </button>
        )}
      </div>
      {error && (
        <p id={id + "-error"} className="fld-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
