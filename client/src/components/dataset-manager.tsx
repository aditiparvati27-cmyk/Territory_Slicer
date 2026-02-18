import { useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Account, Rep } from "@/lib/logic";
import {
  ACCOUNTS_TEMPLATE_URL,
  REPS_TEMPLATE_URL,
  loadUploadedDataset,
  type DatasetError,
  type DatasetSource,
} from "@/lib/data-loader";
import { Upload, Download, RefreshCw, FileText, AlertTriangle } from "lucide-react";

export function DatasetManager({
  source,
  onDatasetLoaded,
  onResetDefault,
}: {
  source: DatasetSource;
  onDatasetLoaded: (next: { reps: Rep[]; accounts: Account[]; source: DatasetSource }) => void;
  onResetDefault: () => void | Promise<void>;
}) {
  const repsRef = useRef<HTMLInputElement | null>(null);
  const accountsRef = useRef<HTMLInputElement | null>(null);

  const [repsFile, setRepsFile] = useState<File | null>(null);
  const [accountsFile, setAccountsFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DatasetError | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const ready = useMemo(() => Boolean(repsFile && accountsFile), [repsFile, accountsFile]);

  async function downloadTemplate(url: string, filename: string) {
    const res = await fetch(url);
    const blob = await res.blob();
    saveAs(blob, filename);
  }

  async function applyUpload() {
    if (!repsFile || !accountsFile) return;

    try {
      setBusy(true);
      setError(null);
      setWarnings([]);

      const loaded = await loadUploadedDataset({ repsFile, accountsFile });
      onDatasetLoaded({ reps: loaded.reps, accounts: loaded.accounts, source: "uploaded" });

      if (loaded.warnings) setWarnings(loaded.warnings);

      setRepsFile(null);
      setAccountsFile(null);
      if (repsRef.current) repsRef.current.value = "";
      if (accountsRef.current) accountsRef.current.value = "";
    } catch (e: any) {
      const next: DatasetError =
        e && typeof e === "object" && "title" in e && "message" in e
          ? (e as DatasetError)
          : {
              title: "Could not load dataset",
              message: "Please make sure your files are valid CSVs and match the templates.",
            };
      setError(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/10 bg-card/50 p-4 shadow-lg backdrop-blur-sm" data-testid="card-dataset-manager">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium" data-testid="text-dataset-title">
            Dataset
          </div>
          <div className="mt-1 text-xs text-muted-foreground" data-testid="text-dataset-subtitle">
            Upload new CSV or TSV files (same schema) or use the default dataset.
          </div>
        </div>

        <div className="flex items-center gap-2" data-testid="group-dataset-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResetDefault()}
            disabled={busy || source === "default"}
            data-testid="button-reset-default"
          >
            <RefreshCw className="h-4 w-4" />
            Default
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="group-dataset-source">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Active:</span>
        <span
          className={
            source === "default"
              ? "rounded-full border border-chart-2/30 bg-chart-2/10 px-2 py-0.5 text-[11px] font-medium text-chart-2"
              : "rounded-full border border-chart-1/30 bg-chart-1/10 px-2 py-0.5 text-[11px] font-medium text-chart-1"
          }
          data-testid="badge-dataset-source"
        >
          {source === "default" ? "Default dataset" : "Uploaded dataset"}
        </span>
      </div>

      {error ? (
        <div className="mt-3" data-testid="alert-dataset-error">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <div>
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>
                {error.message}
                {error.suggestions && error.suggestions.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 text-xs">
                    {error.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
              </AlertDescription>
            </div>
          </Alert>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mt-3" data-testid="alert-dataset-warnings">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <div>
              <AlertTitle>Data warnings</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </div>
          </Alert>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3" data-testid="group-dataset-upload">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Reps CSV
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadTemplate(REPS_TEMPLATE_URL, "reps-template.csv")}
              disabled={busy}
              data-testid="button-download-reps-template"
            >
              <Download className="h-4 w-4" />
              Template
            </Button>
          </div>

          <input
            ref={repsRef}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            onChange={(e) => setRepsFile(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-md border border-input bg-background/40 px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground"
            data-testid="input-upload-reps"
          />
          <div className="text-[11px] text-muted-foreground" data-testid="text-reps-file">
            {repsFile ? repsFile.name : "No file selected"}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Accounts CSV
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadTemplate(ACCOUNTS_TEMPLATE_URL, "accounts-template.csv")}
              disabled={busy}
              data-testid="button-download-accounts-template"
            >
              <Download className="h-4 w-4" />
              Template
            </Button>
          </div>

          <input
            ref={accountsRef}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            onChange={(e) => setAccountsFile(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-md border border-input bg-background/40 px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground"
            data-testid="input-upload-accounts"
          />
          <div className="text-[11px] text-muted-foreground" data-testid="text-accounts-file">
            {accountsFile ? accountsFile.name : "No file selected"}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-muted-foreground" data-testid="text-dataset-help">
            Upload both files, then apply. CSV and TSV supported. Files must match the template headers.
          </div>
          <Button
            onClick={applyUpload}
            disabled={!ready || busy}
            data-testid="button-apply-dataset"
          >
            <Upload className="h-4 w-4" />
            {busy ? "Loading…" : "Apply dataset"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
