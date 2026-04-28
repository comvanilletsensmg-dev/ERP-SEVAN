import { useState } from "react";
import { 
  useGetSales, getGetSalesQueryKey, 
  useCreateSale, 
  useGetClients, getGetClientsQueryKey,
  useGetLots, getGetLotsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Plus, Trash2 } from "lucide-react";

const saleSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  totalAmount: z.coerce.number().min(0.1, "Total amount is required"),
  currency: z.enum(["MGA", "USD", "EUR"]),
  incoterm: z.enum(["FOB", "CIF", "EXW", "DDP"]),
  items: z.array(z.object({
    lotId: z.string().min(1, "Lot is required"),
    quantity: z.coerce.number().min(0.1, "Quantity required"),
    price: z.coerce.number().min(0.1, "Price required"),
  })).min(1, "At least one item is required"),
});

type SaleForm = z.infer<typeof saleSchema>;

export default function Sales() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { data: sales, isLoading } = useGetSales({
    query: { queryKey: getGetSalesQueryKey() },
  });
  
  const { data: clients } = useGetClients({
    query: { queryKey: getGetClientsQueryKey() },
  });
  
  const { data: lots } = useGetLots({
    query: { queryKey: getGetLotsQueryKey() },
  });

  const createSale = useCreateSale({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSalesQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
    },
  });

  const form = useForm<SaleForm>({
    resolver: zodResolver(saleSchema),
    defaultValues: { 
      clientId: "", 
      totalAmount: 0, 
      currency: "USD",
      incoterm: "FOB",
      items: [{ lotId: "", quantity: 0, price: 0 }]
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const onSubmit = (data: SaleForm) => {
    createSale.mutate({ data });
  };

  const readyLots = lots?.filter(l => l.status === "ready") || [];

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Export Sales</h2>
          <p className="text-muted-foreground mt-1">Manage global shipments and contracts</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Sale
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record Export Sale</DialogTitle>
              <DialogDescription>Create a new sale contract for international shipment.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select onValueChange={(val) => form.setValue("clientId", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Incoterm</Label>
                  <Select onValueChange={(val: any) => form.setValue("incoterm", val)} defaultValue="FOB">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FOB">FOB (Free on Board)</SelectItem>
                      <SelectItem value="CIF">CIF (Cost, Insurance & Freight)</SelectItem>
                      <SelectItem value="EXW">EXW (Ex Works)</SelectItem>
                      <SelectItem value="DDP">DDP (Delivered Duty Paid)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Lots Included</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ lotId: "", quantity: 0, price: 0 })}>
                    <Plus className="w-4 h-4 mr-2" /> Add Lot
                  </Button>
                </div>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-end">
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs">Select Lot (Ready Only)</Label>
                      <Select onValueChange={(val) => form.setValue(`items.${index}.lotId`, val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Lot code" />
                        </SelectTrigger>
                        <SelectContent>
                          {readyLots.map(l => (
                            <SelectItem key={l.id} value={l.id}>{l.code} ({l.weightCurrent}kg avail)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24 space-y-2">
                      <Label className="text-xs">Qty (kg)</Label>
                      <Input type="number" step="0.1" {...form.register(`items.${index}.quantity` as const)} />
                    </div>
                    <div className="w-24 space-y-2">
                      <Label className="text-xs">Unit Price</Label>
                      <Input type="number" step="0.1" {...form.register(`items.${index}.price` as const)} />
                    </div>
                    <Button type="button" variant="destructive" size="icon" className="mb-0.5" onClick={() => remove(index)} disabled={fields.length === 1}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Total Amount</Label>
                  <Input type="number" step="0.01" {...form.register("totalAmount")} />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select onValueChange={(val: any) => form.setValue("currency", val)} defaultValue="USD">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="MGA">MGA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <Button type="submit" className="w-full" disabled={createSale.isPending}>
                {createSale.isPending ? "Creating..." : "Create Sale Contract"}
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
              <TableHead>Client</TableHead>
              <TableHead>Incoterm</TableHead>
              <TableHead>Lots</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading sales...</TableCell>
              </TableRow>
            ) : sales?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No sales recorded.</TableCell>
              </TableRow>
            ) : (
              sales?.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>{format(new Date(sale.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell className="font-medium">{sale.client?.name || sale.clientId}</TableCell>
                  <TableCell>{sale.incoterm}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {sale.items?.length || 0} items
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {sale.currency === 'USD' ? '$' : sale.currency === 'EUR' ? '€' : 'Ar '}
                    {sale.totalAmount.toLocaleString()}
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
