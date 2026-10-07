import {
  House,
  Clock3,
  RussianRuble,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Delete,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  Gift,
  UserRound,
  QrCode,
  CreditCard,
  Snowflake,
  Settings,
  LogOut,
  Copy,
  Eye,
  EyeOff,
  Send,
  Bell,
  Pencil,
  Camera,
  Sparkles,
  KeyRound,
  Languages,
  RotateCcw,
  ArrowLeftRight,
  ArrowUpDown,
  Smartphone,
  Mail,
  ShieldCheck,
  Plane,
  LockKeyhole,
} from "lucide-react";
const icons = {
  home: House,
  clock: Clock3,
  ruble: RussianRuble,
  send: ArrowUpRight,
  receive: ArrowDownLeft,
  plus: Plus,
  backspace: Delete,
  check: Check,
  close: X,
  chevronr: ChevronRight,
  chevrond: ChevronDown,
  help: CircleHelp,
  gift: Gift,
  user: UserRound,
  qr: QrCode,
  card: CreditCard,
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  freeze: Snowflake,
  settings: Settings,
  exit: LogOut,
  copy: Copy,
  eye: Eye,
  eyeoff: EyeOff,
  telegram: Send,
  bell: Bell,
  pencil: Pencil,
  camera: Camera,
  sparkles: Sparkles,
  key: KeyRound,
  languages: Languages,
  reset: RotateCcw,
  exchange: ArrowLeftRight,
  swap: ArrowUpDown,
  smartphone: Smartphone,
  mail: Mail,
  shield: ShieldCheck,
  plane: Plane,
  lock: LockKeyhole,
};
export default function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }) {
  const Component = icons[name] || CircleHelp;
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...rest}
    />
  );
}
export function PayMark({ light }) {
  const color = light ? "#fff" : "#16181d";
  return (
    <svg
      width="36"
      height="22"
      viewBox="0 0 36 22"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="14" cy="11" r="9" fill={color} opacity="0.9" />
      <circle cx="22" cy="11" r="9" fill={color} opacity="0.45" />
    </svg>
  );
}

export function BrandMark() {
  return (
    <span className="cardo-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 36 22">
        <circle cx="14" cy="11" r="9" fill="#caf23f" />
        <circle cx="22" cy="11" r="9" fill="#fff" opacity=".55" />
      </svg>
    </span>
  );
}
