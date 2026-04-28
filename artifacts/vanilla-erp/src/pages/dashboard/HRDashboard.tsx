import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserX, Clock, AlertCircle, Banknote, UserCheck } from "lucide-react";

interface HRData {
  totalEmployees: number;
  activeEmployees: number;
  absentToday: number;
  pendingLeaves: number;
  pendingRequests: number;
  totalSalariesMga: number;
  totalBonusesMga: number;
}

function KPICard({ title, value, sub, Icon, accent }: { title: string; value: string; sub?: string; Icon: any; accent?: string }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <div className={`p-1.5 rounded-lg ${accent ?? "bg-primary/10"}`}><Icon className="w-4 h-4 text-primary" /></div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-serif">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function HRDashboard({ data }: { data: HRData }) {
  const absentPct = data.activeEmployees > 0 ? Math.round((data.absentToday / data.activeEmployees) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-serif text-primary tracking-tight">Tableau de bord — Ressources Humaines</h2>
        <p className="text-muted-foreground mt-1">Suivi des effectifs, absences et paie du mois</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard title="Effectif total" value={`${data.totalEmployees}`} sub={`${data.activeEmployees} actifs`} Icon={Users} />
        <KPICard title="Absents aujourd'hui" value={`${data.absentToday}`} sub={`${absentPct}% de l'effectif`} Icon={UserX} accent="bg-amber-100" />
        <KPICard title="Employés actifs" value={`${data.activeEmployees}`} sub="contrats en cours" Icon={UserCheck} accent="bg-green-100" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard title="Congés en attente" value={`${data.pendingLeaves}`} sub="à approuver" Icon={Clock} accent="bg-blue-100" />
        <KPICard title="Demandes RH en attente" value={`${data.pendingRequests}`} sub="avances, problèmes…" Icon={AlertCircle} accent="bg-red-100" />
        <KPICard title="Masse salariale" value={`${(data.totalSalariesMga / 1_000_000).toFixed(2)} M MGA`} sub={`+ ${data.totalBonusesMga.toLocaleString()} MGA primes`} Icon={Banknote} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-sm font-medium">Présence du jour</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 mt-1">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Présents</span>
                  <span className="font-medium text-green-600">{data.activeEmployees - data.absentToday}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${100 - absentPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Absents</span>
                  <span className="font-medium text-amber-600">{data.absentToday}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-amber-400 h-2 rounded-full transition-all" style={{ width: `${absentPct}%` }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm font-medium">Résumé paie — mois courant</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mt-1">
              <div className="space-y-1 p-4 rounded-lg bg-muted/40">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Salaires nets</p>
                <p className="text-xl font-bold font-serif">{data.totalSalariesMga.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">MGA</span></p>
              </div>
              <div className="space-y-1 p-4 rounded-lg bg-muted/40">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Primes</p>
                <p className="text-xl font-bold font-serif">{data.totalBonusesMga.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">MGA</span></p>
              </div>
              <div className="space-y-1 p-4 rounded-lg bg-primary/5 col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Coût total du personnel</p>
                <p className="text-2xl font-bold font-serif text-primary">{(data.totalSalariesMga + data.totalBonusesMga).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">MGA</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
