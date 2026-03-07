import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, XCircle, Search } from "lucide-react";
import CoverageMap from "@/components/market/CoverageMap";
import type { BankingGroup, CorrespondentService } from "@shared/schema";

const CURRENCIES = ["EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR"];

const BoolIcon = ({ val }: { val: boolean | null | undefined }) =>
  val ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-slate-300" />;

interface ResultRow {
  bankingGroup: string;
  groupBic: string;
  hqCountry: string;
  legalEntity: string;
  currency: string;
  rtgs: boolean | null;
  instant: boolean | null;
  cls: boolean | null;
}

export default function MarketCoverage() {
  const [selectedCurrencies, setSelectedCurrencies] = useState(["EUR", "USD", "GBP"]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const toggleCurrency = (c: string) => {
    setSelectedCurrencies(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  const search = async () => {
    if (selectedCurrencies.length === 0) return;
    setLoading(true);
    setSearched(true);
    try {
      const [servicesRes, groupsRes] = await Promise.all([
        fetch("/api/correspondent-services").then(r => r.json()) as Promise<CorrespondentService[]>,
        fetch("/api/banking-groups").then(r => r.json()) as Promise<BankingGroup[]>,
      ]);
      const filtered = servicesRes.filter(s => s.currency && selectedCurrencies.includes(s.currency));
      const groupMap: Record<string, string> = {};
      groupsRes.forEach(g => { if (g.group_name) groupMap[g.group_name] = g.headquarters_country || ""; });

      const rows: ResultRow[] = filtered.map(s => ({
        bankingGroup: s.group_name || "",
        groupBic: s.bic_code || "",
        hqCountry: groupMap[s.group_name || ""] || s.country || "",
        legalEntity: s.legal_entity_name || "",
        currency: s.currency || "",
        rtgs: s.rtgs_membership,
        instant: s.instant_scheme_access,
        cls: s.cls_member,
      }));
      setResults(rows);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Market Coverage</h1>
        <p className="text-slate-500 text-sm mt-1">Find banks that provide clearing services in specific markets</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">Select CB Providers by their home currencies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            {CURRENCIES.map(c => (
              <label key={c} className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={selectedCurrencies.includes(c)}
                  onCheckedChange={() => toggleCurrency(c)}
                  data-testid={`checkbox-currency-${c}`}
                />
                <span className={`text-sm font-medium px-2 py-0.5 rounded ${selectedCurrencies.includes(c) ? "bg-blue-100 text-blue-700" : "text-slate-600"}`}>{c}</span>
              </label>
            ))}
          </div>
          <Button onClick={search} disabled={selectedCurrencies.length === 0 || loading} className="bg-blue-600 hover:bg-blue-700" data-testid="button-find-providers">
            <Search className="w-4 h-4 mr-2" />
            {loading ? "Searching..." : `Find Providers (${selectedCurrencies.length} ${selectedCurrencies.length === 1 ? "currency" : "currencies"})`}
          </Button>
        </CardContent>
      </Card>

      {searched && results.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">CB providers by Group head office location</CardTitle>
          </CardHeader>
          <CardContent>
            <CoverageMap results={results} />
          </CardContent>
        </Card>
      )}

      {searched && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Results — {results.length} provider{results.length !== 1 ? "s" : ""} found for: {selectedCurrencies.join(", ")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {results.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No providers found for selected currencies.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Banking Group</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">HQ Country</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Legal Entity</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Currency</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">RTGS</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">Instant</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">CLS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 ${i % 2 !== 0 ? "bg-slate-50/50" : ""}`} data-testid={`row-coverage-${i}`}>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.bankingGroup}</td>
                        <td className="px-4 py-3 text-slate-600">{r.hqCountry}</td>
                        <td className="px-4 py-3 text-slate-600">{r.legalEntity}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{r.currency}</Badge></td>
                        <td className="px-4 py-3 flex justify-center"><BoolIcon val={r.rtgs} /></td>
                        <td className="px-4 py-3 text-center"><BoolIcon val={r.instant} /></td>
                        <td className="px-4 py-3 text-center"><BoolIcon val={r.cls} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
