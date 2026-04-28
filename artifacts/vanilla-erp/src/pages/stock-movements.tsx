import { useGetStockMovements, getGetStockMovementsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDownCircle, ArrowUpCircle, MinusCircle } from "lucide-react";

function MovementBadge({ type }: { type: string }) {
  if (type === "IN") return (
    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1.5">
      <ArrowDownCircle className="w-3 h-3" /> IN
    </Badge>
  );
  if (type === "OUT") return (
    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 gap-1.5">
      <ArrowUpCircle className="w-3 h-3" /> OUT
    </Badge>
  );
  return (
    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 gap-1.5">
      <MinusCircle className="w-3 h-3" /> LOSS
    </Badge>
  );
}

export default function StockMovements() {
  const { data: movements, isLoading } = useGetStockMovements({
    query: { queryKey: getGetStockMovementsQueryKey() },
  });

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-serif text-primary tracking-tight">Stock Movements</h2>
        <p className="text-muted-foreground mt-1">
          Full traceability — IN (purchases), LOSS (transformation), OUT (sales)
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Quantity (kg)</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading movements...</TableCell>
              </TableRow>
            ) : movements?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No movements yet.</TableCell>
              </TableRow>
            ) : (
              movements?.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm">{format(new Date(m.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                  <TableCell><MovementBadge type={m.type} /></TableCell>
                  <TableCell className="font-mono text-xs font-semibold">{m.lot?.code || m.lotId.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm">{m.lot?.supplier?.name || "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={m.type === "IN" ? "text-green-700" : m.type === "OUT" ? "text-blue-700" : "text-red-700"}>
                      {m.type === "IN" ? "+" : "-"}{m.quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{m.note || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
