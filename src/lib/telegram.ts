import "server-only";

// Το κόκκινο κουμπί μένει στο Telegram μέχρι να αποδειχθούν οι ειδοποιήσεις του app.
// Οι ομάδες του Telegram δεν έχουν κρυπτογράφηση από άκρο σε άκρο: στέλνουμε ΜΟΝΟ
// μικρό όνομα + αρχικό και ότι πατήθηκε το κουμπί — τίποτε άλλο.

const token = () => process.env.TELEGRAM_BOT_TOKEN;
const chatId = () => process.env.TELEGRAM_CHAT_ID;

export const telegramConfigured = () => Boolean(token() && chatId());

async function call(method: string, body: object): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new Error(`Telegram ${method} failed: ${json?.description ?? res.status}`);
  return json.result;
}

export async function sendHelpAlert(opts: {
  requestId: string;
  who: string; // μικρό όνομα + αρχικό
  repeat: number;
  claimedBy?: string | null;
  drill?: boolean;
}): Promise<number> {
  const { requestId, who, repeat, claimedBy, drill } = opts;
  const head = drill ? "🧪 ΔΟΚΙΜΗ — " : "🔴 ";
  const text = claimedBy
    ? `${head}${who}: ${claimedBy} το ανέλαβε αλλά δεν έχει δηλωθεί «μιλήσαμε». Μπορεί κάποιος να βοηθήσει;`
    : `${head}${repeat > 0 ? `ΞΑΝΑ (${repeat + 1}η φορά) — ` : ""}${who} πάτησε το κόκκινο κουμπί.`;
  const msg = await call("sendMessage", {
    chat_id: chatId(),
    text,
    reply_markup: claimedBy ? undefined : { inline_keyboard: [[{ text: "Το αναλαμβάνω", callback_data: `claim:${requestId}` }]] },
  });
  return msg.message_id as number;
}

export async function markClaimed(messageIds: number[], who: string, claimer: string): Promise<void> {
  await Promise.allSettled(
    messageIds.map((message_id) =>
      call("editMessageText", { chat_id: chatId(), message_id, text: `✅ ${who}: το ανέλαβε ${claimer}.` }),
    ),
  );
}

export async function answerCallback(id: string, text: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: id, text }).catch(() => undefined);
}
