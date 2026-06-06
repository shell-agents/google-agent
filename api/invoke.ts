import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { listMessages, getMessage, sendMessage } from "../src/lib/gmail.js";
import { listFiles, getFile } from "../src/lib/drive.js";
import { chat } from "../src/lib/ollama.js";

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
      case "gmail.list": {
        const messages = await listMessages(token, (args.maxResults as number) ?? 20);
        const summary = await chat(
          "You are a helpful email assistant. Summarise the following email list concisely.",
          JSON.stringify(messages)
        );
        result = { messages, summary };
        break;
      }

      case "gmail.read": {
        const messageId = args.id as string;
        if (!messageId) throw new Error("args.id is required");
        const message = await getMessage(token, messageId);
        const summary = await chat(
          "You are a helpful email assistant. Summarise this email clearly.",
          JSON.stringify(message)
        );
        result = { message, summary };
        break;
      }

      case "gmail.send": {
        const { to, subject, body } = args as { to: string; subject: string; body: string };
        if (!to || !subject || !body) throw new Error("args.to, args.subject, args.body are required");
        result = await sendMessage(token, to, subject, body);
        break;
      }

      case "drive.list": {
        const files = await listFiles(token, (args.pageSize as number) ?? 20);
        const summary = await chat(
          "You are a helpful file assistant. Summarise the following Drive file list.",
          JSON.stringify(files)
        );
        result = { files, summary };
        break;
      }

      case "drive.read": {
        const fileId = args.id as string;
        if (!fileId) throw new Error("args.id is required");
        result = await getFile(token, fileId);
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
