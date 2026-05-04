import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, CalendarX, Clock, AlertCircle, Banknote, ShieldCheck, Activity } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

type HrDashboard = {
  totalEmployees: number; activeEmployees: number; suspendedEmployees: number; exitedEmployees: number;
  presentToday: number; absentToday: number; pendingLeaves: number; avgSalary: number;
  masseSalariale: number; totalCnaps: number; totalOstie: number; totalIrsa: number; totalNet: number;
  payrollGenerated: number; byDepartment: Record<string, number>; byContrat: Record<string, number>; month: string;
};

const COLORS = ["#1a6c3c", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

function fmt(n: number) { return Math.round(n).toLocaleString("fr-FR") + " MGA"; }

async function fetchDashboard(): Promise<HrDashboard> {
  const r = await fetch("/api/hr/dashboard", { credentials: "include" });
  if (!r.ok) throw new Error("Erreur chargement dashboard RH");
  return r.json();
}

export default function HrDashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["hr-dashboard"], queryFn: fetchDashboard, refetchInterval: 60_000 });

  if (isLoading) return <div className="p-6 text-muted-foreground">Chargement du tableau de bord RH…</div>;
  if (error || !data) return <div className="p-6 text-destructive">Erreur de chargement.</div>;

  const deptData = Object.entries(data.byDepartment).map(([name, value]) => ({ name, value }));
  const contratData = Object.entries(data.byContrat).map(([name, value]) => ({ name, value }));

  const chargesData = [
    { name: "CNAPS", value: data.totalCnaps },
    { name: "OSTIE", value: data.totalOstie },
    { name: "IRSA", value: data.totalIrsa },
    { name: "Net versé", value: data.totalNet },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold flex items-center gap-3">
          <Activity className="h-8 w-8 text-primary" /> Tableau de Bord RH
        </h1>
        <p className="text-muted-foreground mt-1">Période : <span className="font-mono font-semibold">{data.month}</span></p>
      </div>

      {/* KPIs employés */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase flex items-center gap-1"><Users className="h-3 w-3" /> Total Employés</p>
          <p className="text-3xl font-bold mt-2">{data.totalEmployees}</p>
          <p className="text-xs text-muted-foreground mt-1">{data.activeEmployees} actifs</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase flex items-center gap-1"><Clock className="h-3 w-3" /> Présents Aujourd'hui</p>
          <p className="text-3xl font-bold mt-2 text-green-600">{data.presentToday}</p>
          <p className="text-xs text-muted-foreground mt-1">{data.absentToday} absents</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase flex items-center gap-1"><CalendarX className="h-3 w-3" /> Congés en attente</p>
          <p className="text-3xl font-bold mt-2 text-amber-600">{data.pendingLeaves}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Salaire Moyen</p>
          <p className="text-2xl font-bold mt-2">{Math.round(data.avgSalary / 1000)}k</p>
          <p className="text-xs text-muted-foreground mt-1">MGA / mois</p>
        </Card>
      </div>

      {/* KPIs paie */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-primary/30">
          <p className="text-xs text-muted-foreground uppercase flex items-center gap-1"><Banknote className="h-3 w-3" /> Masse Salariale</p>
          <p className="text-xl font-bold mt-2 text-primary">{fmt(data.masseSalariale)}</p>
          <p className="text-xs text-muted-foreground mt-1">{data.payrollGenerated} fiches générées</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">CNAPS Salarié</p>
          <p className="text-xl font-bold mt-2">{fmt(data.totalCnaps)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">OSTIE Salarié</p>
          <p className="text-xl font-bold mt-2">{fmt(data.totalOstie)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> IRSA</p>
          <p className="text-xl font-bold mt-2">{fmt(data.totalIrsa)}</p>
        </Card>
      </div>

      {/* Badges statuts */}
      <div className="flex gap-2 flex-wrap">
        <Badge className="bg-green-100 text-green-800">{data.activeEmployees} Actifs</Badge>
        {data.suspendedEmployees > 0 && <Badge className="bg-amber-100 text-amber-800">{data.suspendedEmployees} Suspendus</Badge>}
        {data.exitedEmployees > 0 && <Badge variant="secondary">{data.exitedEmployees} Sortis</Badge>}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Répartition par Département</h3>
          {deptData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Aucun département configuré</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={deptData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                  {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Types de Contrat</h3>
          {contratData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={contratData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                  {contratData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Répartition Masse Salariale ({data.month})</h3>
          {data.masseSalariale === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Aucune paie générée ce mois</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chargesData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="name" width={60} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="value" fill="#1a6c3c" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
