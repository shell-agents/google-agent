const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function listMessages(token: string, maxResults = 20, query?: string) {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) params.set("q", query);
  const res = await fetch(`${GMAIL_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail list failed: ${res.status}`);
  const data = await res.json() as { messages: { id: string; threadId: string }[] };
  if (!data.messages?.length) return [];

  const details = await Promise.all(
    data.messages.slice(0, maxResults).map(async (m) => {
      const msg = await getMessage(token, m.id);
      const headers = (msg.payload?.headers ?? []) as { name: string; value: string }[];
      const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      return { id: m.id, threadId: m.threadId, from: get("From"), subject: get("Subject"), date: get("Date"), snippet: msg.snippet };
    })
  );
  return details;
}

export async function getMessage(token: string, id: string) {
  const res = await fetch(`${GMAIL_BASE}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail read failed: ${res.status}`);
  return res.json();
}

export async function sendMessage(token: string, to: string, subject: string, body: string) {
  const raw = btoa(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`)
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status}`);
  return res.json();
}
