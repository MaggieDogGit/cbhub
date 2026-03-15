import { Bot, User } from "lucide-react";
import type { ChatMessage } from "@shared/schema";

function formatTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({ message }: { message: Pick<ChatMessage, "role" | "content" | "created_at"> }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`message-${message.role}`}
    >
      {!isUser && (
        <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 mb-5">
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div className={`max-w-[85%] sm:max-w-[75%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-blue-600 text-white rounded-br-sm"
              : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm"
          }`}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        {message.created_at && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1">
            {formatTime(message.created_at)}
          </span>
        )}
      </div>
      {isUser && (
        <div className="h-7 w-7 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 mb-5">
          <User className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
        </div>
      )}
    </div>
  );
}
