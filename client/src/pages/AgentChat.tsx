import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Send, Bot, RotateCcw, Sparkles, Brain } from "lucide-react";
import MessageBubble from "@/components/agent/MessageBubble";
import type { Conversation, ChatMessage } from "@shared/schema";

const SUGGESTIONS = [
  "Add Standard Chartered as a CB provider",
  "Which banks offer EUR correspondent banking?",
  "Identify coverage gaps for AUD clearing",
  "Which banks are CLS settlement members?",
  "List all RTGS systems for G10 currencies",
  "Show FMI taxonomy categories",
  "Research DBS Bank as a SGD CB provider",
  "Summarise our correspondent banking database",
  "Which entities have no FMI memberships?",
  "Find all CB services missing a clearing model",
];

export default function AgentChat() {
  const [input, setInput] = useState("");
  const [statusText, setStatusText] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const [deepThinkInFlight, setDeepThinkInFlight] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversation, isLoading: loadingConv } = useQuery<Conversation>({
    queryKey: ["/api/conversations/main"],
    queryFn: () => apiRequest("GET", "/api/conversations/main").then(r => r.json()),
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<ChatMessage[]>({
    queryKey: ["/api/conversations", conversation?.id, "messages"],
    queryFn: () => conversation
      ? apiRequest("GET", `/api/conversations/${conversation.id}/messages`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!conversation,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prompt = params.get("prompt");
    if (prompt) {
      setInput(decodeURIComponent(prompt));
      const url = new URL(window.location.href);
      url.searchParams.delete("prompt");
      url.searchParams.delete("conv");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const clearMutation = useMutation({
    mutationFn: async () => {
      if (conversation) {
        await apiRequest("DELETE", `/api/conversations/${conversation.id}`);
      }
      const fresh: Conversation = await apiRequest("GET", "/api/conversations/main").then(r => r.json());
      return fresh;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations/main"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversation?.id, "messages"] });
      setConfirmingClear(false);
      setInput("");
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ conversationId, message, useDeepThink }: { conversationId: string; message: string; useDeepThink: boolean }) => {
      setDeepThinkInFlight(useDeepThink);
      await apiRequest("POST", `/api/conversations/${conversationId}/messages`, { role: "user", content: message });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });

      const token = getAuthToken();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-auth-token": token } : {}),
        },
        body: JSON.stringify({ conversationId, message, ...(useDeepThink ? { deepThink: true } : {}) }),
      });

      if (!response.ok || !response.body) throw new Error(`${response.status}: request failed`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMsg = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "status") setStatusText(event.text);
            else if (event.type === "done") assistantMsg = event.message;
            else if (event.type === "error") throw new Error(event.message);
          } catch {}
        }
      }

      return assistantMsg;
    },
    onSuccess: () => {
      setStatusText("");
      setDeepThinkInFlight(false);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversation?.id, "messages"] });
    },
    onError: () => { setStatusText(""); setDeepThinkInFlight(false); },
  });

  const sendMessage = async () => {
    if (!input.trim() || sendMutation.isPending || !conversation) return;
    const msg = input.trim();
    const useDeepThink = deepThink;
    setInput("");
    setDeepThink(false);
    if (inputRef.current) inputRef.current.style.height = "auto";
    sendMutation.mutate({ conversationId: conversation.id, message: msg, useDeepThink });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const isLoading = loadingConv || loadingMessages;
  const isEmpty = !isLoading && messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-8rem)] max-w-3xl mx-auto bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">

      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100" data-testid="text-chat-title">CB Agent</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Correspondent Banking Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setDeepThink(d => !d)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              deepThink
                ? "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 ring-1 ring-violet-300 dark:ring-violet-700"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title={deepThink ? "Deep Think enabled — next message uses gpt-5" : "Enable Deep Think (gpt-5)"}
            data-testid="button-deep-think"
          >
            <Brain className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{deepThink ? "Deep Think On" : "Deep Think"}</span>
          </button>
          {confirmingClear ? (
            <>
              <span className="text-xs text-slate-500 hidden sm:inline">Clear chat?</span>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs px-2.5"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                data-testid="button-confirm-clear"
              >
                Clear
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2.5"
                onClick={() => setConfirmingClear(false)}
                data-testid="button-cancel-clear"
              >
                Cancel
              </Button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingClear(true)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Clear chat"
              data-testid="button-clear-session"
              disabled={messages.length === 0}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-400 text-sm">Loading...</div>
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1" data-testid="text-welcome-heading">
              How can I help?
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm">
              Ask me anything about correspondent banking, FMI memberships, coverage analysis, or entity management.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(q);
                    inputRef.current?.focus();
                  }}
                  data-testid={`button-suggestion-${i}`}
                  className="text-left px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 transition-colors leading-snug"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={msg.id || i} message={msg} />
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-3 pb-[env(safe-area-inset-bottom,12px)]">
        {sendMutation.isPending && (
          <div className="flex items-center gap-2 px-1 pb-2" data-testid="text-agent-status">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${deepThinkInFlight ? "bg-violet-500" : "bg-blue-500"}`} />
            <span className={`text-xs truncate ${deepThinkInFlight ? "text-violet-600 dark:text-violet-400" : "text-slate-500 dark:text-slate-400"}`}>
              {deepThinkInFlight ? `Deep Think (gpt-5) — ${statusText || "reasoning..."}` : statusText || "Thinking..."}
            </span>
          </div>
        )}
        {deepThink && !sendMutation.isPending && (
          <div className="flex items-center gap-2 px-1 pb-2" data-testid="text-deep-think-indicator">
            <Brain className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="text-xs text-violet-600 dark:text-violet-400">
              Deep Think enabled — next message will use gpt-5
            </span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            data-testid="input-chat-message"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={sendMutation.isPending || loadingConv}
            style={{ maxHeight: "120px" }}
          />
          <Button
            data-testid="button-send-message"
            onClick={sendMessage}
            disabled={!input.trim() || sendMutation.isPending || !conversation}
            className="bg-blue-600 hover:bg-blue-700 shrink-0 rounded-xl h-10 w-10 p-0"
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">Agent can read and write to your database. Always verify AI suggestions.</p>
      </div>
    </div>
  );
}
