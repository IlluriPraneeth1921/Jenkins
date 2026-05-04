import { Command } from "commander";
import path from "node:path";
import process from "node:process";
import { AIService } from "./services/ai-service";
import { loadRuntimeConfig } from "./services/config";
import {
  ensureDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
  writeTextFile,
} from "./services/file-service";
import { draftBugEmail, sendEmail } from "./services/email-service";
import {
  extractFailureSummaryFromResults,
  extractReviewSuggestions,
} from "./services/report-service";
import { runPlaywright } from "./services/playwright-service";
import type {
  EmailDraft,
  ExecutionSummary,
  GeneratedTestCaseSet,
  ReviewResult,
} from "./types";

const program = new Command();
const config = loadRuntimeConfig();
const ai = new AIService(config);

program
  .name("playwright-ai-assistant")
  .description(
    "AI-assisted Playwright TypeScript workflow for requirements analysis, test design, script generation, review, execution, and email reporting.",
  )
  .version("1.0.0");

program
  .command("requirements-to-cases")
  .description("Generate end-to-end test cases from a requirements document.")
  .requiredOption("-i, --input <path>", "Path to requirements text or markdown file")
  .option(
    "-o, --output <path>",
    "Path to write generated test cases JSON",
    path.join(config.generatedDir, "test-cases.json"),
  )
  .action(async (options) => {
    const requirements = readTextFile(path.resolve(options.input));
    const generated = await ai.generateTestCasesFromRequirements(requirements);
    await ensureDir(path.dirname(path.resolve(options.output)));
    writeJsonFile(path.resolve(options.output), generated);
    console.log(`Generated ${generated.testCases.length} test cases.`);
    console.log(`Saved test cases to ${path.resolve(options.output)}`);
  });

program
  .command("cases-to-script")
  .description("Generate a Playwright TypeScript spec from test cases JSON or markdown.")
  .requiredOption(
    "-i, --input <path>",
    "Path to generated test cases JSON or manual markdown test cases",
  )
  .option(
    "-o, --output <path>",
    "Path to write Playwright spec file",
    path.join(config.generatedDir, "generated.spec.ts"),
  )
  .action(async (options) => {
    const inputPath = path.resolve(options.input);
    const inputContents = readTextFile(inputPath);
    const testCases: GeneratedTestCaseSet = ai.parseTestCasesInput(inputContents);
    const spec = await ai.generatePlaywrightScript(testCases);
    await ensureDir(path.dirname(path.resolve(options.output)));
    writeTextFile(path.resolve(options.output), spec);
    console.log(`Saved Playwright spec to ${path.resolve(options.output)}`);
  });

program
  .command("review-script")
  .description("Review a Playwright script and store AI review feedback.")
  .requiredOption("-i, --input <path>", "Path to Playwright spec to review")
  .option(
    "-o, --output <path>",
    "Path to write review report JSON",
    path.join(config.reportsDir, "review-report.json"),
  )
  .action(async (options) => {
    const script = readTextFile(path.resolve(options.input));
    const review = await ai.reviewPlaywrightScript(script);
    const reviewResult: ReviewResult = {
      ...review,
      extractedSuggestions: extractReviewSuggestions(review),
    };

    await ensureDir(path.dirname(path.resolve(options.output)));
    writeJsonFile(path.resolve(options.output), reviewResult);
    console.log(`Review score: ${reviewResult.score}/10`);
    console.log(`Saved review report to ${path.resolve(options.output)}`);
  });

program
  .command("run-tests")
  .description("Execute Playwright tests and write a machine-readable summary.")
  .requiredOption("-s, --spec <path>", "Path to Playwright spec file")
  .option("--base-url <url>", "Override base URL for the Playwright run")
  .option(
    "-o, --output <path>",
    "Path to write execution summary JSON",
    path.join(config.reportsDir, "execution-summary.json"),
  )
  .action(async (options) => {
    const summary: ExecutionSummary = await runPlaywright({
      projectRoot: config.projectRoot,
      specPath: path.resolve(options.spec),
      baseUrl: options.baseUrl,
      outputPath: path.resolve(options.output),
    });

    console.log(
      `Execution complete: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`,
    );
    console.log(`Saved execution summary to ${path.resolve(options.output)}`);
  });

program
  .command("draft-email")
  .description("Draft a bug report email from execution results and optionally send it.")
  .requiredOption(
    "-i, --input <path>",
    "Path to execution summary JSON created by run-tests",
  )
  .option(
    "-o, --output <path>",
    "Path to write email draft JSON",
    path.join(config.reportsDir, "bug-email-draft.json"),
  )
  .option(
    "--send",
    "Send the generated email using SMTP config from .env",
    false,
  )
  .option(
    "--subject-prefix <text>",
    "Custom prefix to add before the generated email subject",
    "",
  )
  .action(async (options) => {
    const execution = readJsonFile<ExecutionSummary>(path.resolve(options.input));
    const failureSummary = extractFailureSummaryFromResults(execution);
    const draft: EmailDraft = draftBugEmail(
      failureSummary,
      options.subjectPrefix,
      config.emailRecipients,
    );

    await ensureDir(path.dirname(path.resolve(options.output)));
    writeJsonFile(path.resolve(options.output), draft);
    console.log(`Saved email draft to ${path.resolve(options.output)}`);

    if (options.send) {
      const sendResult = await sendEmail(config, draft);
      console.log(`Email sent to ${sendResult.accepted.join(", ")}`);
    }
  });

program
  .command("full-flow")
  .description(
    "Run the whole workflow: requirements -> test cases -> script -> review -> execute -> email draft.",
  )
  .requiredOption("-r, --requirements <path>", "Path to requirements file")
  .requiredOption("--base-url <url>", "Application base URL for Playwright execution")
  .option(
    "--cases-out <path>",
    "Path to write test cases JSON",
    path.join(config.generatedDir, "test-cases.json"),
  )
  .option(
    "--script-out <path>",
    "Path to write generated Playwright spec",
    path.join(config.generatedDir, "generated.spec.ts"),
  )
  .option(
    "--review-out <path>",
    "Path to write review JSON",
    path.join(config.reportsDir, "review-report.json"),
  )
  .option(
    "--run-out <path>",
    "Path to write execution summary JSON",
    path.join(config.reportsDir, "execution-summary.json"),
  )
  .option(
    "--email-out <path>",
    "Path to write email draft JSON",
    path.join(config.reportsDir, "bug-email-draft.json"),
  )
  .action(async (options) => {
    const requirements = readTextFile(path.resolve(options.requirements));
    await ensureDir(path.dirname(path.resolve(options.casesOut)));
    const cases = await ai.generateTestCasesFromRequirements(requirements);
    writeJsonFile(path.resolve(options.casesOut), cases);

    const spec = await ai.generatePlaywrightScript(cases);
    await ensureDir(path.dirname(path.resolve(options.scriptOut)));
    writeTextFile(path.resolve(options.scriptOut), spec);

    const review = await ai.reviewPlaywrightScript(spec);
    const reviewResult: ReviewResult = {
      ...review,
      extractedSuggestions: extractReviewSuggestions(review),
    };
    await ensureDir(path.dirname(path.resolve(options.reviewOut)));
    writeJsonFile(path.resolve(options.reviewOut), reviewResult);

    const execution = await runPlaywright({
      projectRoot: config.projectRoot,
      specPath: path.resolve(options.scriptOut),
      baseUrl: options.baseUrl,
      outputPath: path.resolve(options.runOut),
    });

    const emailDraft = draftBugEmail(
      extractFailureSummaryFromResults(execution),
      "",
      config.emailRecipients,
    );
    await ensureDir(path.dirname(path.resolve(options.emailOut)));
    writeJsonFile(path.resolve(options.emailOut), emailDraft);

    console.log("Full workflow completed.");
    console.log(`Cases: ${path.resolve(options.casesOut)}`);
    console.log(`Spec: ${path.resolve(options.scriptOut)}`);
    console.log(`Review: ${path.resolve(options.reviewOut)}`);
    console.log(`Execution: ${path.resolve(options.runOut)}`);
    console.log(`Email: ${path.resolve(options.emailOut)}`);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
