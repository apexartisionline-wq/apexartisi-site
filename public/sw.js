// Service worker του Apex: μόνο ειδοποιήσεις. Δεν αποθηκεύει δεδομένα.
self.addEventListener("push", (event) => {
  let msg = { title: "Apex", url: "/" };
  try { msg = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body || "",
      tag: msg.tag,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: msg.url || "/" },
      requireInteraction: Boolean(msg.urgent),
      renotify: Boolean(msg.urgent),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    }),
  );
});
