// Realistic PR body fixtures matching this org's review-tool template
// (see the create-bounce-pr skill) plus generic cases.

export const FILLED_BODY = `## Changes

### Context

Situation: the survey validation step previously allowed mismatched
demographic questions to slip through to production surveys.

Problem: research leads discovered mismatches only after respondents had
already started, causing rework.

Fix: this PR adds a validation pass before survey creation that checks the
template's demographic questions against the questions Excel.

### What changed

- Add \`validateDemographicQuestions\` to the survey creation pipeline
- Wire the validation error into the \`GenerateWppSurveysModal\` UI
- Add unit tests for the mismatch and match cases

## Testing

**Impact on Repositories**

<!--- If there are changes on ts-types then mark Yes. Otherwise, mark No.  -->
Is there any changes on ts-types repository? [No]

**Repositories to Review**

  - **Repository to Pull From:** [dashboard]
  - **Branch to Pull:** [BOUN-11314]
  - **Command to run:** [npm run start]
  - **Install (y or n):** [n]

## Functionality Review
<!--- Describe below step by step, how reviewer should test the functionality once all the process have started. -->

1. Run \`review-tool dashboard 1234\` to set up all services.
2. Open [dashboard](http://localhost:3002) and start a new WPP survey.
3. Upload a mismatched questions Excel and confirm the validation error appears.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
`;

export const UNFILLED_TEMPLATE_BODY = `## Changes

### Context

[Short paragraphs covering the relevant beats — Situation, Problem, Fix. See guidance below.]

### What changed

- [Concise bullets describing what was done — each bullet starts with a verb]
- [Wrap code identifiers in backticks: \`functionName\`, \`repoName\`, \`CONSTANT_NAME\`]

## Testing

**Impact on Repositories**

<!--- If there are changes on ts-types then mark Yes. Otherwise, mark No.  -->
Is there any changes on ts-types repository? [No]

**Repositories to Review**

  - **Repository to Pull From:** [dashboard]
  - **Branch to Pull:** [BOUN-99999]
  - **Command to run:** [npm run start]
  - **Install (y or n):** [n]

## Functionality Review
<!--- Describe below step by step, how reviewer should test the functionality once all the process have started. -->

[REVIEW STEPS — see guidance below]
`;

export const PLAIN_UNSTRUCTURED_BODY = "Quick fix for the flaky CI job — bumped the timeout on the emulator boot step.";

export const LONG_BODY_CONTEXT = "A".repeat(2000);
