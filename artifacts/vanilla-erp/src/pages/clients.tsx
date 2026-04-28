import { useState } from "react";
import { useGetClients, getGetClientsQueryKey, useCreateClient } from "@workspace/api-client-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

const clientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  country: z.string().min(1, "Country is required"),
  email: z.string().email().optional().or(z.literal("")),
  currency: z.enum(["MGA", "USD", "EUR"]),
});

type ClientForm = z.infer<typeof clientSchema>;

export default function Clients() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { data: clients, isLoading } = useGetClients({
    query: { queryKey: getGetClientsQueryKey() },
  });
  
  const createClient = useCreateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
    },
  });

  const form = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: "", country: "", email: "", currency: "USD" },
  });

  const onSubmit = (data: ClientForm) => {
    createClient.mutate({ data: { ...data, email: data.email || null } });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">International Clients</h2>
          <p className="text-muted-foreground mt-1">Manage global export partners</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>Register an international buyer.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name</Label>
                <Input id="name" {...form.register("name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input id="country" {...form.register("country")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Preferred Currency</Label>
                <Select onValueChange={(val: any) => form.setValue("currency", val)} defaultValue="USD">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="MGA">MGA (Ar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createClient.isPending}>
                {createClient.isPending ? "Saving..." : "Save Client"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Currency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading clients...</TableCell>
              </TableRow>
            ) : clients?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No clients found.</TableCell>
              </TableRow>
            ) : (
              clients?.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{client.country}</TableCell>
                  <TableCell>{client.email || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{client.currency}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
