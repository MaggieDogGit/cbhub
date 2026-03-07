import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Globe, CreditCard, ShieldCheck, BarChart3 } from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { BankingGroup, LegalEntity, Bic, CorrespondentService, Fmi } from "@shared/schema";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];

export default function Dashboard() {
  const { data: groups = [], isLoading: loadingGroups } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: entities = [], isLoading: loadingEntities } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: services = [], isLoading: loadingServices } = useQuery<CorrespondentService[]>({ queryKey: ["/api/correspondent-services"] });
  const { data: fmis = [], isLoading: loadingFmis } = useQuery<Fmi[]>({ queryKey: ["/api/fmis"] });

  const loading = loadingGroups || loadingEntities || loadingServices || loadingFmis;

  const gsibCount = groups.filter(g => g.gsib_status === "G-SIB").length;
  const dsibCount = groups.filter(g => g.gsib_status === "D-SIB").length;
  const naCount = groups.filter(g => !g.gsib_status || g.gsib_status === "N/A").length;
  const clsMembers = fmis.filter(f => f.fmi_type === "CLS_Settlement_Member").length;

  const currencyMap: Record<string, Set<string>> = {};
  services.forEach(s => {
    if (!s.currency) return;
    if (!currencyMap[s.currency]) currencyMap[s.currency] = new Set();
    if (s.group_name) currencyMap[s.currency].add(s.group_name);
  });
  const currencyData = Object.entries(currencyMap)
    .map(([currency, banks]) => ({ currency, count: banks.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const gsibData = [
    { name: "G-SIB", value: gsibCount },
    { name: "D-SIB", value: dsibCount },
    { name: "N/A", value: naCount },
  ].filter(d => d.value > 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64" data-testid="loading-dashboard">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Global correspondent banking intelligence overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "CB Providers by Banking Group", value: groups.length, icon: Building2, color: "text-blue-600 bg-blue-50", link: "/providers" },
          { label: "CB Legal Entities", value: entities.length, icon: CreditCard, color: "text-emerald-600 bg-emerald-50", link: "/legal-entities" },
          { label: "CLS Settlement Members", value: clsMembers, icon: Globe, color: "text-teal-600 bg-teal-50", link: "/cls" },
          { label: "G-SIB Providers", value: gsibCount, icon: ShieldCheck, color: "text-purple-600 bg-purple-50" },
        ].map(stat => (
          <Card key={stat.label} className={`border-0 shadow-sm ${stat.link ? "hover:shadow-md transition-shadow cursor-pointer" : ""}`} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-5">
              {stat.link ? (
                <Link href={stat.link} className="flex items-center gap-3 no-underline">
                  <div className={`p-2 rounded-lg ${stat.color}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                    <div className="text-xs text-slate-500">{stat.label}</div>
                  </div>
                </Link>
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${stat.color}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                    <div className="text-xs text-slate-500">{stat.label}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Providers per Currency
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currencyData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data yet — add providers to see chart</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={currencyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <XAxis dataKey="currency" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">SIB Classification</CardTitle>
          </CardHeader>
          <CardContent>
            {gsibData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={gsibData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {gsibData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">Currency Coverage Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {currencyData.length === 0 ? (
            <p className="text-slate-400 text-sm">Add correspondent services to see coverage data.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {currencyData.map(({ currency, count }) => (
                <div key={currency} className="bg-slate-50 rounded-lg p-3 text-center" data-testid={`card-currency-${currency}`}>
                  <div className="font-bold text-slate-900">{currency}</div>
                  <div className="text-xs text-slate-500 mt-1">{count} provider{count !== 1 ? "s" : ""}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
