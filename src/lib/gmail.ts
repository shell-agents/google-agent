const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function listMessages(token: string, maxResults = 20) {
  const res = await fetch(`${GMAIL_BASE}/messages?maxResults=${maxResults}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail list failed: ${res.status}`);
  const data = await res.json() as { messages: { id: string; threadId: string }[] };
  return data.messages ?? [];
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
