import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Banknote, FileText, AlertCircle, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

interface AccountingData {
  revenue: number;
  charges: number;
  resultat: number;
  bankBalance: number;
  pendingInvoices: number;
  totalValidatedTTC: number;
  unmatchedBankTransactions: number;
}

function KPICard({ title, value, sub, Icon, color }: { title: string; value: string; sub?: string; Icon: any; color?: string }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <div className={`p-1.5 rounded-lg ${color ?? "bg-primary/10"}`}><Icon className="w-4 h-4 text-primary" /></div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-serif">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AccountingDashboard({ data }: { data: AccountingData }) {
  const barData = [
    { name: "Revenus", value: data.revenue, fill: "#22c55e" },
    { name: "Charges", value: data.charges, fill: "#ef4444" },
    { name: "Résultat", value: data.resultat, fill: data.resultat >= 0 ? "#3b82f6" : "#f97316" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-serif text-primary tracking-tight">Tableau de bord — Comptabilité</h2>
        <p className="text-muted-foreground mt-1">Suivi financier et rapprochement bancaire</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Revenus" value={`${(data.revenue / 1_000_000).toFixed(2)} M MGA`} sub="compte 701" Icon={TrendingUp} color="bg-green-100" />
        <KPICard title="Charges" value={`${(data.charges / 1_000_000).toFixed(2)} M MGA`} sub="comptes 6xx" Icon={TrendingDown} color="bg-red-100" />
        <KPICard title="Résultat net" value={`${(data.resultat / 1_000_000).toFixed(2)} M MGA`} sub={data.resultat >= 0 ? "Bénéfice" : "Perte"} Icon={BarChart2} color={data.resultat >= 0 ? "bg-blue-100" : "bg-orange-100"} />
        <KPICard title="Trésorerie" value={`${data.bankBalance.toLocaleString()} MGA`} sub="comptes 512+53" Icon={Banknote} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Factures en attente" value={`${data.pendingInvoices}`} sub="validées non payées" Icon={FileText} color="bg-amber-100" />
        <KPICard title="Volume facturé (TTC)" value={`${data.totalValidatedTTC.toLocaleString()} MGA`} sub="toutes factures validées" Icon={TrendingUp} />
        <KPICard title="Transactions non rapprochées" value={`${data.unmatchedBankTransactions}`} sub="à rapprocher en banque" Icon={AlertCircle} color="bg-red-100" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Revenus / Charges / Résultat (MGA)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `${v.toLocaleString()} MGA`} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
