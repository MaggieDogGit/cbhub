import { storage } from "../storage";
import { buildSystemPrompt, runAgentLoop } from "../agent";

export async function runChat(
  conversationId: string,
  message: string,
  topic: string | undefined,
  emit: (data: object) => void,
): Promise<void> {
  const [history, storedSources] = await Promise.all([
    storage.listMessages(conversationId),
    storage.listDataSources(),
  ]);

  const systemPrompt = buildSystemPrompt(storedSources, topic ?? undefined);
  const confirmationPattern = /^(yes|y|confirmed?|correct|go ahead|proceed|store(?: and move)?|update|ok|sure|done|do it|move on|next|continue|approved?|accept)\b/i;
  const isConfirmation = confirmationPattern.test(message.trim());

  const openaiMessages: any[] = [
    { role: "system", content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content ?? "" })),
    { role: "user", content: message },
  ];

  const assistantContent = await runAgentLoop(
    openaiMessages,
    (_name, _args, text) => { emit({ type: "status", text }); },
    12,
    isConfirmation ? "required" : "auto"
  );

  const assistantMsg = await storage.createMessage({
    conversation_id: conversationId,
    role: "assistant",
    content: assistantContent,
  });

  emit({ type: "done", message: assistantMsg });
}
