import { spawn } from "node:child_process";
import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "./file-service";
import type { ExecutionFailure, ExecutionSummary } from "../types";
import { timestampLabel } from "../utils";

type RunPlaywrightOptions = {
  projectRoot: string;
  specPath: string;
  baseUrl: string;
  outputPath: string;
};

type SpawnResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function collectStdout(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getLocation(spec: any): string | undefined {
  if (!spec?.location?.file) {
    return undefined;
  }

  const line = spec.location.line ?? "?";
  const column = spec.location.column ?? "?";
  return `${spec.location.file}:${line}:${column}`;
}

function parsePlaywrightJsonReport(
  reportPath: string,
  specPath: string,
  baseUrl: string,
  exitCode: number,
): ExecutionSummary {
  const report = readJsonFile<any>(reportPath);
  const suites = safeArray<any>(report?.suites);
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: ExecutionFailure[] = [];

  const visitSuite = (suite: any, parentTitle = "") => {
    const suiteTitle = [parentTitle, suite?.title].filter(Boolean).join(" > ");

    for (const spec of safeArray<any>(suite?.specs)) {
      total += 1;
      const tests = safeArray<any>(spec?.tests);
      const results = tests.flatMap((test) => safeArray<any>(test?.results));
      const statuses = results.map((result) => result?.status);
      const firstError =
        results.map((result) => result?.error).find(Boolean) ??
        tests.map((test) => test?.error).find(Boolean);

      if (statuses.includes("failed")) {
        failed += 1;
        failures.push({
          title: spec?.title ?? "Unnamed failing test",
          suite: suiteTitle || undefined,
          location: getLocation(spec),
          errorMessage:
            firstError?.message ??
            firstError?.stack ??
            "The scenario failed during Playwright execution.",
        });
      } else if (statuses.includes("passed")) {
        passed += 1;
      } else {
        skipped += 1;
      }
    }

    for (const childSuite of safeArray<any>(suite?.suites)) {
      visitSuite(childSuite, suiteTitle);
    }
  };

  for (const suite of suites) {
    visitSuite(suite);
  }

  return {
    reportName: path.basename(specPath),
    specPath,
    baseUrl,
    total,
    passed,
    failed,
    skipped,
    exitCode,
    failures,
    rawReportPath: reportPath,
    htmlReportPath: path.join(path.dirname(reportPath), "..", "playwright-report", "index.html"),
    generatedAt: timestampLabel(),
  };
}

export async function runPlaywright({
  projectRoot,
  specPath,
  baseUrl,
  outputPath,
}: RunPlaywrightOptions): Promise<ExecutionSummary> {
  const reportsDir = path.dirname(outputPath);
  const rawReportPath = path.join(reportsDir, "playwright-results.json");
  await ensureDir(reportsDir);

  const env = {
    ...process.env,
    BASE_URL: baseUrl,
    PLAYWRIGHT_JSON_OUTPUT_NAME: rawReportPath,
  };

  const args = [
    "playwright",
    "test",
    specPath,
    "--config",
    "playwright.config.ts",
    "--reporter=list,json,html",
  ];

  const result = await collectStdout("npx", args, projectRoot, env);

  if (!path.isAbsolute(rawReportPath)) {
    throw new Error("Failed to resolve Playwright raw report path.");
  }

  let summary: ExecutionSummary;
  try {
    summary = parsePlaywrightJsonReport(
      rawReportPath,
      specPath,
      baseUrl,
      result.code ?? 1,
    );
  } catch {
    writeJsonFile(rawReportPath, {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code ?? 1,
      error: "Unable to parse Playwright JSON report output.",
    });

    summary = {
      reportName: path.basename(specPath),
      specPath,
      baseUrl,
      total: 0,
      passed: 0,
      failed: 1,
      skipped: 0,
      exitCode: result.code ?? 1,
      failures: [
        {
          title: "Playwright execution failed before parsing results",
          errorMessage: result.stderr || result.stdout || "Unknown Playwright failure.",
        },
      ],
      rawReportPath,
      htmlReportPath: path.join(projectRoot, "playwright-report", "index.html"),
      generatedAt: timestampLabel(),
    };
  }

  if (summary.total === 0 && (result.code ?? 1) !== 0 && summary.failures.length === 0) {
    summary.failures.push({
      title: "Playwright execution did not run any tests",
      errorMessage:
        result.stderr ||
        result.stdout ||
        "Playwright exited without discovering executable tests.",
    });
  }

  writeJsonFile(outputPath, summary);
  return summary;
}
