import Link from "next/link";
import { unreadStaffMessages } from "@/lib/staff-messages";

// Γραμμή στο «Σήμερα»: νέα μηνύματα από την ομάδα, μέχρι να ανοιχτούν.
export async function StaffMessagesLine({ userId }: { userId: string }) {
  const u = await unreadStaffMessages(userId);
  if (!u.total) return null;
  const first = u.from[0];
  return (
    <Link className="card msg-line" href={`/t/messages?with=${first.id}`}>
      <span>✉ <strong>{u.total === 1 ? "Νέο μήνυμα" : `${u.total} νέα μηνύματα`}</strong> από {u.from.map((f) => f.name).join(", ")}</span>
      <span aria-hidden="true">›</span>
    </Link>
  );
}
