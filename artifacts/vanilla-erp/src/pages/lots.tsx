import { useState, useEffect } from "react";
import { 
  useGetLots, getGetLotsQueryKey, 
  useCreateLot,
  useUpdateLot,
  useGetSuppliers, getGetSuppliersQueryKey 
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
  DialogTrigger,
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
import { Plus, Edit2 } from "lucide-react";

const lotSchema = z.object({
  code: z.string().min(1, "Code is required"),
  supplierId: z.string().min(1, "Supplier is required"),
  weightInitial: z.coerce.number().min(0.1, "Initial weight is required"),
  weightCurrent: z.coerce.number().min(0.1, "Current weight is required"),
  humidity: z.coerce.number().min(0).max(100),
  grade: z.enum(["gourmet", "standard", "commercial"]),
  status: z.enum(["curing", "drying", "ready", "sold"]),
});

const updateLotSchema = z.object({
  weightCurrent: z.coerce.number().min(0.1, "Current weight is required").optional(),
  humidity: z.coerce.number().min(0).max(100).optional(),
  grade: z.enum(["gourmet", "standard", "commercial"]).optional(),
  status: z.enum(["curing", "drying", "ready", "sold"]).optional(),
});

type LotForm = z.infer<typeof lotSchema>;
type UpdateLotForm = z.infer<typeof updateLotSchema>;

export default function Lots() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editLotId, setEditLotId] = useState<string | null>(null);
  
  const { data: lots, isLoading } = useGetLots({
    query: { queryKey: getGetLotsQueryKey() },
  });
  
  const { data: suppliers } = useGetSuppliers({
    query: { queryKey: getGetSuppliersQueryKey() },
  });

  const createLot = useCreateLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() });
        setIsCreateOpen(false);
        createForm.reset();
      },
    },
  });

  const updateLot = useUpdateLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() });
        setEditLotId(null);
        updateForm.reset();
      }
    }
  });

  const createForm = useForm<LotForm>({
    resolver: zodResolver(lotSchema),
    defaultValues: { 
      code: "", 
      supplierId: "", 
      weightInitial: 0, 
      weightCurrent: 0, 
      humidity: 0,
      grade: "gourmet",
      status: "curing"
    },
  });

  const updateForm = useForm<UpdateLotForm>({
    resolver: zodResolver(updateLotSchema),
  });

  const onCreateSubmit = (data: LotForm) => {
    createLot.mutate({ data });
  };

  const onUpdateSubmit = (data: UpdateLotForm) => {
    if (editLotId) {
      updateLot.mutate({ id: editLotId, data });
    }
  };

  const openEdit = (lot: any) => {
    updateForm.reset({
      weightCurrent: lot.weightCurrent,
      humidity: lot.humidity,
      grade: lot.grade,
      status: lot.status,
    });
    setEditLotId(lot.id);
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "curing": return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Curing</Badge>;
      case "drying": return <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Drying</Badge>;
      case "ready": return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Ready</Badge>;
      case "sold": return <Badge variant="outline" className="text-muted-foreground">Sold</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Lots Inventory</h2>
          <p className="text-muted-foreground mt-1">Track vanilla batches through processing stages</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Lot
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Register New Lot</DialogTitle>
              <DialogDescription>Add a new batch of vanilla to inventory.</DialogDescription>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Lot Code</Label>
                  <Input id="code" placeholder="e.g. L-2023-01" {...createForm.register("code")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplierId">Supplier</Label>
                  <Select onValueChange={(val) => createForm.setValue("supplierId", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers?.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weightInitial">Initial Weight (kg)</Label>
                  <Input id="weightInitial" type="number" step="0.1" {...createForm.register("weightInitial")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weightCurrent">Current Weight (kg)</Label>
                  <Input id="weightCurrent" type="number" step="0.1" {...createForm.register("weightCurrent")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="humidity">Humidity %</Label>
                  <Input id="humidity" type="number" step="0.1" {...createForm.register("humidity")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grade">Grade</Label>
                  <Select onValueChange={(val: any) => createForm.setValue("grade", val)} defaultValue="gourmet">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gourmet">Gourmet</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select onValueChange={(val: any) => createForm.setValue("status", val)} defaultValue="curing">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="curing">Curing</SelectItem>
                    <SelectItem value="drying">Drying</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createLot.isPending}>
                {createLot.isPending ? "Saving..." : "Create Lot"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editLotId} onOpenChange={(open) => !open && setEditLotId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Lot</DialogTitle>
            <DialogDescription>Modify current weight, humidity, grade, or status.</DialogDescription>
          </DialogHeader>
          <form onSubmit={updateForm.handleSubmit(onUpdateSubmit)} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-weightCurrent">Current Weight (kg)</Label>
                <Input id="edit-weightCurrent" type="number" step="0.1" {...updateForm.register("weightCurrent")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-humidity">Humidity %</Label>
                <Input id="edit-humidity" type="number" step="0.1" {...updateForm.register("humidity")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-grade">Grade</Label>
                <Select onValueChange={(val: any) => updateForm.setValue("grade", val)} value={updateForm.watch("grade")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gourmet">Gourmet</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select onValueChange={(val: any) => updateForm.setValue("status", val)} value={updateForm.watch("status")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="curing">Curing</SelectItem>
                    <SelectItem value="drying">Drying</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={updateLot.isPending}>
              {updateLot.isPending ? "Updating..." : "Update Lot"}
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
              <TableHead className="text-right">Weight (kg)</TableHead>
              <TableHead className="text-right">Humidity</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading lots...</TableCell>
              </TableRow>
            ) : lots?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No lots recorded.</TableCell>
              </TableRow>
            ) : (
              lots?.map((lot) => (
                <TableRow key={lot.id}>
                  <TableCell className="font-mono text-xs font-medium">{lot.code}</TableCell>
                  <TableCell>{lot.supplier?.name || lot.supplierId}</TableCell>
                  <TableCell className="text-right">
                    <span className="font-medium">{lot.weightCurrent}</span>
                    <span className="text-xs text-muted-foreground ml-1">/ {lot.weightInitial}</span>
                  </TableCell>
                  <TableCell className="text-right">{lot.humidity}%</TableCell>
                  <TableCell className="capitalize text-xs">{lot.grade}</TableCell>
                  <TableCell>{getStatusBadge(lot.status)}</TableCell>
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
