import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { listMessages, getMessage, sendMessage } from "../src/lib/gmail.js";
import { listFiles, getFile } from "../src/lib/drive.js";
import { runChat } from "../src/lib/chat.js";
import type { Message } from "../src/lib/ollama.js";

const InvokeBody = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.literal("agent.invoke"),
  params: z.object({
    capability: z.string(),
    args: z.record(z.unknown()).optional(),
  }),
  auth: z.object({ token: z.string() }).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", agent: "google-agent", model: process.env.OLLAMA_MODEL ?? "qwen3:14b" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const parsed = InvokeBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
  }

  const { id, params, auth } = parsed.data;
  const { capability, args = {} } = params;
  const token = auth?.token;

  if (!token) {
    return res.status(401).json({ jsonrpc: "2.0", id, error: { code: -32001, message: "Google OAuth token required" } });
  }

  try {
    let result: unknown;

    switch (capability) {
      case "chat": {
        const message = args.message as string;
        const history = (args.history ?? []) as Message[];
        if (!message) throw new Error("args.message is required");
        result = await runChat(message, token, history);
        break;
      }

      case "gmail.list": {
        result = await listMessages(token, (args.maxResults as number) ?? 20, args.query as string | undefined);
        break;
      }

      case "gmail.read": {
        if (!args.id) throw new Error("args.id is required");
        result = await getMessage(token, args.id as string);
        break;
      }

      case "gmail.send": {
        const { to, subject, body } = args as { to: string; subject: string; body: string };
        if (!to || !subject || !body) throw new Error("args.to, args.subject, args.body are required");
        result = await sendMessage(token, to, subject, body);
        break;
      }

      case "drive.list": {
        result = await listFiles(token, (args.pageSize as number) ?? 20, args.query as string | undefined);
        break;
      }

      case "drive.read": {
        if (!args.id) throw new Error("args.id is required");
        result = await getFile(token, args.id as string);
        break;
      }

      default:
        return res.status(404).json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown capability: ${capability}` } });
    }

    return res.status(200).json({ jsonrpc: "2.0", id, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ jsonrpc: "2.0", id, error: { code: -32000, message } });
  }
}
