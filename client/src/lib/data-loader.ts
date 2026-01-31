import Papa from "papaparse";
import type { Account, Rep } from "@/lib/logic";

export const DEFAULT_REPS_URL = "/data/GTM-Engineer_Challenge_-_Reps_(1)_1769598230595.csv";
export const DEFAULT_ACCOUNTS_URL = "/data/GTM-Engineer_Challenge_-_Accounts_(1)_1769598619158.csv";

export const REPS_TEMPLATE_URL = "/data/reps-template.csv";
export const ACCOUNTS_TEMPLATE_URL = "/data/accounts-template.csv";

export type DatasetSource = "default" | "uploaded";

export type DatasetState = {
  reps: Rep[];
  accounts: Account[];
  source: DatasetSource;
  loadedAt: number;
};

export type DatasetError = {
  title: string;
  message: string;
};

export function parseCsvText<T>(
  text: string,
  opts?: {
    dynamicTyping?: boolean;
  }
): T[] {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: opts?.dynamicTyping ?? false,
  });

  return (parsed.data ?? []) as T[];
}

function missingHeaders(headers: string[], required: string[]) {
  const set = new Set(headers.map((h) => h.trim()));
  return required.filter((r) => !set.has(r));
}

export function validateRepCsvHeader(csvText: string) {
  const firstLine = (csvText.split(/\r?\n/)[0] ?? "").trim();
  const headers = firstLine.split(",").map((s) => s.trim()).filter(Boolean);
  const required = ["Rep_Name", "Location", "Segment"];
  return {
    ok: missingHeaders(headers, required).length === 0,
    missing: missingHeaders(headers, required),
    headers,
  };
}

export function validateAccountCsvHeader(csvText: string) {
  const firstLine = (csvText.split(/\r?\n/)[0] ?? "").trim();
  const headers = firstLine.split(",").map((s) => s.trim()).filter(Boolean);
  const required = [
    "Account_ID",
    "Account_Name",
    "Current_Rep",
    "ARR",
    "Location",
    "Num_Employees",
    "Num_Marketers",
    "Risk_Score",
  ];
  return {
    ok: missingHeaders(headers, required).length === 0,
    missing: missingHeaders(headers, required),
    headers,
  };
}

export async function readFileText(file: File) {
  return await file.text();
}

export async function loadDefaultDataset(): Promise<DatasetState> {
  const [repsRes, accountsRes] = await Promise.all([
    fetch(DEFAULT_REPS_URL),
    fetch(DEFAULT_ACCOUNTS_URL),
  ]);

  const [repsText, accountsText] = await Promise.all([
    repsRes.text(),
    accountsRes.text(),
  ]);

  const reps = parseCsvText<Rep>(repsText);
  const accounts = parseCsvText<Account>(accountsText, { dynamicTyping: true });

  return {
    reps,
    accounts,
    source: "default",
    loadedAt: Date.now(),
  };
}

export async function loadUploadedDataset(params: {
  repsFile: File;
  accountsFile: File;
}): Promise<DatasetState> {
  const [repsText, accountsText] = await Promise.all([
    readFileText(params.repsFile),
    readFileText(params.accountsFile),
  ]);

  const repHeader = validateRepCsvHeader(repsText);
  if (!repHeader.ok) {
    throw {
      title: "Reps CSV is missing columns",
      message: `Missing: ${repHeader.missing.join(", ")}. Download the template and keep the same headers.`,
    } satisfies DatasetError;
  }

  const accountHeader = validateAccountCsvHeader(accountsText);
  if (!accountHeader.ok) {
    throw {
      title: "Accounts CSV is missing columns",
      message: `Missing: ${accountHeader.missing.join(", ")}. Download the template and keep the same headers.`,
    } satisfies DatasetError;
  }

  const reps = parseCsvText<Rep>(repsText);
  const accounts = parseCsvText<Account>(accountsText, { dynamicTyping: true });

  return {
    reps,
    accounts,
    source: "uploaded",
    loadedAt: Date.now(),
  };
}
