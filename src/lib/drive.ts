const DRIVE_BASE = "https://www.googleapis.com/drive/v3";

export async function listFiles(token: string, pageSize = 20, query?: string) {
  const params = new URLSearchParams({
    pageSize: String(pageSize),
    fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)",
  });
  if (query) params.set("q", query);
  const res = await fetch(`${DRIVE_BASE}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const data = await res.json() as { files: unknown[] };
  return data.files ?? [];
}

export async function getFile(token: string, fileId: string) {
  const res = await fetch(`${DRIVE_BASE}/files/${fileId}?fields=id,name,mimeType,modifiedTime,size,webViewLink`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive read failed: ${res.status}`);
  return res.json();
}
