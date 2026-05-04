import type { BugSummary, ExecutionSummary, ReviewResult } from "../types";

export function extractReviewSuggestions(review: ReviewResult): string[] {
  const suggestions = review.findings.map(
    (finding) => `[${finding.severity}] ${finding.title}: ${finding.details}`,
  );

  if (suggestions.length === 0) {
    suggestions.push("No review findings were reported.");
  }

  return suggestions;
}

export function extractFailureSummaryFromResults(
  summary: ExecutionSummary,
): BugSummary {
  if (summary.failed === 0 || summary.failures.length === 0) {
    return {
      subject: `No bugs detected in ${summary.reportName}`,
      overview:
        "The latest Playwright execution completed without failing tests. Review the HTML report for additional observations if needed.",
      bugs: [],
    };
  }

  return {
    subject: `Playwright detected ${summary.failed} failure(s) in ${summary.reportName}`,
    overview:
      "The automated suite found one or more failures that should be reviewed as potential application defects.",
    bugs: summary.failures.map((failure) => ({
      title: failure.title,
      severity: "High",
      observedBehavior: failure.errorMessage,
      expectedBehavior: "The Playwright scenario should complete successfully and all assertions should pass.",
      reproductionSteps: [
        `Open the application at ${summary.baseUrl}.`,
        `Run the Playwright spec at ${summary.specPath}.`,
        `Observe the failure in the scenario "${failure.title}".`,
      ],
      evidence: [
        failure.errorMessage,
        summary.rawReportPath,
        summary.htmlReportPath,
      ].filter(Boolean),
    })),
  };
}
