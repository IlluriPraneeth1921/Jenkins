# Playwright AI Assistant

This starter project adds an AI-assisted Playwright + TypeScript workflow for the use case you described:

1. Give **requirements** -> generate **test cases**
2. Give **test cases** -> generate **Playwright scripts**
3. **Review** the generated script
4. **Execute** the tests
5. Detect failures and summarize likely **bugs**
6. Draft or send an **email report**

It is built as a standalone automation workspace under this repository, so you can adapt it to any web application.

## What is included

- TypeScript CLI for the full workflow
- Playwright configuration for Chromium
- OpenAI-compatible integration for generation and review
- Fallback logic when no AI key is configured
- JSON execution summaries from Playwright
- Email draft and SMTP sending support
- Sample requirements and test cases for the Django todo app already present in this repository

## Project structure

```text
playwright-ai-assistant/
├── .env.example
├── playwright.config.ts
├── samples/
│   ├── todo-requirements.md
│   └── todo-test-cases.md
├── src/
│   ├── cli.ts
│   ├── types.ts
│   ├── utils.ts
│   └── services/
│       ├── ai-service.ts
│       ├── config.ts
│       ├── email-service.ts
│       ├── file-service.ts
│       ├── playwright-service.ts
│       └── report-service.ts
└── tsconfig.json
```

## Install

From the project directory:

```bash
npm install
npm run install:browsers
```

## Configure environment

Copy the example file:

```bash
cp .env.example .env
```

Important variables:

- `OPENAI_API_KEY`: your AI provider key
- `OPENAI_MODEL`: model name, for example `gpt-4.1-mini`
- `OPENAI_BASE_URL`: optional custom endpoint for compatible providers
- `BASE_URL`: target application URL for Playwright
- `SMTP_*`: SMTP configuration if you want automatic sending
- `EMAIL_TO`: default recipients for bug email drafts

If you do not set `OPENAI_API_KEY`, the tool still works using deterministic fallback generation and review logic.

## CLI commands

### 1) Requirements -> test cases

```bash
npm run generate:cases -- --input samples/todo-requirements.md --output generated-tests/test-cases.json
```

Output: `generated-tests/test-cases.json`

### 2) Test cases -> Playwright script

You can provide either:
- generated JSON from the previous step, or
- a human-written markdown file like `samples/todo-test-cases.md`

```bash
npm run generate:scripts -- --input generated-tests/test-cases.json --output generated-tests/todo.generated.spec.ts
```

Or directly from manual test cases:

```bash
npm run generate:scripts -- --input samples/todo-test-cases.md --output generated-tests/todo.generated.spec.ts
```

### 3) Review the generated script

```bash
npm run review:script -- --input generated-tests/todo.generated.spec.ts --output reports/review-report.json
```

Output: `reports/review-report.json`

### 4) Run tests

```bash
npm run run:tests -- --spec generated-tests/todo.generated.spec.ts --base-url http://127.0.0.1:8000/todos
```

Outputs:
- `reports/execution-summary.json`
- `reports/playwright-results.json`
- `playwright-report/index.html`

### 5) Draft an email report

```bash
npm run draft:email -- --input reports/execution-summary.json --output reports/bug-email-draft.json
```

Output: `reports/bug-email-draft.json`

### 6) Send the email report

```bash
npm run draft:email -- --input reports/execution-summary.json --send
```

SMTP variables must be configured first.

### 7) Run the whole flow

```bash
npm run ai:test -- full-flow --requirements samples/todo-requirements.md --base-url http://127.0.0.1:8000/todos
```

## End-to-end example with the Django todo app in this repo

This repository already contains a small Django todo application under:

```text
python-jenkins-argocd-k8s/
```

The UI supports these scenarios:

- open todo list
- add a todo item
- mark a todo item complete
- delete a todo item

If you start that app separately on port 8000, set:

```bash
BASE_URL=http://127.0.0.1:8000/todos
```

Then run:

```bash
npm run generate:cases -- --input samples/todo-requirements.md --output generated-tests/test-cases.json
npm run generate:scripts -- --input generated-tests/test-cases.json --output generated-tests/todo.generated.spec.ts
npm run review:script -- --input generated-tests/todo.generated.spec.ts --output reports/review-report.json
npm run run:tests -- --spec generated-tests/todo.generated.spec.ts --base-url http://127.0.0.1:8000/todos
npm run draft:email -- --input reports/execution-summary.json --output reports/bug-email-draft.json
```

## Typical usage in your workflow

### If you give requirements

1. Put the requirements into a markdown file
2. Run `requirements-to-cases`
3. Run `cases-to-script`
4. Run `review-script`
5. Run `run-tests`
6. Run `draft-email` or `draft-email --send`

### If you give test cases directly

1. Put the test cases into a markdown or JSON file
2. Run `cases-to-script`
3. Run `review-script`
4. Run `run-tests`
5. Run `draft-email` or `draft-email --send`

## Notes and extension ideas

- Connect this to CI/CD so each pull request triggers script generation and test execution
- Replace the fallback logic with stricter structured prompting if you want richer AI outputs
- Add browser console capture and network logging for stronger bug triage
- Add Jira or Linear ticket creation if you want automatic defect filing
- Add multiple models or prompts for generation vs review

## Important limitation

This framework can identify likely defects from failed tests and draft a useful email summary, but it does not prove root cause by itself. For stronger bug diagnosis, combine Playwright failures with backend logs, browser console capture, screenshots, traces, and application monitoring.
