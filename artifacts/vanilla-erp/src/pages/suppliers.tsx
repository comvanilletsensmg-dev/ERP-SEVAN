import { useState } from "react";
import { useGetSuppliers, getGetSuppliersQueryKey, useCreateSupplier, useUpdateSupplier } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Edit2 } from "lucide-react";

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  region: z.string().min(1, "Region is required"),
  phone: z.string().optional().or(z.literal("")),
  score: z.coerce.number().min(0).max(100).optional(),
});

type SupplierForm = z.infer<typeof supplierSchema>;

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);

  const { data: suppliers, isLoading } = useGetSuppliers({
    query: { queryKey: getGetSuppliersQueryKey() },
  });
  
  const createSupplier = useCreateSupplier({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSuppliersQueryKey() });
        setIsCreateOpen(false);
        createForm.reset();
      },
    },
  });

  const updateSupplier = useUpdateSupplier({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSuppliersQueryKey() });
        setEditSupplierId(null);
        editForm.reset();
      },
    },
  });

  const createForm = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", region: "", phone: "", score: 100 },
  });

  const editForm = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
  });

  const onCreateSubmit = (data: SupplierForm) => {
    createSupplier.mutate({ data: { ...data, phone: data.phone || null } });
  };

  const onEditSubmit = (data: SupplierForm) => {
    if (editSupplierId) {
      updateSupplier.mutate({ id: editSupplierId, data: { ...data, phone: data.phone || null } });
    }
  };

  const openEdit = (supplier: any) => {
    editForm.reset({
      name: supplier.name,
      region: supplier.region,
      phone: supplier.phone || "",
      score: supplier.score,
    });
    setEditSupplierId(supplier.id);
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Suppliers</h2>
          <p className="text-muted-foreground mt-1">Manage local vanilla growers and collectors</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Supplier</DialogTitle>
              <DialogDescription>Register a new supplier to track purchases.</DialogDescription>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...createForm.register("name")} />
                {createForm.formState.errors.name && <p className="text-xs text-destructive">{createForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input id="region" {...createForm.register("region")} />
                {createForm.formState.errors.region && <p className="text-xs text-destructive">{createForm.formState.errors.region.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (Optional)</Label>
                <Input id="phone" {...createForm.register("phone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="score">Trust Score (0-100)</Label>
                <Input id="score" type="number" {...createForm.register("score")} />
              </div>
              <Button type="submit" className="w-full" disabled={createSupplier.isPending}>
                {createSupplier.isPending ? "Saving..." : "Save Supplier"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editSupplierId} onOpenChange={(open) => !open && setEditSupplierId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
            <DialogDescription>Update supplier details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" {...editForm.register("name")} />
              {editForm.formState.errors.name && <p className="text-xs text-destructive">{editForm.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-region">Region</Label>
              <Input id="edit-region" {...editForm.register("region")} />
              {editForm.formState.errors.region && <p className="text-xs text-destructive">{editForm.formState.errors.region.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone (Optional)</Label>
              <Input id="edit-phone" {...editForm.register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-score">Trust Score (0-100)</Label>
              <Input id="edit-score" type="number" {...editForm.register("score")} />
            </div>
            <Button type="submit" className="w-full" disabled={updateSupplier.isPending}>
              {updateSupplier.isPending ? "Updating..." : "Update Supplier"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading suppliers...</TableCell>
              </TableRow>
            ) : suppliers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No suppliers found.</TableCell>
              </TableRow>
            ) : (
              suppliers?.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell>{supplier.region}</TableCell>
                  <TableCell>{supplier.phone || "-"}</TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      supplier.score >= 90 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      supplier.score >= 70 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {supplier.score}/100
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(supplier)}>
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
