import { useState } from "react";
import {
  useGetPayments, getGetPaymentsQueryKey,
  useCreatePayment,
  useGetSales, getGetSalesQueryKey,
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

const paymentSchema = z.object({
  saleId: z.string().min(1, "Sale is required"),
  amount: z.coerce.number().min(0.01, "Amount is required"),
  method: z.enum(["bank", "mobile_money", "cash"]),
});

type PaymentForm = z.infer<typeof paymentSchema>;

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    bank: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    mobile_money: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    cash: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  };
  return (
    <Badge variant="secondary" className={colors[method] || ""}>
      {method.replace("_", " ")}
    </Badge>
  );
}

export default function Payments() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: payments, isLoading } = useGetPayments({ query: { queryKey: getGetPaymentsQueryKey() } });
  const { data: sales } = useGetSales({ query: { queryKey: getGetSalesQueryKey() } });

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPaymentsQueryKey() });
        setIsDialogOpen(false);
        form.reset();
        toast({
          title: "Payment recorded",
          description: "Journal entry: Débit 512 (Banque) / Crédit 411 (Clients)",
        });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Failed to record payment", variant: "destructive" });
      },
    },
  });

  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { saleId: "", amount: 0, method: "bank" },
  });

  const onSubmit = (data: PaymentForm) => {
    createPayment.mutate({ data });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Client Payments</h2>
          <p className="text-muted-foreground mt-1">Record bank receipts — generates D512 / C411 accounting entry</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Record Payment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Client Payment</DialogTitle>
              <DialogDescription>
                This will create a journal entry: Débit 512 (Banque) / Crédit 411 (Clients).
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Sale</Label>
                <Select onValueChange={(val) => form.setValue("saleId", val)}>
                  <SelectTrigger><SelectValue placeholder="Select sale" /></SelectTrigger>
                  <SelectContent>
                    {sales?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {format(new Date(s.createdAt), "dd MMM yyyy")} — {s.client?.name || s.clientId} —{" "}
                        {s.currency === "USD" ? "$" : s.currency === "EUR" ? "€" : "Ar "}{s.totalAmount?.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.saleId && <p className="text-xs text-destructive">{form.formState.errors.saleId.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Amount</Label>
                <Input type="number" step="0.01" placeholder="0.00" {...form.register("amount")} />
                {form.formState.errors.amount && <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select onValueChange={(val: any) => form.setValue("method", val)} defaultValue="bank">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={createPayment.isPending}>
                {createPayment.isPending ? "Recording..." : "Record Payment"}
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
              <TableHead>Sale</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading payments...</TableCell></TableRow>
            ) : payments?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No payments recorded yet.</TableCell></TableRow>
            ) : (
              payments?.map((payment: any) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-sm">{format(new Date(payment.createdAt), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono text-xs">{payment.saleId?.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="font-medium">{payment.sale?.client?.name || "—"}</TableCell>
                  <TableCell><MethodBadge method={payment.method} /></TableCell>
                  <TableCell className="text-right font-medium">{payment.amount?.toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
