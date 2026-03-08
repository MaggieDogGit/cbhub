import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, Building2, Landmark, ArrowLeftRight, Network, MessageSquare, RotateCcw } from "lucide-react";
import MessageBubble from "@/components/agent/MessageBubble";
import type { Conversation, ChatMessage } from "@shared/schema";

type TopicKey = "banking-groups" | "entities-bics" | "cb-services" | "fmi" | "general";

interface Topic {
  key: TopicKey;
  label: string;
  icon: React.ReactNode;
  description: string;
  suggestions: string[];
}

const TOPICS: Topic[] = [
  {
    key: "banking-groups",
    label: "Banking Groups",
    icon: <Building2 className="w-4 h-4" />,
    description: "Research, qualify and add CB providers",
    suggestions: [
      "Add Standard Chartered as a CB provider",
      "Qualify Société Générale for EUR correspondent banking",
      "Which G-SIB banks are not yet in our database?",
      "Research DBS Bank as a SGD CB provider",
      "Assess BBVA's CB service probability",
    ],
  },
  {
    key: "entities-bics",
    label: "Legal Entities & BICs",
    icon: <Landmark className="w-4 h-4" />,
    description: "Entity setup, BIC data and HQ confirmation",
    suggestions: [
      "Verify the primary BIC for HSBC Holdings",
      "Check if Barclays Bank PLC is correctly set as HQ entity",
      "List all legal entities missing a BIC record",
      "Update the entity type for Deutsche Bank AG",
      "Find the correct SWIFT code for BNP Paribas SA",
    ],
  },
  {
    key: "cb-services",
    label: "CB Services",
    icon: <ArrowLeftRight className="w-4 h-4" />,
    description: "Correspondent services and coverage gaps",
    suggestions: [
      "Which banks in our database offer SGD correspondent banking?",
      "Identify coverage gaps for AUD clearing",
      "List all EUR correspondent services with RTGS membership confirmed",
      "Which providers support CHF nostro accounts?",
      "Show me all CB services missing a clearing model",
    ],
  },
  {
    key: "fmi",
    label: "FMI Memberships",
    icon: <Network className="w-4 h-4" />,
    description: "FMI registry, membership queries",
    suggestions: [
      "Which banks in our database are CLS settlement members?",
      "Check if MUFG Bank is a TARGET2 direct participant",
      "List all Fedwire members we have recorded",
      "Add SWIFT membership for Citibank NA",
      "Which legal entities have no FMI memberships recorded?",
    ],
  },
  {
    key: "general",
    label: "General",
    icon: <MessageSquare className="w-4 h-4" />,
    description: "Open-ended questions and ad hoc research",
    suggestions: [
      "What are the main RTGS systems for G10 currencies?",
      "Explain the difference between nostro and vostro accounts",
      "Which banks offer multi-currency correspondent banking?",
      "What is the CB probability for a typical regional European bank?",
      "Summarise the current state of our correspondent banking database",
    ],
  },
];

export default function AgentChat() {
  const [activeTopic, setActiveTopic] = useState<TopicKey>("banking-groups");
  const [input, setInput] = useState("");
  const [statusText, setStatusText] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const topic = TOPICS.find(t => t.key === activeTopic)!;

  const { data: conversation, isLoading: loadingConv } = useQuery<Conversation>({
    queryKey: ["/api/conversations/topic", activeTopic],
    queryFn: () => apiRequest("GET", `/api/conversations/topic/${activeTopic}`).then(r => r.json()),
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
    setConfirmingClear(false);
  }, [activeTopic]);

  // Handle ?prompt= and ?conv= from CB Setup workflow buttons — land on general tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prompt = params.get("prompt");
    const convName = params.get("conv");
    if (prompt || convName) {
      setActiveTopic("general");
      if (prompt) setInput(decodeURIComponent(prompt));
      const url = new URL(window.location.href);
      url.searchParams.delete("prompt");
      url.searchParams.delete("conv");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearMutation = useMutation({
    mutationFn: async () => {
      if (conversation) {
        await apiRequest("DELETE", `/api/conversations/${conversation.id}`);
      }
      const fresh: Conversation = await apiRequest("GET", `/api/conversations/topic/${activeTopic}`).then(r => r.json());
      return fresh;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations/topic", activeTopic] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversation?.id, "messages"] });
      setConfirmingClear(false);
      setInput("");
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
        body: JSON.stringify({ conversationId, message, topic: activeTopic }),
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
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversation?.id, "messages"] });
    },
    onError: () => setStatusText(""),
  });

  const sendMessage = async () => {
    if (!input.trim() || sendMutation.isPending || !conversation) return;
    const msg = input.trim();
    setInput("");
    sendMutation.mutate({ conversationId: conversation.id, message: msg });
  };

  const isLoading = loadingConv || loadingMessages;
  const isEmpty = !isLoading && messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">

      {/* Topic sidebar */}
      <div className="w-56 border-r border-slate-100 flex flex-col bg-slate-50 shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">CB Agent</span>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {TOPICS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTopic(t.key)}
              data-testid={`tab-topic-${t.key}`}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-start gap-2.5 group ${
                activeTopic === t.key
                  ? "bg-blue-100 text-blue-800"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${activeTopic === t.key ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`}>
                {t.icon}
              </span>
              <div className="min-w-0">
                <div className="font-medium truncate">{t.label}</div>
                <div className={`text-xs truncate mt-0.5 ${activeTopic === t.key ? "text-blue-600/70" : "text-slate-400"}`}>
                  {t.description}
                </div>
              </div>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs w-full justify-center">Online</Badge>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
          <span className="text-slate-400">{topic.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 text-sm">{topic.label}</div>
            <div className="text-xs text-slate-500 truncate">{topic.description}</div>
          </div>
          {confirmingClear ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500">Clear this session?</span>
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
            </div>
          ) : (
            <button
              onClick={() => setConfirmingClear(true)}
              className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
              title="Clear and restart this session"
              data-testid="button-clear-session"
              disabled={messages.length === 0}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-slate-400 text-sm">Loading...</div>
            </div>
          )}

          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                <span className="text-blue-500 scale-125">{topic.icon}</span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 mb-1">{topic.label}</h2>
                <p className="text-slate-500 text-sm max-w-sm">{topic.description} — pick a suggestion below or type your own question.</p>
              </div>
              <div className="grid grid-cols-1 gap-2 w-full max-w-md">
                {topic.suggestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    data-testid={`button-suggestion-${activeTopic}-${i}`}
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

        {/* Input bar */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex gap-3">
            <Input
              data-testid="input-chat-message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder={`Ask about ${topic.label.toLowerCase()}...`}
              className="flex-1"
              disabled={sendMutation.isPending || loadingConv}
            />
            <Button
              data-testid="button-send-message"
              onClick={sendMessage}
              disabled={!input.trim() || sendMutation.isPending || !conversation}
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
