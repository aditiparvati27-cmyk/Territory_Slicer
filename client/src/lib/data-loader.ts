import Papa from "papaparse";
import type { Account, Rep } from "@/lib/logic";

export const DEFAULT_REPS_URL = "/data/sample-reps.csv";
export const DEFAULT_ACCOUNTS_URL = "/data/sample-accounts.csv";

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
  suggestions?: string[];
  warnings?: string[];
};

// ---------------------------------------------------------------------------
// BOM stripping — handles Excel-exported UTF-8 files with BOM prefix
// ---------------------------------------------------------------------------

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ---------------------------------------------------------------------------
// Delimiter detection — supports CSV (comma) and TSV (tab) files
// ---------------------------------------------------------------------------

function detectDelimiter(text: string): string {
  const firstLine = (text.split(/\r?\n/)[0] ?? "");
  // If the first line has tabs, treat as TSV
  if (firstLine.includes("\t")) return "\t";
  return ",";
}

// ---------------------------------------------------------------------------
// Parse headers from the first line using the detected delimiter
// ---------------------------------------------------------------------------

function parseHeaders(csvText: string): string[] {
  const firstLine = (csvText.split(/\r?\n/)[0] ?? "").trim();
  const delimiter = detectDelimiter(csvText);
  return firstLine.split(delimiter).map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Column name similarity — suggests correct column names for common mistakes
// ---------------------------------------------------------------------------

const COLUMN_SYNONYMS: Record<string, string[]> = {
  Account_ID: ["account id", "accountid", "id", "account_id"],
  Account_Name: ["account name", "accountname", "company", "company name", "name", "account_name"],
  Current_Rep: ["current rep", "currentrep", "rep", "owner", "account owner", "current_rep"],
  ARR: ["arr", "revenue", "annual revenue", "mrr", "contract value", "annual_revenue"],
  Location: ["location", "state", "region", "territory", "geo", "geography", "country"],
  Num_Employees: ["num employees", "numemployees", "employees", "employee count", "headcount", "size", "num_employees"],
  Num_Marketers: ["num marketers", "nummarketers", "marketers", "marketing", "num_marketers"],
  Risk_Score: ["risk score", "riskscore", "risk", "churn risk", "health score", "risk_score"],
  Rep_Name: ["rep name", "repname", "rep", "sales rep", "salesperson", "rep_name"],
  Segment: ["segment", "tier", "category", "type", "account type"],
};

function suggestColumn(header: string): string | null {
  const lower = header.toLowerCase().trim();
  for (const [canonical, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    if (synonyms.includes(lower)) return canonical;
  }
  return null;
}

function buildSuggestions(headers: string[], missing: string[]): string[] {
  const suggestions: string[] = [];
  for (const h of headers) {
    const suggestion = suggestColumn(h);
    if (suggestion && missing.includes(suggestion)) {
      suggestions.push(`Found "${h}" — did you mean "${suggestion}"?`);
    }
  }
  return suggestions;
}

// ---------------------------------------------------------------------------
// Row-level validation for accounts
// ---------------------------------------------------------------------------

function validateAccountRows(accounts: Account[]): string[] {
  const warnings: string[] = [];

  if (accounts.length === 0) {
    warnings.push("File contains no data rows (only headers).");
    return warnings;
  }

  // Check for duplicate Account_IDs
  const ids = accounts.map(a => a.Account_ID).filter(Boolean);
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  if (dupes.size > 0) {
    const examples = Array.from(dupes).slice(0, 3).join(", ");
    warnings.push(`Found ${dupes.size} duplicate Account_ID(s): ${examples}${dupes.size > 3 ? "..." : ""}.`);
  }

  // Check for rows with zero/missing ARR
  const zeroArr = accounts.filter(a => !a.ARR || a.ARR <= 0);
  if (zeroArr.length > 0) {
    warnings.push(`${zeroArr.length} account(s) have zero or missing ARR values.`);
  }

  // Check for rows with missing Account_Name
  const noName = accounts.filter(a => !a.Account_Name || String(a.Account_Name).trim() === "");
  if (noName.length > 0) {
    warnings.push(`${noName.length} account(s) have missing Account_Name.`);
  }

  return warnings;
}

export function parseCsvText<T>(
  text: string,
  opts?: {
    dynamicTyping?: boolean;
  }
): T[] {
  const clean = stripBom(text);
  const delimiter = detectDelimiter(clean);

  const parsed = Papa.parse(clean, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: opts?.dynamicTyping ?? false,
    delimiter,
  });

  return (parsed.data ?? []) as T[];
}

// ---------------------------------------------------------------------------
// Coerce numeric fields — handles comma-formatted numbers like "245,600"
// ---------------------------------------------------------------------------

const ACCOUNT_NUMERIC_FIELDS: (keyof Account)[] = [
  "ARR",
  "Num_Employees",
  "Num_Marketers",
  "Risk_Score",
];

function coerceNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // Strip commas from formatted numbers like "245,600"
    const cleaned = value.replace(/,/g, "").trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function normalizeAccounts(raw: Record<string, unknown>[]): Account[] {
  return raw.map((row) => {
    const normalized: Record<string, unknown> = { ...row };
    for (const field of ACCOUNT_NUMERIC_FIELDS) {
      normalized[field] = coerceNumber(row[field]);
    }
    return normalized as unknown as Account;
  });
}

function missingHeaders(headers: string[], required: string[]) {
  const set = new Set(headers.map((h) => h.trim()));
  return required.filter((r) => !set.has(r));
}

export function validateRepCsvHeader(csvText: string) {
  const headers = parseHeaders(csvText);
  const required = ["Rep_Name", "Location", "Segment"];
  return {
    ok: missingHeaders(headers, required).length === 0,
    missing: missingHeaders(headers, required),
    headers,
  };
}

export function validateAccountCsvHeader(csvText: string) {
  const headers = parseHeaders(csvText);
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
  const rawAccounts = parseCsvText<Record<string, unknown>>(accountsText, { dynamicTyping: true });
  const accounts = normalizeAccounts(rawAccounts);

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
}): Promise<DatasetState & { warnings?: string[] }> {
  const [repsTextRaw, accountsTextRaw] = await Promise.all([
    readFileText(params.repsFile),
    readFileText(params.accountsFile),
  ]);

  const repsText = stripBom(repsTextRaw);
  const accountsText = stripBom(accountsTextRaw);

  // Empty file checks
  if (repsText.trim().length === 0) {
    throw {
      title: "Reps file is empty",
      message: "The uploaded Reps CSV file contains no data. Please select a valid CSV file.",
    } satisfies DatasetError;
  }
  if (accountsText.trim().length === 0) {
    throw {
      title: "Accounts file is empty",
      message: "The uploaded Accounts CSV file contains no data. Please select a valid CSV file.",
    } satisfies DatasetError;
  }

  const repHeader = validateRepCsvHeader(repsText);
  if (!repHeader.ok) {
    const suggestions = buildSuggestions(repHeader.headers, repHeader.missing);
    throw {
      title: "Reps CSV is missing required columns",
      message: `Missing: ${repHeader.missing.join(", ")}. Found columns: ${repHeader.headers.join(", ")}.`,
      suggestions: suggestions.length > 0 ? suggestions : ["Download the template to see the expected column names."],
    } satisfies DatasetError;
  }

  const accountHeader = validateAccountCsvHeader(accountsText);
  if (!accountHeader.ok) {
    const suggestions = buildSuggestions(accountHeader.headers, accountHeader.missing);
    throw {
      title: "Accounts CSV is missing required columns",
      message: `Missing: ${accountHeader.missing.join(", ")}. Found columns: ${accountHeader.headers.join(", ")}.`,
      suggestions: suggestions.length > 0 ? suggestions : ["Download the template to see the expected column names."],
    } satisfies DatasetError;
  }

  const reps = parseCsvText<Rep>(repsText);
  const rawAccounts = parseCsvText<Record<string, unknown>>(accountsText, { dynamicTyping: true });
  const accounts = normalizeAccounts(rawAccounts);

  // Row-level validation
  const warnings = validateAccountRows(accounts);

  if (reps.length === 0) {
    throw {
      title: "No reps found",
      message: "The Reps CSV has headers but no data rows. Add at least one rep.",
    } satisfies DatasetError;
  }

  return {
    reps,
    accounts,
    source: "uploaded",
    loadedAt: Date.now(),
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
