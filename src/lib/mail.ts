import "server-only";
import nodemailer from "nodemailer";

/**
 * Email από το Gmail του προγράμματος (απόφαση υπεύθυνης 16/10: «από το Gmail του προγράμματος»).
 * Ρυθμίσεις μόνο από το περιβάλλον (Netlify → Environment variables), ποτέ στον κώδικα:
 *   GMAIL_USER = η διεύθυνση του προγράμματος · GMAIL_APP_PASSWORD = «κωδικός εφαρμογής» του Google (16 χαρακτήρες,
 *   φτιάχνεται στο myaccount.google.com → Ασφάλεια → Επαλήθευση 2 βημάτων → Κωδικοί εφαρμογών).
 * Χωρίς ρυθμίσεις τίποτα δεν στέλνεται: η διαχείριση βλέπει το κείμενο στην οθόνη και το στέλνει μόνη της.
 * Νομικό: το προσωπικό Gmail δεν έχει σύμβαση επεξεργασίας δεδομένων — σε πραγματικά μέλη μόνο με έγκριση του κ. Φωτσινού.
 */
export function mailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export type MailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed"; detail?: string };

export async function sendMail(to: string, subject: string, text: string): Promise<MailResult> {
  if (!mailConfigured()) return { sent: false, reason: "not_configured" };
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({ from: `"Apex" <${process.env.GMAIL_USER}>`, to, subject, text });
    return { sent: true };
  } catch (e) {
    console.error("[mail]", e);
    return { sent: false, reason: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Η δημόσια διεύθυνση της εφαρμογής: APP_URL αν έχει οριστεί, αλλιώς το URL που δίνει το Netlify, αλλιώς ο host του αιτήματος. */
export function appUrl(host?: string | null): string {
  const env = process.env.APP_URL || process.env.URL || "";
  if (env) return env.replace(/\/$/, "");
  return host ? `https://${host}` : "";
}
