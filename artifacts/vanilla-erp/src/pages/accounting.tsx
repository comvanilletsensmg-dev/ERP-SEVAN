import { useGetJournal, getGetJournalQueryKey, useGetAccounts, getGetAccountsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookOpen } from "lucide-react";
import React from "react";

export default function Accounting() {
  const { data: entries, isLoading: journalLoading } = useGetJournal({
    query: { queryKey: getGetJournalQueryKey() },
  });

  const { data: accounts, isLoading: accountsLoading } = useGetAccounts({
    query: { queryKey: getGetAccountsQueryKey() },
  });

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Accounting Journal</h2>
          <p className="text-muted-foreground mt-1">Automated PCG 2005 accounting records</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          <Card>
            {journalLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading journal...</div>
            ) : entries?.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-foreground">No entries yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Journal entries are created automatically when you record purchases or sales.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="w-48">Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right w-32">Debit</TableHead>
                    <TableHead className="text-right w-32">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries?.map((entry) => (
                    <React.Fragment key={entry.id}>
                      {entry.lines?.map((line, index) => (
                        <TableRow key={line.id} className={index === (entry.lines?.length || 0) - 1 ? "border-b-[3px]" : "border-b-0"}>
                          <TableCell className="align-top text-xs text-muted-foreground">
                            {index === 0 && format(new Date(entry.date), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell className="align-top font-mono text-xs">
                            {index === 0 && entry.reference}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {line.account?.code}
                          </TableCell>
                          <TableCell className="text-sm truncate max-w-[200px]" title={line.account?.name}>
                            {line.account?.name}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {line.debit > 0 ? line.debit.toLocaleString() : ""}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {line.credit > 0 ? line.credit.toLocaleString() : ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
        
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="py-4">
              <CardTitle className="text-sm">PCG Accounts</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto px-4 pb-4">
                {accountsLoading ? (
                  <div className="text-center text-xs text-muted-foreground py-4">Loading accounts...</div>
                ) : (
                  <ul className="space-y-3">
                    {accounts?.map((acc) => (
                      <li key={acc.id} className="flex gap-2 items-start">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium shrink-0">
                          {acc.code}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate" title={acc.name}>{acc.name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{acc.type}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
