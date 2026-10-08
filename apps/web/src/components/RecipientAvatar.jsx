import Avatar from "./Avatar.jsx";
import BankIcon from "./BankIcon.jsx";
import { recipientBank } from "../banks.js";
export default function RecipientAvatar({ recipient }) {
  const bank = recipientBank(recipient);
  if (recipient.kind === "external")
    return (
      <span className="recipient-avatar">
        <BankIcon id={bank} size={46} />
      </span>
    );
  return (
    <span className="recipient-avatar">
      <Avatar c={recipient} />
      {bank && (
        <BankIcon id={bank} size={20} className="recipient-bank-badge" />
      )}
    </span>
  );
}
