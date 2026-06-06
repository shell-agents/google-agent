import { chatWithTools, type Message, type Tool } from "./ollama.js";
import { listMessages, getMessage, sendMessage } from "./gmail.js";
import { listFiles, getFile } from "./drive.js";

const TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "gmail_list",
      description: "List emails from the user's Gmail inbox. Use when the user asks to get, fetch, list, or show emails. Supports filtering by date, sender, or subject.",
      parameters: {
        type: "object",
        properties: {
          maxResults: { type: "number", description: "Max number of emails to fetch (default 20)" },
          query: { type: "string", description: "Gmail search query e.g. 'after:2024/1/1' or 'from:boss@example.com' or 'subject:invoice'" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail_read",
      description: "Read the full content of a specific email by its ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The Gmail message ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail_send",
      description: "Send an email on behalf of the user. Only use when the user explicitly asks to send or reply to an email.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body text" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_list",
      description: "List files in the user's Google Drive. Use when asked to show, list, or find files/documents.",
      parameters: {
        type: "object",
        properties: {
          pageSize: { type: "number", description: "Number of files to list (default 20)" },
          query: { type: "string", description: "Drive search query e.g. 'name contains report'" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_read",
      description: "Get metadata and details of a specific Drive file by its ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The Drive file ID" },
        },
        required: ["id"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a helpful personal assistant with access to the user's Gmail and Google Drive.
When the user asks for emails or files, use the available tools to fetch the data.
After fetching data, always summarise it clearly and concisely in natural language.
For emails: show sender, subject, and a one-line summary for each.
For files: show name, type, and last modified date.
Today's date and time is: ${new Date().toISOString()}.
Always be conversational and helpful. If something goes wrong, explain it clearly.`;

async function executeTool(name: string, args: Record<string, unknown>, token: string): Promise<string> {
  switch (name) {
    case "gmail_list": {
      const messages = await listMessages(token, (args.maxResults as number) ?? 20, args.query as string | undefined);
      return JSON.stringify(messages);
    }
    case "gmail_read": {
      const msg = await getMessage(token, args.id as string);
      return JSON.stringify(msg);
    }
    case "gmail_send": {
      const result = await sendMessage(token, args.to as string, args.subject as string, args.body as string);
      return JSON.stringify(result);
    }
    case "drive_list": {
      const files = await listFiles(token, (args.pageSize as number) ?? 20, args.query as string | undefined);
      return JSON.stringify(files);
    }
    case "drive_read": {
      const file = await getFile(token, args.id as string);
      return JSON.stringify(file);
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export async function runChat(
  userMessage: string,
  token: string,
  history: Message[] = []
): Promise<{ reply: string; history: Message[] }> {
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const { message, tool_calls } = await chatWithTools(messages, TOOLS);
    messages.push(message);

    if (!tool_calls || tool_calls.length === 0) {
      const reply = message.content;
      return {
        reply,
        history: messages.slice(1),
      };
    }

    for (const call of tool_calls) {
      const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
      const result = await executeTool(call.function.name, args, token);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: result,
      });
    }
  }

  return { reply: "I ran into a loop trying to answer that. Please try again.", history: messages.slice(1) };
}
