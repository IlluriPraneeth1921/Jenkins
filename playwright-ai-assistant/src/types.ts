export type TestPriority = "High" | "Medium" | "Low";

export type TestCaseType =
  | "Functional"
  | "Negative"
  | "Boundary"
  | "Usability"
  | "Regression";

export type TestCase = {
  id: string;
  title: string;
  priority: TestPriority;
  type: TestCaseType;
  preconditions: string[];
  steps: string[];
  expectedResult: string;
};

export type GeneratedTestCaseSet = {
  applicationName: string;
  targetUrl: string;
  generatedAt: string;
  source: "ai" | "fallback" | "manual";
  testCases: TestCase[];
};

export type ReviewFinding = {
  severity: "high" | "medium" | "low";
  title: string;
  details: string;
};

export type ReviewResult = {
  verdict: "approved" | "changes_requested";
  summary: string;
  score: number;
  findings: ReviewFinding[];
  extractedSuggestions: string[];
};

export type ExecutionFailure = {
  title: string;
  suite?: string;
  location?: string;
  errorMessage: string;
};

export type ExecutionSummary = {
  reportName: string;
  specPath: string;
  baseUrl: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  exitCode: number;
  failures: ExecutionFailure[];
  rawReportPath: string;
  htmlReportPath: string;
  generatedAt: string;
};

export type Bug = {
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  observedBehavior: string;
  expectedBehavior: string;
  reproductionSteps: string[];
  evidence: string[];
};

export type BugSummary = {
  subject: string;
  overview: string;
  bugs: Bug[];
};

export type EmailDraft = {
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
};
