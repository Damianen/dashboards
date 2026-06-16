// ntfy push channel. POSTs to `${NTFY_URL}/${NTFY_TOPIC}`; a logged no-op when
// NTFY_TOPIC is unset (so the nightly job is safe before notifications are wired
// to a real topic). Titles stay ASCII (ntfy header constraint); the message body
// is UTF-8 and carries the euro amounts. Never include IBANs or counterparties.

export interface NtfyPayload {
  title: string; // ASCII only
  message: string;
  priority?: number; // 1 (min) .. 5 (max)
  tags?: string[]; // emoji shortcodes, e.g. ["warning"]
  click?: string; // URL opened when the notification is tapped
}

export async function sendNtfy(payload: NtfyPayload): Promise<void> {
  const base = (process.env.NTFY_URL || "https://ntfy.sh").replace(/\/+$/, "");
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.info("[ntfy] skipped: NTFY_TOPIC unset");
    return;
  }

  const headers: Record<string, string> = { Title: payload.title };
  if (payload.priority) headers.Priority = String(payload.priority);
  if (payload.tags && payload.tags.length > 0) headers.Tags = payload.tags.join(",");
  if (payload.click) headers.Click = payload.click;

  const res = await fetch(`${base}/${topic}`, {
    method: "POST",
    headers,
    body: payload.message,
  });
  if (!res.ok) {
    // Status only — never echo the body, which carries amounts.
    throw new Error(`ntfy ${res.status}`);
  }
}
