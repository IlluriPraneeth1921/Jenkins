import nodemailer from "nodemailer";
import type { BugSummary, EmailDraft } from "../types";
import type { RuntimeConfig } from "./config";

export function draftBugEmail(
  summary: BugSummary,
  subjectPrefix = "",
  to: string[] = [],
): EmailDraft {
  const prefix = subjectPrefix.trim() ? `${subjectPrefix.trim()} ` : "";
  const subject = `${prefix}${summary.subject}`.trim();

  const lines: string[] = [
    summary.overview,
    "",
  ];

  if (summary.bugs.length === 0) {
    lines.push("No failing scenarios were found in the latest automated execution.");
  } else {
    lines.push("Detected issues:");
    lines.push("");

    summary.bugs.forEach((bug, index) => {
      lines.push(`${index + 1}. ${bug.title} [${bug.severity}]`);
      lines.push(`   Observed: ${bug.observedBehavior}`);
      lines.push(`   Expected: ${bug.expectedBehavior}`);
      lines.push("   Reproduction:");
      bug.reproductionSteps.forEach((step) => {
        lines.push(`   - ${step}`);
      });

      if (bug.evidence.length > 0) {
        lines.push("   Evidence:");
        bug.evidence.forEach((item) => {
          lines.push(`   - ${item}`);
        });
      }

      lines.push("");
    });
  }

  lines.push("Regards,");
  lines.push("Playwright AI Assistant");

  return {
    to,
    cc: [],
    subject,
    bodyText: lines.join("\n").trim(),
  };
}

export async function sendEmail(config: RuntimeConfig, draft: EmailDraft) {
  if (
    !config.smtpHost ||
    !config.smtpUser ||
    !config.smtpPass ||
    draft.to.length === 0
  ) {
    throw new Error(
      "SMTP is not fully configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_TO in .env before sending email.",
    );
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  return transporter.sendMail({
    from: config.smtpFrom ?? config.smtpUser,
    to: draft.to.join(", "),
    cc: draft.cc.join(", "),
    subject: draft.subject,
    text: draft.bodyText,
  });
}
