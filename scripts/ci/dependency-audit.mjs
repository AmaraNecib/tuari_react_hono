import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const EXPIRES_AT = '2026-11-25T13:10:25Z';
const ALLOWED_ID = 'GHSA-fc5q-39xc-vjpf';
const ALLOWED_PACKAGE = 'picomatch';
const ALLOWED_VERSIONS = new Set(['2.3.2', '4.0.4', '4.0.7']);
const SEVERITIES = new Set(['info', 'low', 'moderate', 'high', 'critical']);

export function evaluateAudit(report, { now = new Date().toISOString(), expiresAt = EXPIRES_AT, exitCode = 0 } = {}) {
  const fail = (reason) => ({ pass: false, reason });
  if (!Number.isFinite(Date.parse(now)) || !Number.isFinite(Date.parse(expiresAt))) return fail('invalid audit clock or exception expiry');
  if (!report || typeof report !== 'object' || Array.isArray(report) || Object.keys(report).sort().join(',') !== 'actions,advisories,metadata,muted' || !Array.isArray(report.actions) || !Array.isArray(report.muted) || !report.metadata || !report.metadata.vulnerabilities || !report.advisories || typeof report.advisories !== 'object' || Array.isArray(report.advisories)) return fail('malformed pnpm audit report');
  const metadata = report.metadata;
  if (Object.keys(metadata).sort().join(',') !== 'dependencies,devDependencies,optionalDependencies,totalDependencies,vulnerabilities' || !Number.isSafeInteger(metadata.dependencies) || !Number.isSafeInteger(metadata.devDependencies) || !Number.isSafeInteger(metadata.optionalDependencies) || !Number.isSafeInteger(metadata.totalDependencies)) return fail('malformed pnpm audit metadata');
  const counts = metadata.vulnerabilities;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts) || Object.keys(counts).sort().join(',') !== [...SEVERITIES].sort().join(',') || [...SEVERITIES].some((severity) => !Number.isSafeInteger(counts[severity]) || counts[severity] < 0)) return fail('missing or invalid vulnerability summary counts');
  const observed = Object.fromEntries([...SEVERITIES].map((severity) => [severity, 0]));
  const findings = [];
  for (const advisory of Object.values(report.advisories)) {
    if (!advisory || typeof advisory !== 'object' || typeof advisory.github_advisory_id !== 'string' || !advisory.github_advisory_id || typeof advisory.module_name !== 'string' || !SEVERITIES.has(advisory.severity) || !Array.isArray(advisory.findings)) return fail('malformed advisory or missing advisory identity');
    for (const finding of advisory.findings) {
      if (!finding || typeof finding.version !== 'string' || !finding.version || !Array.isArray(finding.paths) || finding.paths.length === 0 || finding.paths.some((value) => typeof value !== 'string' || !value)) return fail('malformed vulnerability finding');
      observed[advisory.severity]++;
      findings.push({ id: advisory.github_advisory_id, module: advisory.module_name, severity: advisory.severity, version: finding.version });
    }
  }
  if ([...SEVERITIES].some((severity) => observed[severity] !== counts[severity])) return fail('vulnerability counts do not match advisory findings');
  if (![0, 1].includes(exitCode)) return fail(`unexpected pnpm audit exit code ${exitCode}`);

  const highOrCritical = findings.filter(({ severity }) => severity === 'high' || severity === 'critical');
  if (exitCode === 1 && highOrCritical.length === 0) return fail('pnpm audit exited nonzero without a high or critical finding');
  if (exitCode === 0 && highOrCritical.length > 0) return fail('pnpm audit exited zero despite a high or critical finding');
  const allowed = highOrCritical.filter(({ id, module, severity, version }) => id === ALLOWED_ID && module === ALLOWED_PACKAGE && severity === 'high' && ALLOWED_VERSIONS.has(version));
  if (allowed.length !== highOrCritical.length) return fail('unapproved high or critical vulnerability remains');
  if (highOrCritical.some(({ id, module }) => id !== ALLOWED_ID || module !== ALLOWED_PACKAGE)) return fail('high or critical finding does not match the temporary exception');
  if (Date.parse(now) >= Date.parse(expiresAt) && allowed.length > 0) return fail('temporary picomatch exception expired; remove it or resolve the advisory');
  if (allowed.length === 0 && findings.length === 0) return { pass: true, message: 'Audit is clean; remove obsolete picomatch exception.' };
  return { pass: true, message: `${findings.length} advisory finding(s) reported; low and moderate findings remain visible.` };
}

export function auditOnce({ command = (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'), args = ['audit', '--json', '--audit-level', 'high'], platform = process.platform, now = new Date().toISOString() } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: platform === 'win32' });
  if (result.error) return { pass: false, reason: `pnpm audit could not run: ${result.error.message}`, stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
  if (result.signal || result.status === null) return { pass: false, reason: `pnpm audit terminated without an exit code${result.signal ? ` (${result.signal})` : ''}`, stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
  const stdout = result.stdout ?? '';
  let report;
  try { report = JSON.parse(stdout); } catch {
    return { pass: false, reason: 'audit output was not valid JSON', stdout, stderr: result.stderr ?? '', status: result.status };
  }
  const decision = evaluateAudit(report, { exitCode: result.status ?? 1, now });
  return { ...decision, stdout, stderr: result.stderr ?? '', status: result.status };
}

function runAudit() {
  const result = auditOnce();
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.stderr.write(`${result.pass ? 'PASS' : 'FAIL'}: ${result.message ?? result.reason}\n`);
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runAudit();
