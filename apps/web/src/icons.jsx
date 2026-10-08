import {
  House,
  Clock3,
  RussianRuble,
  DollarSign,
  Euro,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Delete,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
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
  Star,
  Sun,
  Moon,
  Circle,
  Landmark,
  CalendarDays,
} from "lucide-react";
const icons = {
  home: House,
  clock: Clock3,
  ruble: RussianRuble,
  dollar: DollarSign,
  euro: Euro,
  send: ArrowUpRight,
  receive: ArrowDownLeft,
  plus: Plus,
  backspace: Delete,
  check: Check,
  close: X,
  chevronr: ChevronRight,
  chevronl: ChevronLeft,
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
  star: Star,
  sun: Sun,
  moon: Moon,
  bank: Landmark,
  calendar: CalendarDays,
};
export default function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }) {
  const Component = icons[name] || Circle;
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
    <img
      className="cardo-brand-mark"
      src="/logo.png"
      width="28"
      height="28"
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}
