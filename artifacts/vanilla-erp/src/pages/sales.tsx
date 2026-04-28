import { useState } from "react";
import {
  useGetSales, getGetSalesQueryKey,
  useCreateSale,
  useGetClients, getGetClientsQueryKey,
  useGetLots, getGetLotsQueryKey,
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
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const saleSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  currency: z.enum(["MGA", "USD", "EUR"]),
  incoterm: z.enum(["FOB", "CIF", "EXW", "DDP"]),
  items: z.array(z.object({
    lotId: z.string().min(1, "Lot is required"),
    quantity: z.coerce.number().min(0.1, "Quantity required"),
    price: z.coerce.number().min(0.01, "Price required"),
  })).min(1, "At least one item is required"),
});

type SaleForm = z.infer<typeof saleSchema>;

export default function Sales() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: sales, isLoading } = useGetSales({ query: { queryKey: getGetSalesQueryKey() } });
  const { data: clients } = useGetClients({ query: { queryKey: getGetClientsQueryKey() } });
  const { data: lots } = useGetLots({ query: { queryKey: getGetLotsQueryKey() } });

  const readyLots = lots?.filter((l: any) => l.status === "ready") || [];

  const createSale = useCreateSale({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSalesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() });
        setIsDialogOpen(false);
        setServerError(null);
        form.reset();
        toast({ title: "Sale recorded", description: "Stock movements and accounting entry created." });
      },
      onError: (err: any) => {
        const message = err?.response?.data?.error || err?.message || "Failed to record sale";
        setServerError(message);
      },
    },
  });

  const form = useForm<SaleForm>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      clientId: "",
      currency: "USD",
      incoterm: "FOB",
      items: [{ lotId: "", quantity: 0, price: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const items = form.watch("items");
  const computedTotal = items.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0);

  const onSubmit = (data: SaleForm) => {
    setServerError(null);
    createSale.mutate({ data });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Export Sales</h2>
          <p className="text-muted-foreground mt-1">Only lots with "ready" status can be sold</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setServerError(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" disabled={readyLots.length === 0}>
              <Plus className="w-4 h-4" />
              New Sale
              {readyLots.length === 0 && <span className="text-xs opacity-60 ml-1">(no ready lots)</span>}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record Export Sale</DialogTitle>
              <DialogDescription>
                Stock will be checked and decremented automatically. Total is computed from items.
              </DialogDescription>
            </DialogHeader>

            {serverError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {serverError}
              </div>
            )}

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-2">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2 col-span-1">
                  <Label>Client</Label>
                  <Select onValueChange={(val) => form.setValue("clientId", val)}>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>
                      {clients?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.clientId && <p className="text-xs text-destructive">{form.formState.errors.clientId.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Incoterm</Label>
                  <Select onValueChange={(val: any) => form.setValue("incoterm", val)} defaultValue="FOB">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FOB">FOB</SelectItem>
                      <SelectItem value="CIF">CIF</SelectItem>
                      <SelectItem value="EXW">EXW</SelectItem>
                      <SelectItem value="DDP">DDP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select onValueChange={(val: any) => form.setValue("currency", val)} defaultValue="USD">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="MGA">MGA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Lots ({readyLots.length} available)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ lotId: "", quantity: 0, price: 0 })}>
                    <Plus className="w-4 h-4 mr-1" /> Add Lot
                  </Button>
                </div>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-end border rounded-md p-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Lot (Ready only)</Label>
                      <Select onValueChange={(val) => form.setValue(`items.${index}.lotId`, val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select lot" />
                        </SelectTrigger>
                        <SelectContent>
                          {readyLots.map((l: any) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.code} — {l.weightCurrent}kg avail — {l.grade || "no grade"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-28 space-y-1">
                      <Label className="text-xs">Qty (kg)</Label>
                      <Input type="number" step="0.1" {...form.register(`items.${index}.quantity` as const)} />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label className="text-xs">Price/kg</Label>
                      <Input type="number" step="0.01" {...form.register(`items.${index}.price` as const)} />
                    </div>
                    <Button type="button" variant="destructive" size="icon" className="shrink-0" onClick={() => remove(index)} disabled={fields.length === 1}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center border-t pt-4">
                <span className="text-sm text-muted-foreground">Computed Total</span>
                <span className="font-semibold text-lg">
                  {form.watch("currency") === "USD" ? "$" : form.watch("currency") === "EUR" ? "€" : "Ar "}
                  {computedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <Button type="submit" className="w-full" disabled={createSale.isPending}>
                {createSale.isPending ? "Processing..." : "Create Sale Contract"}
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
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading sales...</TableCell></TableRow>
            ) : sales?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No sales recorded.</TableCell></TableRow>
            ) : (
              sales?.map((sale: any) => (
                <TableRow key={sale.id}>
                  <TableCell className="text-sm">{format(new Date(sale.createdAt), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-medium">{sale.client?.name || sale.clientId}</TableCell>
                  <TableCell>{sale.incoterm}</TableCell>
                  <TableCell className="text-right text-sm">{sale.items?.length || 0}</TableCell>
                  <TableCell className="text-right font-medium">
                    {sale.currency === "USD" ? "$" : sale.currency === "EUR" ? "€" : "Ar "}
                    {sale.totalAmount?.toLocaleString()}
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
