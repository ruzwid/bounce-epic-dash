#!/usr/bin/env node
// Installs a git pre-commit hook that runs gitleaks (if available on PATH)
// before every commit. Safe to run repeatedly (idempotent) and safe to run
// in CI/non-git environments (silently no-ops if .git is missing).
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const gitDir = join(process.cwd(), ".git");
if (!existsSync(gitDir)) {
  // Not a git checkout (e.g. installed as a dependency, or a fresh clone
  // mid-setup) — nothing to hook into.
  process.exit(0);
}

const hooksDir = join(gitDir, "hooks");
mkdirSync(hooksDir, { recursive: true });

const hookPath = join(hooksDir, "pre-commit");
const hookScript = `#!/bin/sh
# Installed by scripts/install-hooks.mjs — do not edit by hand, edit that
# file instead and re-run "pnpm install" or "node scripts/install-hooks.mjs".
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "gitleaks found a likely secret in staged changes — commit blocked." >&2
    exit "$status"
  fi
else
  echo "warning: gitleaks not found on PATH — skipping secret scan for this commit." >&2
  echo "         install it (https://github.com/gitleaks/gitleaks) to enable the check." >&2
fi
`;

writeFileSync(hookPath, hookScript);
chmodSync(hookPath, 0o755);
console.log("Installed .git/hooks/pre-commit (gitleaks secret scan).");
