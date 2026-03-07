import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import type { CorrespondentService } from "@shared/schema";

const CURRENCIES = ["EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR"];

const BoolIcon = ({ val }: { val: boolean | null | undefined }) =>
  val ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-300 mx-auto" />;

export default function Currencies() {
  const [selectedCurrency, setSelectedCurrency] = useState("USD");

  const { data: services = [], isLoading } = useQuery<CorrespondentService[]>({
    queryKey: ["/api/correspondent-services", selectedCurrency],
    queryFn: () => fetch(`/api/correspondent-services?currency=${selectedCurrency}`).then(r => r.json()),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Currency Competition View</h1>
        <p className="text-slate-500 text-sm mt-1">Understand the competitive landscape for a specific currency</p>
      </div>

      <div className="flex items-center gap-4">
        <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
          <SelectTrigger className="w-40" data-testid="select-currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="secondary" data-testid="badge-provider-count">{services.length} provider{services.length !== 1 ? "s" : ""}</Badge>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">{selectedCurrency} — Correspondent Banking Providers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
          ) : services.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No providers found for {selectedCurrency}. Add services in the Database Admin.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Bank / Group</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Legal Entity</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">BIC</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Country</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Service Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Clearing Model</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-600">RTGS</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-600">Instant Pay</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-600">CLS</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-600">Nostro</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-600">Vostro</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, i) => (
                    <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 !== 0 ? "bg-slate-50/50" : ""}`} data-testid={`row-service-${s.id}`}>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.group_name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.legal_entity_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{s.bic_code}</td>
                      <td className="px-4 py-3 text-slate-600">{s.country}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{s.service_type}</Badge></td>
                      <td className="px-4 py-3">
                        {s.clearing_model ? (
                          <Badge className={`text-xs ${s.clearing_model === "Onshore" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>{s.clearing_model}</Badge>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3"><BoolIcon val={s.rtgs_membership} /></td>
                      <td className="px-4 py-3"><BoolIcon val={s.instant_scheme_access} /></td>
                      <td className="px-4 py-3"><BoolIcon val={s.cls_member} /></td>
                      <td className="px-4 py-3"><BoolIcon val={s.nostro_accounts_offered} /></td>
                      <td className="px-4 py-3"><BoolIcon val={s.vostro_accounts_offered} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
