import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, X } from "lucide-react";
import type { ClsProfile } from "@shared/schema";

const CURRENCIES = ["EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR"];

interface Props {
  profile: Partial<ClsProfile>;
  onSave: (data: Partial<ClsProfile>) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export default function CLSProfileForm({ profile, onSave, onCancel, isSaving }: Props) {
  const [form, setForm] = useState<Partial<ClsProfile>>({
    cls_third_party: false,
    cls_third_party_notes: "",
    cls_nostro_payments: false,
    cls_nostro_currencies: [],
    notes: "",
    ...profile,
  });

  const toggleCurrency = (c: string) => {
    const curr = form.cls_nostro_currencies || [];
    setForm(p => ({
      ...p,
      cls_nostro_currencies: curr.includes(c) ? curr.filter(x => x !== c) : [...curr, c],
    }));
  };

  return (
    <Card className="border-0 shadow-sm border-l-4 border-l-blue-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">
          {profile.id ? "Edit" : "Add"} CLS Profile — {profile.group_name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              data-testid="checkbox-cls-third-party"
              checked={!!form.cls_third_party}
              onCheckedChange={v => setForm(p => ({ ...p, cls_third_party: !!v }))}
            />
            <Label className="text-sm cursor-pointer">Offers CLS Third-Party Services</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              data-testid="checkbox-cls-nostro"
              checked={!!form.cls_nostro_payments}
              onCheckedChange={v => setForm(p => ({ ...p, cls_nostro_payments: !!v }))}
            />
            <Label className="text-sm cursor-pointer">Offers CLS Nostro Payments</Label>
          </div>
        </div>

        <div>
          <Label className="text-xs">Third-Party Service Notes</Label>
          <Input
            data-testid="input-cls-third-party-notes"
            className="mt-1"
            value={form.cls_third_party_notes || ""}
            onChange={e => setForm(p => ({ ...p, cls_third_party_notes: e.target.value }))}
          />
        </div>

        <div>
          <Label className="text-xs mb-2 block">Nostro Payment Currencies</Label>
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map(c => (
              <label key={c} className="flex items-center gap-1.5 cursor-pointer select-none">
                <Checkbox
                  checked={(form.cls_nostro_currencies || []).includes(c)}
                  onCheckedChange={() => toggleCurrency(c)}
                />
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${(form.cls_nostro_currencies || []).includes(c) ? "bg-blue-100 text-blue-700" : "text-slate-600"}`}>{c}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs">Notes</Label>
          <Input
            data-testid="input-cls-notes"
            className="mt-1"
            value={form.notes || ""}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          />
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSave(form)} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-cls-profile">
            <Save className="w-3 h-3 mr-1" />{isSaving ? "Saving..." : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} data-testid="button-cancel-cls-profile">
            <X className="w-3 h-3 mr-1" />Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
