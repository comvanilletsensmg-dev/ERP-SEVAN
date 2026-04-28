import { useState } from "react";
import {
  useGetPurchases, getGetPurchasesQueryKey,
  useCreatePurchase,
  useGetSuppliers, getGetSuppliersQueryKey,
  useGetLots, getGetLotsQueryKey,
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
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const purchaseSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  weight: z.coerce.number().min(0.1, "Weight is required"),
  pricePerKg: z.coerce.number().min(1, "Price per kg is required"),
  totalAmount: z.coerce.number().min(1, "Total amount is required"),
  paymentMethod: z.enum(["cash", "mobile_money", "bank_transfer"]),
  humidity: z.coerce.number().min(0).max(100, "Humidity must be 0–100"),
});

type PurchaseForm = z.infer<typeof purchaseSchema>;

export default function Purchases() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: purchases, isLoading } = useGetPurchases({
    query: { queryKey: getGetPurchasesQueryKey() },
  });

  const { data: suppliers } = useGetSuppliers({
    query: { queryKey: getGetSuppliersQueryKey() },
  });

  const createPurchase = useCreatePurchase({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: getGetPurchasesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() });
        setIsDialogOpen(false);
        form.reset();
        toast({
          title: "Purchase recorded",
          description: `Lot ${data?.lot?.code} created automatically (status: raw)`,
        });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Failed to record purchase", variant: "destructive" });
      },
    },
  });

  const form = useForm<PurchaseForm>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { supplierId: "", weight: 0, pricePerKg: 0, totalAmount: 0, paymentMethod: "cash", humidity: 0 },
  });

  // Auto-compute total amount when weight or pricePerKg changes
  const weight = form.watch("weight");
  const pricePerKg = form.watch("pricePerKg");

  const onSubmit = (data: PurchaseForm) => {
    createPurchase.mutate({ data });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Purchases</h2>
          <p className="text-muted-foreground mt-1">Record green vanilla acquisitions — automatically creates a lot & stock movement</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Record Purchase
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Purchase</DialogTitle>
              <DialogDescription>
                A lot (VAN-YYYY-XXXX) and stock movement (IN) will be created automatically.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select onValueChange={(val) => form.setValue("supplierId", val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.region})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.supplierId && <p className="text-xs text-destructive">{form.formState.errors.supplierId.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    {...form.register("weight")}
                    onChange={(e) => {
                      form.setValue("weight", parseFloat(e.target.value) || 0);
                      form.setValue("totalAmount", Math.round((parseFloat(e.target.value) || 0) * (pricePerKg || 0)));
                    }}
                  />
                  {form.formState.errors.weight && <p className="text-xs text-destructive">{form.formState.errors.weight.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Humidity %</Label>
                  <Input type="number" step="0.1" {...form.register("humidity")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price / kg (MGA)</Label>
                  <Input
                    type="number"
                    step="100"
                    {...form.register("pricePerKg")}
                    onChange={(e) => {
                      form.setValue("pricePerKg", parseFloat(e.target.value) || 0);
                      form.setValue("totalAmount", Math.round((weight || 0) * (parseFloat(e.target.value) || 0)));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total Amount (MGA)</Label>
                  <Input type="number" step="1" {...form.register("totalAmount")} />
                  <p className="text-xs text-muted-foreground">Auto-computed</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select onValueChange={(val: any) => form.setValue("paymentMethod", val)} defaultValue="cash">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={createPurchase.isPending}>
                {createPurchase.isPending ? "Recording..." : "Record Purchase & Create Lot"}
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
              <TableHead className="text-right">Weight (kg)</TableHead>
              <TableHead className="text-right">Price/kg</TableHead>
              <TableHead>Lot Created</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Amount (MGA)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading purchases...</TableCell>
              </TableRow>
            ) : purchases?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No purchases recorded yet.</TableCell>
              </TableRow>
            ) : (
              purchases?.map((purchase: any) => (
                <TableRow key={purchase.id}>
                  <TableCell className="text-sm">{format(new Date(purchase.createdAt), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-medium">{purchase.supplier?.name || "—"}</TableCell>
                  <TableCell className="text-right">{purchase.weight}</TableCell>
                  <TableCell className="text-right text-sm">Ar {purchase.pricePerKg?.toLocaleString()}</TableCell>
                  <TableCell>
                    {purchase.lotId ? (
                      <Badge variant="secondary" className="font-mono text-xs">linked</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="capitalize text-sm">{purchase.paymentMethod?.replace("_", " ")}</TableCell>
                  <TableCell className="text-right font-medium">Ar {purchase.totalAmount?.toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
