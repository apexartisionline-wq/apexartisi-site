// Κάθε λεπτό: καλεί το /api/cron/tick (κόκκινο κουμπί, ειδοποιήσεις, αποχή).
export default async () => {
  const base = process.env.APP_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return new Response("not configured", { status: 200 });
  const res = await fetch(`${base}/api/cron/tick`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  return new Response(String(res.status));
};

export const config = { schedule: "* * * * *" };
