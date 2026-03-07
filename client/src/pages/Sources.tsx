import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExternalLink, Trash2, Plus, RefreshCw, Database, BookOpen } from "lucide-react";
import type { DataSource } from "@shared/schema";

const CATEGORY_COLORS: Record<string, string> = {
  "RTGS Members": "bg-blue-100 text-blue-800",
  "CLS Members": "bg-purple-100 text-purple-800",
  "SWIFT Directory": "bg-green-100 text-green-800",
  "Regulatory": "bg-orange-100 text-orange-800",
  "Market Data": "bg-teal-100 text-teal-800",
  "Correspondent Banks": "bg-pink-100 text-pink-800",
};

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] || "bg-slate-100 text-slate-700";
}

interface FormState {
  name: string;
  category: string;
  url: string;
  publisher: string;
  description: string;
  update_frequency: string;
  notes: string;
}

const EMPTY: FormState = { name: "", category: "", url: "", publisher: "", description: "", update_frequency: "", notes: "" };

export default function Sources() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: sources = [], isLoading } = useQuery<DataSource[]>({
    queryKey: ["/api/data-sources"],
  });

  const createMutation = useMutation({
    mutationFn: (data: FormState) => apiRequest("POST", "/api/data-sources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
      setShowAdd(false);
      setForm(EMPTY);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/data-sources/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] }),
  });

  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });

  const grouped = sources.reduce<Record<string, DataSource[]>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Sources</h1>
          <p className="text-slate-500 text-sm mt-1">Reference sources identified by the AI agent for market data and membership lists</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-source">
          <Plus className="w-4 h-4 mr-2" /> Add Source
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">Loading...</div>
      ) : sources.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No sources stored yet</p>
          <p className="text-slate-400 text-sm mt-1">Ask the AI Agent to find sources for specific data, e.g.<br />"Identify the authoritative source for TARGET2 members and save it"</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-slate-400" />
                <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">{category}</h2>
                <span className="text-xs text-slate-400">({items.length})</span>
              </div>
              <div className="grid gap-3">
                {items.map(source => (
                  <div key={source.id} data-testid={`card-source-${source.id}`} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-slate-900 text-sm">{source.name}</span>
                          <Badge className={`text-xs font-normal ${categoryColor(source.category)}`}>{source.category}</Badge>
                          {source.update_frequency && (
                            <Badge variant="outline" className="text-xs font-normal flex items-center gap-1">
                              <RefreshCw className="w-2.5 h-2.5" /> {source.update_frequency}
                            </Badge>
                          )}
                        </div>
                        {source.publisher && <p className="text-xs text-slate-500 mb-1">Publisher: <span className="font-medium text-slate-700">{source.publisher}</span></p>}
                        {source.description && <p className="text-sm text-slate-600 mt-1">{source.description}</p>}
                        {source.notes && <p className="text-xs text-slate-400 mt-1 italic">{source.notes}</p>}
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`link-source-${source.id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs mt-2 break-all"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            {source.url}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400">{source.created_at ? new Date(source.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
                        <button
                          onClick={() => deleteMutation.mutate(source.id)}
                          data-testid={`button-delete-source-${source.id}`}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Data Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Name *</Label>
                <Input {...field("name")} placeholder="ECB TARGET2 Participants" data-testid="input-source-name" />
              </div>
              <div className="space-y-1">
                <Label>Category *</Label>
                <Input {...field("category")} placeholder="RTGS Members" data-testid="input-source-category" />
              </div>
              <div className="space-y-1">
                <Label>Publisher</Label>
                <Input {...field("publisher")} placeholder="ECB" data-testid="input-source-publisher" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>URL</Label>
                <Input {...field("url")} placeholder="https://..." data-testid="input-source-url" />
              </div>
              <div className="space-y-1">
                <Label>Update Frequency</Label>
                <Input {...field("update_frequency")} placeholder="Monthly" data-testid="input-source-frequency" />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input {...field("description")} placeholder="Brief description" data-testid="input-source-description" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Textarea {...field("notes")} placeholder="Any additional notes..." rows={2} data-testid="input-source-notes" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name || !form.category || createMutation.isPending}
              data-testid="button-save-source"
            >
              {createMutation.isPending ? "Saving..." : "Save Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
