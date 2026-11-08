import { pathToFileURL } from 'node:url';

export function acceptanceErrors(needs) {
  const errors = [];
  const output = needs.detect?.outputs ?? {};
  for (const key of ['api', 'web', 'rust']) {
    if (!['true', 'false'].includes(output[key])) errors.push(`invalid selector ${key}`);
  }
  if (!['full', 'affected', 'skip'].includes(output.e2e_mode)) errors.push('invalid e2e mode');
  // GitHub omits empty job outputs from toJSON(needs).
  const specs = output.e2e_specs === undefined && ['full', 'skip'].includes(output.e2e_mode)
    ? '' : output.e2e_specs;
  if (typeof specs !== 'string' ||
      (output.e2e_mode === 'affected'
        ? !/^tests\/e2e\/[\w./-]+\.spec\.[cm]?[jt]sx?( tests\/e2e\/[\w./-]+\.spec\.[cm]?[jt]sx?)*$/.test(specs)
        : specs !== '')) errors.push('invalid e2e specs');
  for (const name of ['detect', 'lint', 'typecheck', 'build', 'audit']) {
    if (needs[name]?.result !== 'success') errors.push(`${name}: ${needs[name]?.result ?? 'missing'}`);
  }
  for (const [name, skip] of [
    ['test-api', output.api === 'false'],
    ['test-web', output.web === 'false'],
    ['test-rust', output.rust === 'false'],
    ['test-e2e', output.e2e_mode === 'skip'],
  ]) {
    const result = needs[name]?.result;
    if (result !== 'success' &&
        !(result === 'skipped' && needs.detect?.result === 'success' && skip)) {
      errors.push(`${name}: ${result ?? 'missing'} without successful selector proof`);
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const errors = acceptanceErrors(JSON.parse(process.env.NEEDS_JSON ?? '{}'));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('CI acceptance: every applicable job succeeded');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
