import { useState } from "react";
import { 
  useGetPurchases, getGetPurchasesQueryKey, 
  useCreatePurchase, 
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
import { Plus } from "lucide-react";

const purchaseSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  totalAmount: z.coerce.number().min(1, "Amount is required"),
  paymentMethod: z.enum(["cash", "mobile_money", "bank_transfer"]),
});

type PurchaseForm = z.infer<typeof purchaseSchema>;

export default function Purchases() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { data: purchases, isLoading } = useGetPurchases({
    query: { queryKey: getGetPurchasesQueryKey() },
  });
  
  const { data: suppliers } = useGetSuppliers({
    query: { queryKey: getGetSuppliersQueryKey() },
  });

  const createPurchase = useCreatePurchase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPurchasesQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
    },
  });

  const form = useForm<PurchaseForm>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { supplierId: "", totalAmount: 0, paymentMethod: "cash" },
  });

  const onSubmit = (data: PurchaseForm) => {
    createPurchase.mutate({ data });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Purchases</h2>
          <p className="text-muted-foreground mt-1">Record green vanilla acquisitions</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Record Purchase
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Purchase</DialogTitle>
              <DialogDescription>Log a new acquisition of green vanilla.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="supplierId">Supplier</Label>
                <Select onValueChange={(val) => form.setValue("supplierId", val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.region})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.supplierId && <p className="text-xs text-destructive">{form.formState.errors.supplierId.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalAmount">Total Amount (MGA)</Label>
                <Input id="totalAmount" type="number" {...form.register("totalAmount")} />
                {form.formState.errors.totalAmount && <p className="text-xs text-destructive">{form.formState.errors.totalAmount.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select onValueChange={(val: any) => form.setValue("paymentMethod", val)} defaultValue={form.getValues("paymentMethod")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createPurchase.isPending}>
                {createPurchase.isPending ? "Recording..." : "Record Purchase"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead className="text-right">Amount (MGA)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading purchases...</TableCell>
              </TableRow>
            ) : purchases?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No purchases recorded yet.</TableCell>
              </TableRow>
            ) : (
              purchases?.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell>{format(new Date(purchase.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell className="font-medium">{purchase.supplier?.name || purchase.supplierId}</TableCell>
                  <TableCell className="capitalize">{purchase.paymentMethod.replace('_', ' ')}</TableCell>
                  <TableCell className="text-right font-medium">Ar {purchase.totalAmount.toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
