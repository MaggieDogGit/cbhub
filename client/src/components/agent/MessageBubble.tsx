import { Bot } from "lucide-react";
import type { ChatMessage } from "@shared/schema";

export default function MessageBubble({ message }: { message: Pick<ChatMessage, "role" | "content"> }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`} data-testid={`message-${message.role}`}>
      {!isUser && (
        <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center mt-0.5 shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}
