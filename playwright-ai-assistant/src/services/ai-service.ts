import OpenAI from "openai";
import type {
  BugSummary,
  ExecutionSummary,
  GeneratedTestCaseSet,
  ReviewResult,
  TestCase,
} from "../types";
import { timestampLabel } from "../utils";
import type { RuntimeConfig } from "./config";

function extractJsonBlock(content: string): string {
  const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return content.trim();
}

function buildClient(config: RuntimeConfig): OpenAI | null {
  if (!config.openAiApiKey) {
    return null;
  }

  return new OpenAI({
    apiKey: config.openAiApiKey,
    baseURL: config.openAiBaseUrl,
  });
}

function parseTitleFromRequirements(requirements: string): string {
  const applicationLine = requirements
    .split(/\r?\n/)
    .find((line) => /target application|application/i.test(line));

  if (!applicationLine) {
    return "Target Application";
  }

  const [, rhs = "Target Application"] = applicationLine.split(":");
  return rhs.trim() || "Target Application";
}

function parseTargetUrlFromRequirements(
  requirements: string,
  defaultUrl: string,
): string {
  const urlMatch = requirements.match(/https?:\/\/[^\s)]+/i);
  return urlMatch?.[0] ?? defaultUrl;
}

function parseMarkdownTestCases(markdown: string): TestCase[] {
  const sections = markdown.split(/\n(?=###\s+)/g).map((chunk) => chunk.trim());
  const cases: TestCase[] = [];

  sections.forEach((section, index) => {
    if (!section.startsWith("###")) {
      return;
    }

    const titleLine = section.split(/\r?\n/)[0]?.replace(/^###\s*/, "").trim() ?? "";
    const idMatch = titleLine.match(/(TC-\d+)/i);
    const title = titleLine.replace(/TC-\d+\s*-\s*/i, "").trim() || `Scenario ${index + 1}`;

    const preconditionsBlock = section.match(
      /- Preconditions:\s*([\s\S]*?)(?:\n- Steps:|\n- Expected Result:|$)/i,
    )?.[1];
    const stepsBlock = section.match(
      /- Steps:\s*([\s\S]*?)(?:\n- Expected Result:|$)/i,
    )?.[1];
    const expectedBlock = section.match(
      /- Expected Result:\s*([\s\S]*?)$/i,
    )?.[1];

    const normalizeList = (value: string | undefined): string[] =>
      (value ?? "")
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
        .filter(Boolean);

    const preconditions = normalizeList(preconditionsBlock);
    const steps = normalizeList(stepsBlock);
    const expectedItems = normalizeList(expectedBlock);

    cases.push({
      id: idMatch?.[1]?.toUpperCase() ?? `TC-${String(index + 1).padStart(3, "0")}`,
      title,
      priority: /negative|reject|empty|validation/i.test(title) ? "High" : index < 2 ? "High" : "Medium",
      type: /negative|reject|empty|validation/i.test(title)
        ? "Negative"
        : /delete|remove/i.test(title)
          ? "Regression"
          : "Functional",
      preconditions:
        preconditions.length > 0 ? preconditions : ["Application is reachable."],
      steps: steps.length > 0 ? steps : ["Execute the described scenario."],
      expectedResult:
        expectedItems.join(" ") ||
        "The application behaves as described in the scenario.",
    });
  });

  return cases;
}

export class AIService {
  private readonly client: OpenAI | null;

  constructor(private readonly config: RuntimeConfig) {
    this.client = buildClient(config);
  }

  async generateTestCasesFromRequirements(
    requirements: string,
  ): Promise<GeneratedTestCaseSet> {
    const applicationName = parseTitleFromRequirements(requirements);
    const targetUrl = parseTargetUrlFromRequirements(
      requirements,
      this.config.baseUrl,
    );
    const aiCases = await this.requirementsToCasesWithAi(requirements);
    const fallbackCases = fallbackRequirementsToCases(requirements);

    return {
      applicationName,
      targetUrl,
      generatedAt: timestampLabel(),
      source: aiCases ? "ai" : "fallback",
      testCases: aiCases ?? fallbackCases,
    };
  }

  async generatePlaywrightScript(
    testCaseSet: GeneratedTestCaseSet,
  ): Promise<string> {
    const aiScript = await this.casesToScriptWithAi(
      testCaseSet.testCases,
      testCaseSet.targetUrl,
      testCaseSet.applicationName,
    );

    return (
      aiScript ??
      fallbackCasesToScript(
        testCaseSet.testCases,
        testCaseSet.targetUrl,
        testCaseSet.applicationName,
      )
    );
  }

  async reviewPlaywrightScript(scriptContents: string): Promise<ReviewResult> {
    const aiReview = await this.reviewScriptWithAi(scriptContents);
    const fallback = fallbackReview(scriptContents);

    return {
      ...(aiReview ?? fallback),
      score:
        aiReview?.score ??
        (fallback.findings.some((item) => item.severity === "high") ? 6 : 8),
      extractedSuggestions: [],
    };
  }

  parseTestCasesInput(contents: string): GeneratedTestCaseSet {
    const trimmed = contents.trim();
    const applicationName = "Manual Test Case Input";
    const targetUrl = this.config.baseUrl;

    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed) as GeneratedTestCaseSet;
      return {
        applicationName: parsed.applicationName || applicationName,
        targetUrl: parsed.targetUrl || targetUrl,
        generatedAt: parsed.generatedAt || timestampLabel(),
        source: parsed.source || "manual",
        testCases: parsed.testCases || [],
      };
    }

    return {
      applicationName,
      targetUrl,
      generatedAt: timestampLabel(),
      source: "manual",
      testCases: parseMarkdownTestCases(contents),
    };
  }

  private async requirementsToCasesWithAi(
    requirements: string,
  ): Promise<TestCase[] | null> {
    if (!this.client) {
      return null;
    }

    const prompt = `
You are a senior QA automation architect.
Convert the following requirements into exhaustive functional, negative, boundary, and UX-oriented test cases.
Return JSON only with this shape:
{
  "testCases": [
    {
      "id": "TC-001",
      "title": "short title",
      "priority": "High|Medium|Low",
      "type": "Functional|Negative|Boundary|Usability|Regression",
      "preconditions": ["..."],
      "steps": ["..."],
      "expectedResult": "..."
    }
  ]
}

Requirements:
${requirements}
  `.trim();

    const response = await this.client.responses.create({
      model: this.config.openAiModel,
      input: prompt,
    });

    const content = response.output_text?.trim();
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(extractJsonBlock(content)) as {
      testCases?: TestCase[];
    };

    return parsed.testCases ?? null;
  }

  private async casesToScriptWithAi(
    testCases: TestCase[],
    targetUrl: string,
    appName: string,
  ): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    const prompt = `
You are a senior Playwright + TypeScript engineer.
Generate a single Playwright test file for the application "${appName}" at "${targetUrl}".
Use @playwright/test.
Prefer resilient selectors (roles, labels, placeholders, text).
Include one test per provided case where practical.
Keep the output as plain TypeScript code only.

Test cases:
${JSON.stringify(testCases, null, 2)}
  `.trim();

    const response = await this.client.responses.create({
      model: this.config.openAiModel,
      input: prompt,
    });

    return response.output_text?.trim() ?? null;
  }

  private async reviewScriptWithAi(
    scriptContents: string,
  ): Promise<ReviewResult | null> {
    if (!this.client) {
      return null;
    }

    const prompt = `
You are a strict QA reviewer.
Review the following Playwright TypeScript test script for:
- missing assertions
- flaky selectors
- missing negative paths
- missing setup/teardown assumptions
- maintainability concerns

Return JSON only with this shape:
{
  "verdict": "approved" | "changes_requested",
  "summary": "short summary",
  "findings": [
    {
      "severity": "high|medium|low",
      "title": "finding title",
      "details": "what should change"
    }
  ]
}

Script:
${scriptContents}
  `.trim();

    const response = await this.client.responses.create({
      model: this.config.openAiModel,
      input: prompt,
    });

    const content = response.output_text?.trim();
    if (!content) {
      return null;
    }

    return JSON.parse(extractJsonBlock(content)) as ReviewResult;
  }
}

export function fallbackRequirementsToCases(requirements: string): TestCase[] {
  const lines = requirements
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const featureHint = lines.slice(0, 5).join(" ").slice(0, 100) || "application";

  return [
    {
      id: "TC-001",
      title: "Create a new item successfully",
      priority: "High",
      type: "Functional",
      preconditions: ["Application is reachable", "User is on the main page"],
      steps: [
        "Open the application",
        "Enter a valid item title",
        "Submit the form",
      ],
      expectedResult: "The item is created and visible in the list.",
    },
    {
      id: "TC-002",
      title: "Reject empty submission",
      priority: "High",
      type: "Negative",
      preconditions: ["Application is reachable", "User is on the main page"],
      steps: [
        "Open the application",
        "Leave the main input empty",
        "Attempt to submit the form",
      ],
      expectedResult:
        "The application blocks invalid submission or shows validation.",
    },
    {
      id: "TC-003",
      title: "Toggle completion state",
      priority: "Medium",
      type: "Functional",
      preconditions: [
        "Application is reachable",
        "At least one item already exists",
      ],
      steps: [
        "Open the application",
        "Mark an existing item as completed",
        "Observe the completion style or status",
      ],
      expectedResult:
        "The item switches to completed state and the change is reflected in the UI.",
    },
    {
      id: "TC-004",
      title: "Delete an existing item",
      priority: "Medium",
      type: "Regression",
      preconditions: [
        "Application is reachable",
        "At least one item already exists",
      ],
      steps: [
        "Open the application",
        "Delete an existing item",
        "Refresh or re-check the list",
      ],
      expectedResult: "The deleted item is removed from the list.",
    },
    {
      id: "TC-005",
      title: `Boundary and usability sweep for ${featureHint}`,
      priority: "Low",
      type: "Boundary",
      preconditions: ["Application is reachable"],
      steps: [
        "Use short, long, and whitespace-heavy input values where applicable",
        "Confirm visible labels, placeholders, and button states guide the user",
      ],
      expectedResult:
        "Boundary inputs are handled safely and the UI remains understandable.",
    },
  ];
}

function escapeTemplateLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

export function fallbackCasesToScript(
  testCases: TestCase[],
  targetUrl: string,
  appName: string,
): string {
  const title = escapeTemplateLiteral(appName);
  const baseUrl = escapeTemplateLiteral(targetUrl);
  const createCase = testCases.find((item) => /create|add/i.test(item.title));
  const toggleCase = testCases.find((item) => /toggle|complete/i.test(item.title));
  const deleteCase = testCases.find((item) => /delete|remove/i.test(item.title));

  const generatedLabel = `AI Generated ${timestampLabel()}`;

  return `import { test, expect } from "@playwright/test";

const baseUrl = "${baseUrl}";

test.describe("${title} generated suite", () => {
  test("loads the main page", async ({ page }) => {
    await page.goto(baseUrl);
    await expect(page).toHaveURL(/.*todos?/i);
    await expect(page.getByRole("button", { name: /add/i })).toBeVisible();
  });

  ${
    createCase
      ? `test("${escapeTemplateLiteral(createCase.title)}", async ({ page }) => {
    await page.goto(baseUrl);
    const input = page.getByPlaceholder(/do laundry/i);
    await input.fill("${generatedLabel}");
    await page.getByRole("button", { name: /add/i }).click();
    await expect(page.getByText("${generatedLabel}")).toBeVisible();
  });`
      : ""
  }

  ${
    toggleCase
      ? `test("${escapeTemplateLiteral(toggleCase.title)}", async ({ page }) => {
    await page.goto(baseUrl);
    const input = page.getByPlaceholder(/do laundry/i);
    await input.fill("${generatedLabel} toggle");
    await page.getByRole("button", { name: /add/i }).click();

    const itemRow = page.locator(".list-group-item", {
      has: page.getByText("${generatedLabel} toggle"),
    });

    await itemRow.getByRole("checkbox").check();
    await expect(itemRow).toHaveClass(/todo-complete/);
  });`
      : ""
  }

  ${
    deleteCase
      ? `test("${escapeTemplateLiteral(deleteCase.title)}", async ({ page }) => {
    await page.goto(baseUrl);
    const input = page.getByPlaceholder(/do laundry/i);
    await input.fill("${generatedLabel} delete");
    await page.getByRole("button", { name: /add/i }).click();

    const itemRow = page.locator(".list-group-item", {
      has: page.getByText("${generatedLabel} delete"),
    });

    await expect(itemRow).toBeVisible();
    await itemRow.getByTitle(/delete/i).click();
    await expect(page.getByText("${generatedLabel} delete")).toHaveCount(0);
  });`
      : ""
  }
});
`;
}

export function fallbackReview(scriptContents: string): ReviewResult {
  const findings: ReviewResult["findings"] = [];

  if (!/expect\(/.test(scriptContents)) {
    findings.push({
      severity: "high",
      title: "Missing assertions",
      details: "Add at least one expectation per test so failures are explicit.",
    });
  }

  if (/locator\(".*nth-child|\/\/|css=/.test(scriptContents)) {
    findings.push({
      severity: "medium",
      title: "Potentially fragile selectors",
      details:
        "Prefer role, label, placeholder, or text-based selectors over brittle structural selectors.",
    });
  }

  if (!/test\.describe/.test(scriptContents)) {
    findings.push({
      severity: "low",
      title: "Missing suite grouping",
      details: "Wrap related tests in test.describe for readability.",
    });
  }

  return {
    verdict: findings.some((item) => item.severity === "high")
      ? "changes_requested"
      : "approved",
    score: findings.some((item) => item.severity === "high") ? 6 : 8,
    summary:
      findings.length === 0
        ? "The script looks structurally sound for a first pass."
        : "The script needs targeted improvements before wider execution.",
    findings,
    extractedSuggestions: [],
  };
}

