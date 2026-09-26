import "server-only";

// Το κόκκινο κουμπί μένει στο Telegram μέχρι να αποδειχθούν οι ειδοποιήσεις του app.
// Οι ομάδες του Telegram δεν έχουν κρυπτογράφηση από άκρο σε άκρο: στέλνουμε ΜΟΝΟ
// το όνομα και ότι πατήθηκε το κουμπί — τίποτε άλλο.

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

export async function sendHelpAlert(requestId: string, memberName: string, repeat: number): Promise<number> {
  const prefix = repeat > 0 ? `🔴 ΞΑΝΑ (${repeat + 1}η φορά) — ` : "🔴 ";
  const msg = await call("sendMessage", {
    chat_id: chatId(),
    text: `${prefix}${memberName} πάτησε το κόκκινο κουμπί.`,
    reply_markup: { inline_keyboard: [[{ text: "Το αναλαμβάνω", callback_data: `claim:${requestId}` }]] },
  });
  return msg.message_id as number;
}

export async function markClaimed(messageIds: number[], memberName: string, claimer: string): Promise<void> {
  await Promise.allSettled(
    messageIds.map((message_id) =>
      call("editMessageText", {
        chat_id: chatId(),
        message_id,
        text: `✅ ${memberName}: το ανέλαβε ο/η ${claimer}.`,
      }),
    ),
  );
}

export async function answerCallback(id: string, text: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: id, text }).catch(() => undefined);
}
