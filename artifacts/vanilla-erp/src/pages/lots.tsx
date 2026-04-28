import { useState } from "react";
import {
  useGetLots, getGetLotsQueryKey,
  useUpdateLot,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit2, Info } from "lucide-react";

const updateLotSchema = z.object({
  weightCurrent: z.coerce.number().min(0.01).optional(),
  humidity: z.coerce.number().min(0).max(100).optional(),
  grade: z.enum(["gourmet", "standard", "commercial"]).optional(),
  status: z.enum(["raw", "curing", "drying", "ready", "sold"]).optional(),
});

type UpdateLotForm = z.infer<typeof updateLotSchema>;

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "raw": return <Badge variant="secondary" className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">Raw</Badge>;
    case "curing": return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Curing</Badge>;
    case "drying": return <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Drying</Badge>;
    case "ready": return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Ready ✓</Badge>;
    case "sold": return <Badge variant="outline" className="text-muted-foreground">Sold</Badge>;
    default: return <Badge>{status}</Badge>;
  }
}

export default function Lots() {
  const queryClient = useQueryClient();
  const [editLot, setEditLot] = useState<any>(null);

  const { data: lots, isLoading } = useGetLots({
    query: { queryKey: getGetLotsQueryKey() },
  });

  const updateLot = useUpdateLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() });
        setEditLot(null);
        form.reset();
      },
    },
  });

  const form = useForm<UpdateLotForm>({
    resolver: zodResolver(updateLotSchema),
  });

  const openEdit = (lot: any) => {
    form.reset({
      weightCurrent: lot.weightCurrent,
      humidity: lot.humidity,
      grade: lot.grade ?? undefined,
      status: lot.status,
    });
    setEditLot(lot);
  };

  const onSubmit = (data: UpdateLotForm) => {
    if (editLot) updateLot.mutate({ id: editLot.id, data });
  };

  const lossPercent = (lot: any) => {
    if (!lot.weightInitial || lot.weightInitial === 0) return 0;
    return Math.round((1 - lot.weightCurrent / lot.weightInitial) * 100 * 10) / 10;
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Lots Inventory</h2>
          <p className="text-muted-foreground mt-1">Track vanilla batches through processing stages</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-2">
          <Info className="w-3.5 h-3.5" />
          Lots are created automatically when a purchase is recorded
        </div>
      </div>

      <Dialog open={!!editLot} onOpenChange={(open) => !open && setEditLot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Lot — {editLot?.code}</DialogTitle>
            <DialogDescription>
              Record weight loss and processing progress. A LOSS movement will be created automatically if weight decreases.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Weight (kg)</Label>
                <Input type="number" step="0.01" {...form.register("weightCurrent")} />
                {editLot && (
                  <p className="text-xs text-muted-foreground">Initial: {editLot.weightInitial}kg</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Humidity %</Label>
                <Input type="number" step="0.1" {...form.register("humidity")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Grade</Label>
                <Select onValueChange={(val: any) => form.setValue("grade", val)} value={form.watch("grade")}>
                  <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gourmet">Gourmet</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select onValueChange={(val: any) => form.setValue("status", val)} value={form.watch("status")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raw">Raw</SelectItem>
                    <SelectItem value="curing">Curing</SelectItem>
                    <SelectItem value="drying">Drying</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={updateLot.isPending}>
              {updateLot.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Initial (kg)</TableHead>
              <TableHead className="text-right">Current (kg)</TableHead>
              <TableHead className="text-right">Loss</TableHead>
              <TableHead className="text-right">Humidity</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Loading lots...</TableCell>
              </TableRow>
            ) : lots?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No lots yet. Record a purchase to automatically create a lot.
                </TableCell>
              </TableRow>
            ) : (
              lots?.map((lot) => (
                <TableRow key={lot.id}>
                  <TableCell className="font-mono text-xs font-semibold">{lot.code}</TableCell>
                  <TableCell className="text-sm">{lot.supplier?.name || "—"}</TableCell>
                  <TableCell className="text-right text-sm">{lot.weightInitial}</TableCell>
                  <TableCell className="text-right font-medium">{lot.weightCurrent}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {lossPercent(lot) > 0 ? `-${lossPercent(lot)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">{lot.humidity}%</TableCell>
                  <TableCell className="capitalize text-xs">{lot.grade || "—"}</TableCell>
                  <TableCell><StatusBadge status={lot.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(lot)}>
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
