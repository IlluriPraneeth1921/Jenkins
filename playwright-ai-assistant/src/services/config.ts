import dotenv from "dotenv";
import path from "node:path";
import { ensureDir, projectRoot } from "../utils";

dotenv.config({ path: path.join(projectRoot, ".env") });

export interface RuntimeConfig {
  openAiApiKey?: string;
  openAiModel: string;
  openAiBaseUrl?: string;
  baseUrl: string;
  reportsDir: string;
  generatedDir: string;
  projectRoot: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  emailRecipients: string[];
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const reportsDir = path.join(projectRoot, "reports");
  const generatedDir = path.join(projectRoot, "generated-tests");

  ensureDir(reportsDir);
  ensureDir(generatedDir);
  ensureDir(path.join(generatedDir, "cases"));
  ensureDir(path.join(generatedDir, "specs"));
  ensureDir(path.join(reportsDir, "emails"));

  return {
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    openAiBaseUrl: process.env.OPENAI_BASE_URL,
    baseUrl: process.env.BASE_URL ?? "http://127.0.0.1:8000/todos",
    reportsDir,
    generatedDir,
    projectRoot,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseNumber(process.env.SMTP_PORT, 587),
    smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
    emailRecipients: (process.env.EMAIL_TO ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}
