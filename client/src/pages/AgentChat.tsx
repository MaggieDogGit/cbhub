import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Plus, Bot, MessageSquare, Trash2 } from "lucide-react";
import MessageBubble from "@/components/agent/MessageBubble";
import type { Conversation, ChatMessage } from "@shared/schema";

const suggestedQuestions = [
  "Which banks offer USD correspondent banking?",
  "Identify likely EUR clearing providers in Europe",
  "Who are the top SGD correspondent banks in Asia?",
  "Which G-SIB banks support instant payments?",
  "Suggest correspondent banking providers for BRL clearing",
];

export default function AgentChat() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [statusText, setStatusText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: loadingConvs } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/conversations", activeConversation?.id, "messages"],
    queryFn: () => activeConversation
      ? apiRequest("GET", `/api/conversations/${activeConversation.id}/messages`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!activeConversation,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  // Pre-fill input from ?prompt= URL param and auto-create named conversation from ?conv= (used by CB Setup buttons)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prompt = params.get("prompt");
    const convName = params.get("conv");
    if (prompt || convName) {
      if (prompt) setInput(decodeURIComponent(prompt));
      const url = new URL(window.location.href);
      url.searchParams.delete("prompt");
      url.searchParams.delete("conv");
      window.history.replaceState({}, "", url.toString());
      if (convName) {
        createConvMutation.mutateAsync(decodeURIComponent(convName)).catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createConvMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/conversations", { name }).then(r => r.json()) as Promise<Conversation>,
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setActiveConversation(conv);
    },
  });

  const deleteConvMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/conversations/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (activeConversation?.id === id) setActiveConversation(null);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId: string; message: string }) => {
      await apiRequest("POST", `/api/conversations/${conversationId}/messages`, { role: "user", content: message });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });

      const token = getAuthToken();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-auth-token": token } : {}),
        },
        body: JSON.stringify({ conversationId, message }),
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
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", activeConversation?.id, "messages"] });
    },
    onError: () => setStatusText(""),
  });

  const sendMessage = async () => {
    if (!input.trim() || sendMutation.isPending) return;
    let conv = activeConversation;
    if (!conv) {
      conv = await createConvMutation.mutateAsync(input.slice(0, 40));
    }
    const msg = input.trim();
    setInput("");
    sendMutation.mutate({ conversationId: conv.id, message: msg });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">
      <div className="w-64 border-r border-slate-100 flex flex-col bg-slate-50 shrink-0">
        <div className="p-4 border-b border-slate-100">
          <Button
            onClick={() => createConvMutation.mutate(`Chat ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-sm"
            size="sm"
            data-testid="button-new-chat"
          >
            <Plus className="w-4 h-4 mr-2" /> New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingConvs ? (
            <div className="p-4 text-center text-slate-400 text-xs">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-xs">No conversations yet</div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setActiveConversation(conv)}
                data-testid={`conv-item-${conv.id}`}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2 group cursor-pointer ${
                  activeConversation?.id === conv.id ? "bg-blue-100 text-blue-800" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="truncate flex-1">{conv.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConvMutation.mutate(conv.id); }}
                  className="opacity-40 hover:opacity-100 hover:text-red-500 transition-opacity shrink-0"
                  data-testid={`button-delete-conv-${conv.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">CB Provider Intelligence Agent</div>
            <div className="text-xs text-slate-500">Research providers · Explore existing data · Identify coverage gaps</div>
          </div>
          <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Online</Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!activeConversation && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Bot className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">CB Provider Intelligence Agent</h2>
                <p className="text-slate-500 text-sm max-w-md">Ask me to identify likely correspondent banking providers, research specific banks, or answer questions about your existing database.</p>
              </div>
              <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    data-testid={`button-suggestion-${i}`}
                    className="text-left px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm text-slate-700 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {sendMutation.isPending && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center mt-0.5 shrink-0">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 max-w-sm">
                {statusText ? (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shrink-0" />
                    <span className="text-xs text-slate-500 leading-relaxed">{statusText}</span>
                  </div>
                ) : (
                  <div className="flex gap-1 items-center h-5">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 border-t border-slate-100">
          <div className="flex gap-3">
            <Input
              data-testid="input-chat-message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Ask about CB providers, currencies, markets..."
              className="flex-1"
              disabled={sendMutation.isPending}
            />
            <Button
              data-testid="button-send-message"
              onClick={sendMessage}
              disabled={!input.trim() || sendMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">Agent can read and write to your database. Always verify AI suggestions before relying on them.</p>
        </div>
      </div>
    </div>
  );
}
