import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, CheckCircle, AlertTriangle, XCircle, FileSpreadsheet, RefreshCw } from "lucide-react";

type ValidateRow = {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  duplicate: "strict" | "fuzzy" | null;
  existingId: string | null;
  action: "create" | "update";
  valid: boolean;
};

type ValidateResult = {
  total: number; valid: number; invalid: number; duplicates: number;
  rows: ValidateRow[];
};

export default function HrImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [executeResult, setExecuteResult] = useState<{ success: number; failed: number; batchId: string } | null>(null);
  const [error, setError] = useState("");

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setExecuteResult(null);
    setError("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleValidate = async () => {
    if (!file) return;
    setValidating(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/hr/import/validate", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Erreur de validation");
      }
      setResult(await r.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setValidating(false);
    }
  };

  const handleExecute = async () => {
    if (!result) return;
    setExecuting(true);
    setError("");
    try {
      const validRows = result.rows.filter((r) => r.valid);
      const r = await fetch("/api/hr/import/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows, fileName: file?.name ?? "import" }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Erreur d'import");
      }
      const res = await r.json();
      setExecuteResult(res);
      setResult(null);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = "matricule,nom,prenom,sexe,email,telephone,poste,departement,typeContrat,salaireBase,cnaps,ostie,dateEmbauche,statut\n";
    const example = "EMP001,Rakoto,Jean,M,jean@example.com,+261320000001,Technicien,Production,CDI,500000,00100001,00100001,2024-01-15,actif\n";
    const blob = new Blob(["\uFEFF" + headers + example], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "modele-import-employes.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-primary" /> Import Employés
          </h1>
          <p className="text-muted-foreground mt-1">Importez des employés depuis un fichier Excel (.xlsx) ou CSV.</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          Télécharger le modèle CSV
        </Button>
      </div>

      {/* Success */}
      {executeResult && (
        <Alert className="border-green-300 bg-green-50 dark:bg-green-900/20">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle>Import réussi !</AlertTitle>
          <AlertDescription>
            {executeResult.success} employé(s) importé(s) avec succès. {executeResult.failed > 0 && `${executeResult.failed} échec(s).`}
            <span className="text-xs ml-2 text-muted-foreground">Batch ID : {executeResult.batchId.slice(0, 8)}</span>
          </AlertDescription>
        </Alert>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Drop zone */}
      {!result && !executeResult && (
        <Card
          className={`p-10 border-2 border-dashed text-center cursor-pointer transition-colors ${file ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          {file ? (
            <div>
              <p className="font-semibold text-primary">{file.name}</p>
              <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(0)} Ko — Cliquer pour changer</p>
            </div>
          ) : (
            <div>
              <p className="text-muted-foreground font-medium">Glissez votre fichier ici</p>
              <p className="text-sm text-muted-foreground mt-1">ou cliquez pour sélectionner (.xlsx, .xls, .csv)</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </Card>
      )}

      {file && !result && !executeResult && (
        <div className="flex gap-3">
          <Button onClick={handleValidate} disabled={validating} data-testid="btn-validate">
            {validating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            {validating ? "Validation…" : "Valider le fichier"}
          </Button>
          <Button variant="outline" onClick={() => { setFile(null); setError(""); }}>Annuler</Button>
        </div>
      )}

      {/* Validation result */}
      {result && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className="bg-blue-100 text-blue-800">{result.total} lignes lues</Badge>
            <Badge className="bg-green-100 text-green-800">{result.valid} valides</Badge>
            {result.invalid > 0 && <Badge variant="destructive">{result.invalid} erreurs</Badge>}
            {result.duplicates > 0 && <Badge className="bg-amber-100 text-amber-800">{result.duplicates} doublons (mise à jour)</Badge>}
          </div>

          <Card className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Ligne</TableHead>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Poste</TableHead>
                  <TableHead>Salaire</TableHead>
                  <TableHead>Contrat</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.rowNumber} className={!row.valid ? "bg-red-50 dark:bg-red-900/10" : ""}>
                    <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                    <TableCell className="font-mono text-xs">{String(row.data.matricule ?? "")}</TableCell>
                    <TableCell>{`${row.data.nom ?? ""} ${row.data.prenom ?? ""}`.trim()}</TableCell>
                    <TableCell>{String(row.data.poste ?? "")}</TableCell>
                    <TableCell className="font-mono text-xs">{Number(row.data.salaireBase || 0).toLocaleString("fr-FR")} MGA</TableCell>
                    <TableCell>{String(row.data.typeContrat ?? "CDI")}</TableCell>
                    <TableCell>
                      <Badge variant={row.action === "create" ? "default" : "secondary"} className="text-xs">
                        {row.action === "create" ? "Créer" : "Mettre à jour"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {!row.valid ? (
                        <div className="flex flex-col gap-0.5">
                          {row.errors.map((e, i) => (
                            <span key={i} className="flex items-center gap-1 text-xs text-red-600">
                              <XCircle className="h-3 w-3" /> {e}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="h-3 w-3" /> OK
                          </span>
                          {row.warnings.map((w, i) => (
                            <span key={i} className="flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> {w}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex gap-3">
            {result.valid > 0 && (
              <Button onClick={handleExecute} disabled={executing} data-testid="btn-execute">
                {executing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {executing ? "Import en cours…" : `Importer ${result.valid} employé(s)`}
              </Button>
            )}
            <Button variant="outline" onClick={() => { setResult(null); setFile(null); }}>
              Recommencer
            </Button>
          </div>

          {result.invalid > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{result.invalid} ligne(s) invalide(s) seront ignorées</AlertTitle>
              <AlertDescription>Corrigez votre fichier pour les importer.</AlertDescription>
            </Alert>
          )}
        </>
      )}

      {/* Instructions */}
      {!result && !executeResult && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Colonnes attendues</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {[
              ["matricule", "Obligatoire — identifiant unique"],
              ["nom", "Obligatoire"],
              ["prenom", "Optionnel"],
              ["sexe", "M ou F"],
              ["email", "Email valide"],
              ["telephone", "Numéro de téléphone"],
              ["poste", "Intitulé du poste"],
              ["departement", "Département"],
              ["typeContrat", "CDI / CDD / journalier"],
              ["salaireBase", "Obligatoire — montant MGA"],
              ["cnaps", "Numéro CNAPS"],
              ["ostie", "Numéro OSTIE"],
              ["dateEmbauche", "YYYY-MM-DD"],
              ["statut", "actif / suspendu / sorti"],
            ].map(([col, desc]) => (
              <div key={col} className="flex flex-col">
                <span className="font-mono text-xs font-bold text-primary">{col}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
