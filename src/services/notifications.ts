export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

const KEY = "devora_notifications";

export function getNotifications(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as NotificationItem[]) : [];
  } catch {
    return [];
  }
}

export function addNotification(title: string, message: string) {
  const next: NotificationItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    createdAt: new Date().toISOString(),
    read: false,
  };

  const current = getNotifications();
  localStorage.setItem(KEY, JSON.stringify([next, ...current].slice(0, 40)));
  window.dispatchEvent(new Event("devora:notifications"));
}

export function markAllNotificationsRead() {
  const next = getNotifications().map((item) => ({ ...item, read: true }));
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("devora:notifications"));
}

export function clearNotifications() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("devora:notifications"));
}
