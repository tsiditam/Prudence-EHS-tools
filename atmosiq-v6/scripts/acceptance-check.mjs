#!/usr/bin/env node
/**
 * AtmosFlow acceptance checker — executable acceptance criteria runner.
 * Exit 0 = all criteria passed. Exit 1 = at least one failed. Exit 2 = runner errored.
 * Usage: node scripts/acceptance-check.mjs --config scripts/acceptance/v2.4.json
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { argv, exit } from "node:process";

// Resolve a path relative to REPO_ROOT unless already absolute. Without
// this, path.join('/repo', '/tmp/x') returns '/repo/tmp/x' which breaks
// every /tmp/* check the spec config uses.
const resolvePath = (p) => isAbsolute(p) ? p : join(REPO_ROOT, p);

const REPO_ROOT = resolve(process.cwd());
const ARG_CONFIG_INDEX = argv.indexOf("--config");
const CONFIG_PATH = ARG_CONFIG_INDEX > -1 ? argv[ARG_CONFIG_INDEX + 1] : "scripts/acceptance/v2.4.json";
const VERBOSE = argv.includes("--verbose") || argv.includes("-v");

const ANSI = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" };
const PASS = `${ANSI.green}✓ PASS${ANSI.reset}`;
const FAIL = `${ANSI.red}✗ FAIL${ANSI.reset}`;
const SKIP = `${ANSI.yellow}~ SKIP${ANSI.reset}`;
const results = [];

const log = (msg) => console.log(msg);
const logFail = (id, label, reason) => { results.push({ id, label, status: "fail", reason }); log(`${FAIL}  ${id}  ${label}`); log(`        ${ANSI.red}${reason}${ANSI.reset}`); };
const logPass = (id, label, detail) => { results.push({ id, label, status: "pass" }); log(`${PASS}  ${id}  ${label}`); if (VERBOSE && detail) log(`        ${ANSI.dim}${detail}${ANSI.reset}`); };
const logSkip = (id, label, reason) => { results.push({ id, label, status: "skip", reason }); log(`${SKIP}  ${id}  ${label}`); log(`        ${ANSI.dim}${reason}${ANSI.reset}`); };

const fileExists = (path) => { const full = resolvePath(path); if (!existsSync(full)) return { ok: false, detail: `file not found: ${path}` }; return { ok: true, detail: `${path} (${statSync(full).size} bytes)` }; };
const fileMinSize = (path, minBytes) => { const full = resolvePath(path); if (!existsSync(full)) return { ok: false, detail: `file not found: ${path}` }; const size = statSync(full).size; if (size < minBytes) return { ok: false, detail: `${path} is ${size} bytes; expected >= ${minBytes}` }; return { ok: true, detail: `${path} (${size} bytes)` }; };
const grepMatches = (pattern, paths, { mustMatch = true, minCount = 1 } = {}) => { const existing = paths.filter((p) => existsSync(resolvePath(p))); if (existing.length === 0) { if (mustMatch) return { ok: false, detail: `none of the paths exist: ${paths.join(", ")}` }; return { ok: true, detail: `no paths to check` }; } const args = ["-rnE", pattern, ...existing]; const proc = spawnSync("grep", args, { cwd: REPO_ROOT, encoding: "utf8" }); if (proc.status === 2) return { ok: false, detail: `grep error: ${proc.stderr.trim()}` }; const matches = proc.stdout.trim().split("\n").filter(Boolean); const count = proc.status === 0 ? matches.length : 0; if (mustMatch) { if (count < minCount) return { ok: false, detail: `pattern ${pattern} matched ${count} times; need >= ${minCount}` }; return { ok: true, detail: `${count} matches across ${existing.length} path(s)` }; } else { if (count > 0) return { ok: false, detail: `pattern ${pattern} matched ${count} times; expected 0\n${matches.slice(0, 5).join("\n")}` }; return { ok: true, detail: `0 matches (as required)` }; } };
const npmScriptPasses = (scriptName) => { const proc = spawnSync("npm", ["run", scriptName, "--silent"], { cwd: REPO_ROOT, encoding: "utf8" }); if (proc.status !== 0) { const tail = ((proc.stdout || "") + "\n" + (proc.stderr || "")).split("\n").slice(-15).join("\n"); return { ok: false, detail: `npm run ${scriptName} exited ${proc.status}\n${tail}` }; } return { ok: true, detail: `npm run ${scriptName} passed` }; };
const renderedReportContains = (reportPath, needle) => { const p = resolvePath(reportPath); if (!existsSync(p)) return { ok: false, detail: `rendered report not found at ${reportPath}` }; const content = readFileSync(p, "utf8"); if (!content.includes(needle)) return { ok: false, detail: `rendered report missing required string: "${needle.slice(0, 80)}"` }; return { ok: true, detail: `found "${needle.slice(0, 60)}..."` }; };
const renderedReportExcludes = (reportPath, needle) => { const p = resolvePath(reportPath); if (!existsSync(p)) return { ok: false, detail: `rendered report not found at ${reportPath}` }; const content = readFileSync(p, "utf8"); if (content.includes(needle)) return { ok: false, detail: `rendered report contains forbidden string: "${needle.slice(0, 80)}"` }; return { ok: true, detail: `excludes forbidden string` }; };
const renderedReportRegexCount = (reportPath, regex, { min, max }) => { const p = resolvePath(reportPath); if (!existsSync(p)) return { ok: false, detail: `rendered report not found at ${reportPath}` }; const content = readFileSync(p, "utf8"); const matches = content.match(new RegExp(regex, "g")) || []; if (min !== undefined && matches.length < min) return { ok: false, detail: `regex ${regex} matched ${matches.length}; need >= ${min}` }; if (max !== undefined && matches.length > max) return { ok: false, detail: `regex ${regex} matched ${matches.length}; need <= ${max}` }; return { ok: true, detail: `${matches.length} matches` }; };
const constantEquals = (filePath, constName, expectedValue) => { const full = join(REPO_ROOT, filePath); if (!existsSync(full)) return { ok: false, detail: `file not found: ${filePath}` }; const content = readFileSync(full, "utf8"); const re = new RegExp(`export\\s+const\\s+${constName}(?:\\s*:[^=]+)?\\s*=\\s*['"\`]([^'"\`]+)['"\`]`); const m = content.match(re); if (!m) return { ok: false, detail: `${constName} not found as exported string constant in ${filePath}` }; if (m[1] !== expectedValue) return { ok: false, detail: `${constName} = "${m[1]}"; expected "${expectedValue}"` }; return { ok: true, detail: `${constName} = "${expectedValue}"` }; };

const dispatch = (check) => {
  switch (check.type) {
    case "file_exists": return fileExists(check.path);
    case "file_min_size": return fileMinSize(check.path, check.minBytes);
    case "grep_matches": return grepMatches(check.pattern, check.paths, { mustMatch: true, minCount: check.minCount ?? 1 });
    case "grep_excludes": return grepMatches(check.pattern, check.paths, { mustMatch: false });
    case "npm_script_passes": return npmScriptPasses(check.script);
    case "rendered_contains": return renderedReportContains(check.reportPath, check.needle);
    case "rendered_excludes": return renderedReportExcludes(check.reportPath, check.needle);
    case "rendered_regex_count": return renderedReportRegexCount(check.reportPath, check.regex, { min: check.min, max: check.max });
    case "constant_equals": return constantEquals(check.path, check.name, check.value);
    default: throw new Error(`unknown check type: ${check.type}`);
  }
};

const main = () => {
  log(`${ANSI.bold}AtmosFlow Acceptance Check${ANSI.reset}`);
  log(`${ANSI.dim}Config: ${CONFIG_PATH}${ANSI.reset}\n`);
  const configFull = join(REPO_ROOT, CONFIG_PATH);
  if (!existsSync(configFull)) { log(`${ANSI.red}Config not found: ${configFull}${ANSI.reset}`); exit(2); }
  let config;
  try { config = JSON.parse(readFileSync(configFull, "utf8")); } catch (e) { log(`${ANSI.red}Failed to parse config: ${e.message}${ANSI.reset}`); exit(2); }
  log(`Feature: ${ANSI.bold}${config.feature}${ANSI.reset}`);
  log(`Criteria: ${config.criteria.length}\n`);
  for (const criterion of config.criteria) {
    if (criterion.skip) { logSkip(criterion.id, criterion.label, criterion.skipReason ?? "marked skip"); continue; }
    let allOk = true; let detail = ""; let firstFailReason = null;
    for (const check of criterion.checks) {
      try { const result = dispatch(check); if (!result.ok) { allOk = false; if (firstFailReason === null) firstFailReason = result.detail; } else if (VERBOSE) { detail += result.detail + "; "; } }
      catch (err) { allOk = false; if (firstFailReason === null) firstFailReason = `runner error: ${err.message}`; }
    }
    if (allOk) logPass(criterion.id, criterion.label, detail); else logFail(criterion.id, criterion.label, firstFailReason);
  }
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  log(`\n${ANSI.bold}Summary${ANSI.reset}`);
  log(`  Passed:  ${ANSI.green}${passed}${ANSI.reset}`);
  log(`  Failed:  ${failed > 0 ? ANSI.red : ANSI.dim}${failed}${ANSI.reset}`);
  log(`  Skipped: ${ANSI.dim}${skipped}${ANSI.reset}`);
  log(`  Total:   ${results.length}`);
  if (failed > 0) { log(`\n${ANSI.red}${ANSI.bold}ACCEPTANCE FAILED${ANSI.reset}`); log(`${ANSI.red}Do not declare done. Fix the failing criteria and re-run.${ANSI.reset}`); exit(1); }
  log(`\n${ANSI.green}${ANSI.bold}ACCEPTANCE PASSED${ANSI.reset}`);
  exit(0);
};

main();
