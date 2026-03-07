import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Search, Plus, Pencil } from "lucide-react";
import CLSProfileForm from "@/components/cls/CLSProfileForm";
import type { BankingGroup, LegalEntity, Fmi, ClsProfile } from "@shared/schema";

const BoolIcon = ({ val }: { val: boolean | null | undefined }) =>
  val ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" /> : <XCircle className="w-4 h-4 text-slate-300 inline" />;

export default function CLS() {
  const [search, setSearch] = useState("");
  const [editingProfile, setEditingProfile] = useState<Partial<ClsProfile> | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const { data: groups = [] } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: profiles = [] } = useQuery<ClsProfile[]>({ queryKey: ["/api/cls-profiles"] });
  const { data: entities = [] } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: fmis = [] } = useQuery<Fmi[]>({ queryKey: ["/api/fmis"] });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<ClsProfile>) => {
      if (data.id) return apiRequest("PATCH", `/api/cls-profiles/${data.id}`, data);
      return apiRequest("POST", "/api/cls-profiles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cls-profiles"] });
      setEditingProfile(null);
      setEditingGroupId(null);
    },
  });

  const getProfile = (groupId: string) => profiles.find(p => p.group_id === groupId);
  const isGroupClsMember = (groupId: string) => {
    const groupEntities = entities.filter(e => e.group_id === groupId);
    return groupEntities.some(e => fmis.some(f => f.legal_entity_id === e.id && f.fmi_type === "CLS_Settlement_Member"));
  };
  const getClsMemberEntity = (groupId: string) => {
    const groupEntities = entities.filter(e => e.group_id === groupId);
    const memberEntity = groupEntities.find(e => fmis.some(f => f.legal_entity_id === e.id && f.fmi_type === "CLS_Settlement_Member"));
    return memberEntity?.legal_name || null;
  };

  const filteredGroups = groups.filter(g =>
    isGroupClsMember(g.id) && (!search || g.group_name?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">CLS Overview</h1>
        <p className="text-slate-500 text-sm mt-1">CLS membership, third-party services and Nostro payment capabilities by banking group</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input data-testid="input-search-cls" placeholder="Search banking group..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "CLS Members", value: groups.filter(g => isGroupClsMember(g.id)).length, color: "text-emerald-600" },
          { label: "Third-Party Providers", value: profiles.filter(p => p.cls_third_party).length, color: "text-blue-600" },
          { label: "Nostro Payment Providers", value: profiles.filter(p => p.cls_nostro_payments).length, color: "text-purple-600" },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">CLS Profiles by Banking Group</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Banking Group</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">CLS Member</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Member Legal Entity</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">3rd Party</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">3rd Party Notes</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Nostro Payments</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Nostro Currencies</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Notes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map(group => {
                  const profile = getProfile(group.id);
                  return (
                    <tr key={group.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${editingGroupId === group.id ? "bg-blue-50" : ""}`} data-testid={`row-cls-${group.id}`}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {group.group_name}
                        {group.gsib_status === "G-SIB" && <Badge className="ml-2 bg-purple-100 text-purple-700 border-purple-200 text-xs">G-SIB</Badge>}
                        {group.gsib_status === "D-SIB" && <Badge className="ml-2 bg-blue-100 text-blue-700 border-blue-200 text-xs">D-SIB</Badge>}
                      </td>
                      <td className="px-4 py-3 text-center"><BoolIcon val={isGroupClsMember(group.id)} /></td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{getClsMemberEntity(group.id) || "—"}</td>
                      {profile ? (
                        <>
                          <td className="px-4 py-3 text-center"><BoolIcon val={profile.cls_third_party} /></td>
                          <td className="px-4 py-3 text-slate-500 text-xs max-w-48">{profile.cls_third_party_notes || "—"}</td>
                          <td className="px-4 py-3 text-center"><BoolIcon val={profile.cls_nostro_payments} /></td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(profile.cls_nostro_currencies || []).length > 0
                                ? (profile.cls_nostro_currencies || []).map(c => <span key={c} className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">{c}</span>)
                                : <span className="text-slate-400 text-xs">—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs max-w-48">{profile.notes || "—"}</td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="ghost" data-testid={`button-edit-cls-${group.id}`} onClick={() => { setEditingGroupId(group.id); setEditingProfile(profile); }}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-center">—</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">—</td>
                          <td className="px-4 py-3 text-center">—</td>
                          <td className="px-4 py-3"><span className="text-slate-400 text-xs">—</span></td>
                          <td className="px-4 py-3 text-slate-500 text-xs">—</td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="outline" data-testid={`button-add-cls-${group.id}`} onClick={() => { setEditingGroupId(group.id); setEditingProfile({ group_id: group.id, group_name: group.group_name }); }} className="text-xs">
                              <Plus className="w-3 h-3 mr-1" /> Add
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editingProfile && (
        <CLSProfileForm
          profile={editingProfile}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => { setEditingProfile(null); setEditingGroupId(null); }}
          isSaving={saveMutation.isPending}
        />
      )}
    </div>
  );
}
