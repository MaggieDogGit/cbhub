import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, CheckCircle2, XCircle, Plus, AlertTriangle } from "lucide-react";
import type { BankingGroup, LegalEntity, Bic } from "@shared/schema";

const BoolIcon = ({ val }: { val: boolean | null | undefined }) =>
  val ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-slate-300" />;

interface ServiceResult {
  currency: string;
  service_type: string;
  rtgs_membership: boolean;
  instant_scheme_access: boolean;
  cls_member: boolean;
  nostro_accounts_offered: boolean;
  vostro_accounts_offered: boolean;
  target_clients: string;
  source: string;
}

interface ResearchResult {
  bank: string;
  headquarters: string;
  gsib: boolean;
  services: ServiceResult[];
}

export default function ResearchAssistant() {
  const [bankName, setBankName] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [approved, setApproved] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const researchMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/research", { bankName: name });
      return res.json() as Promise<ResearchResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setApproved(data.services?.map((_, i) => i) || []);
      setSaved(false);
    },
  });

  const toggleApprove = (i: number) => {
    setApproved(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  };

  const saveApproved = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const groupsRes = await fetch("/api/banking-groups").then(r => r.json()) as BankingGroup[];
      let group = groupsRes.find(g => g.group_name.toLowerCase() === result.bank.toLowerCase());
      if (!group) {
        const res = await apiRequest("POST", "/api/banking-groups", {
          group_name: result.bank,
          headquarters_country: result.headquarters || "",
          gsib_status: result.gsib ? "G-SIB" : "N/A",
          notes: "Created via AI Research Assistant",
        });
        group = await res.json();
      }

      const entitiesRes = await fetch("/api/legal-entities").then(r => r.json()) as LegalEntity[];
      let entity = entitiesRes.find(e => e.group_id === group!.id);
      if (!entity) {
        const res = await apiRequest("POST", "/api/legal-entities", {
          group_id: group!.id,
          group_name: group!.group_name,
          legal_name: result.bank,
          country: result.headquarters || "",
          entity_type: "Bank",
          notes: "Created via AI Research Assistant",
        });
        entity = await res.json();
      }

      const bicsRes = await fetch("/api/bics").then(r => r.json()) as Bic[];
      let bic = bicsRes.find(b => b.legal_entity_id === entity!.id);
      if (!bic) {
        const res = await apiRequest("POST", "/api/bics", {
          legal_entity_id: entity!.id,
          legal_entity_name: entity!.legal_name,
          bic_code: result.bank.substring(0, 4).toUpperCase() + "XX",
          country: result.headquarters || "",
          is_headquarters: true,
          swift_member: true,
          notes: "Created via AI Research Assistant — please update BIC code",
        });
        bic = await res.json();
      }

      const approvedServices = result.services.filter((_, i) => approved.includes(i));
      for (const svc of approvedServices) {
        await apiRequest("POST", "/api/correspondent-services", {
          bic_id: bic!.id,
          bic_code: bic!.bic_code,
          group_name: group!.group_name,
          legal_entity_name: entity!.legal_name,
          country: result.headquarters || "",
          ...svc,
          last_verified: new Date().toISOString().split("T")[0],
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/banking-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/legal-entities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/correspondent-services"] });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI Research Assistant</h1>
        <p className="text-slate-500 text-sm mt-1">Research correspondent banking services for any institution using AI</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex gap-3">
            <Input
              data-testid="input-bank-name"
              placeholder="Enter bank name (e.g. JPMorgan Chase, HSBC, Citi...)"
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !researchMutation.isPending && bankName.trim() && researchMutation.mutate(bankName)}
              className="flex-1"
            />
            <Button
              data-testid="button-research"
              onClick={() => researchMutation.mutate(bankName)}
              disabled={researchMutation.isPending || !bankName.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {researchMutation.isPending ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <><Bot className="w-4 h-4 mr-2" />Research</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {researchMutation.isPending && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-slate-600 text-sm">Researching {bankName}...</p>
            <p className="text-slate-400 text-xs mt-1">Searching AI knowledge base</p>
          </CardContent>
        </Card>
      )}

      {result && !researchMutation.isPending && (
        <div className="space-y-4">
          <Card className="border-0 shadow-sm border-l-4 border-l-amber-400">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-600">
                  Review the AI-suggested services below. Select the ones you want to approve and save to the database. AI data should always be verified against official sources.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-900">
                  {result.bank}
                  {result.headquarters && <span className="text-slate-500 font-normal text-sm ml-2">— {result.headquarters}</span>}
                  {result.gsib && <Badge className="ml-2 bg-purple-100 text-purple-700 border-purple-200">G-SIB</Badge>}
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" data-testid="button-select-all" onClick={() => setApproved(result.services.map((_, i) => i))}>Select All</Button>
                  <Button variant="outline" size="sm" data-testid="button-deselect-all" onClick={() => setApproved([])}>Deselect All</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 text-left w-10"></th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Currency</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Service Type</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-600">RTGS</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-600">Instant</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-600">CLS</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-600">Nostro</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-600">Vostro</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Target Clients</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.services?.map((svc, i) => (
                      <tr key={i} className={`border-b border-slate-50 transition-colors ${approved.includes(i) ? "bg-emerald-50/40" : "opacity-50"}`} data-testid={`row-service-${i}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={approved.includes(i)} onChange={() => toggleApprove(i)} className="w-4 h-4 cursor-pointer" data-testid={`checkbox-approve-${i}`} />
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800">{svc.currency}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{svc.service_type}</Badge></td>
                        <td className="px-4 py-3 text-center"><BoolIcon val={svc.rtgs_membership} /></td>
                        <td className="px-4 py-3 text-center"><BoolIcon val={svc.instant_scheme_access} /></td>
                        <td className="px-4 py-3 text-center"><BoolIcon val={svc.cls_member} /></td>
                        <td className="px-4 py-3 text-center"><BoolIcon val={svc.nostro_accounts_offered} /></td>
                        <td className="px-4 py-3 text-center"><BoolIcon val={svc.vostro_accounts_offered} /></td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{svc.target_clients}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{svc.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-sm text-slate-500">{approved.length} of {result.services?.length} services selected</span>
                {saved ? (
                  <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium" data-testid="status-saved">
                    <CheckCircle2 className="w-4 h-4" /> Saved to database
                  </div>
                ) : (
                  <Button data-testid="button-save-approved" onClick={saveApproved} disabled={approved.length === 0 || saving} className="bg-emerald-600 hover:bg-emerald-700">
                    {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Save {approved.length} service{approved.length !== 1 ? "s" : ""} to Database
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
