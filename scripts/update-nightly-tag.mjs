#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const apiRoot = 'repos';

function fail(message) {
  console.error(`Nightly tag update failed: ${message}`);
  process.exitCode = 1;
}

function ghApi(args, execute) {
  const result = execute('gh', ['api', '--include', ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 30_000,
  });
  if (result.error) throw new Error(`could not run gh api: ${result.error.message}`);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const statusMatch = output.match(/^HTTP\/\S+\s+(\d{3})\b/m);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  if (result.status !== 0 && status === null) {
    throw new Error(`gh api exited ${result.status}: ${output.trim()}`);
  }
  let body;
  const bodyStart = output.indexOf('\r\n\r\n') >= 0
    ? output.indexOf('\r\n\r\n') + 4
    : output.indexOf('\n\n') + 2;
  if (bodyStart >= 2) {
    try { body = JSON.parse(output.slice(bodyStart).trim()); } catch { /* Error bodies need not be JSON. */ }
  }
  return { status, body, output, exitCode: result.status };
}

function requireSuccess(response, operation) {
  if (response.exitCode !== 0 || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    throw new Error(`${operation} returned HTTP ${response.status ?? 'unknown'}: ${response.output.trim()}`);
  }
}

function expectedRefSha(response, context) {
  const object = response.body?.object;
  if (object?.type !== 'commit') {
    throw new Error(`${context} did not point directly to a commit`);
  }
  if (typeof object.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(object.sha)) {
    throw new Error(`${context} did not return a full commit SHA`);
  }
  return object.sha.toLowerCase();
}

export function updateNightlyTag({ repository, sourceSha }, { execute = spawnSync } = {}) {
  if (!/^[0-9a-f]{40}$/i.test(sourceSha ?? '')) throw new Error('source SHA must be a full commit SHA');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('Invalid repository');
  sourceSha = sourceSha.toLowerCase();
  const request = args => ghApi(args, execute);
  const endpoint = `${apiRoot}/${repository}/git/ref/tags/nightly`;
  const writeEndpoint = `${apiRoot}/${repository}/git/refs/tags/nightly`;
  const get = request([endpoint]);
  let existing;
  if (get.status === 404) {
    if (get.exitCode === 0) throw new Error('GitHub returned HTTP 404 with a successful gh exit status');
  } else {
    requireSuccess(get, 'Reading refs/tags/nightly');
    existing = expectedRefSha(get, 'Nightly tag lookup');
  }

  if (existing !== sourceSha) {
    let write;
    if (existing === undefined) {
      write = request([
        '--method', 'POST', `${apiRoot}/${repository}/git/refs`,
        '-f', 'ref=refs/tags/nightly', '-f', `sha=${sourceSha}`,
      ]);
      requireSuccess(write, 'Creating refs/tags/nightly');
    } else {
      write = request([
        '--method', 'PATCH', writeEndpoint,
        '-f', `sha=${sourceSha}`, '-F', 'force=false',
      ]);
      if (write.exitCode !== 0 || !Number.isInteger(write.status) || write.status < 200 || write.status >= 300) {
        const detail = write.status === 422
          ? 'GitHub rejected a non-fast-forward nightly tag update; the tag has diverged. No force update was attempted.'
          : `Updating refs/tags/nightly returned HTTP ${write.status ?? 'unknown'}: ${write.output.trim()}`;
        throw new Error(detail);
      }
    }
  }

  const readback = request([endpoint]);
  requireSuccess(readback, 'Verifying refs/tags/nightly readback');
  const actualSha = expectedRefSha(readback, 'Nightly tag readback');
  if (actualSha !== sourceSha) {
    throw new Error(`Nightly tag readback identity mismatch: expected ${sourceSha}, found ${actualSha}`);
  }
  console.log(`Verified refs/tags/nightly points to checked-out source ${sourceSha}`);
}

function main() {
  const sourceSha = process.argv[2]?.toLowerCase();
  const repository = process.env.GITHUB_REPOSITORY;
  if (!sourceSha || !/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error('source SHA must be a full 40-character hexadecimal commit SHA');
  }
  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY must be in owner/repository form');
  }
  updateNightlyTag({ repository, sourceSha });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
