import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('review reports are ignored and not tracked without deleting local history', () => {
  const tracked = execFileSync('git', ['ls-files', '.scratch/reviews'], { cwd: root, encoding: 'utf8' });
  assert.equal(tracked.trim(), '');
  const ignored = execFileSync('git', ['check-ignore', '.scratch/reviews/policy/example.md'], { cwd: root, encoding: 'utf8' });
  assert.equal(ignored.trim(), '.scratch/reviews/policy/example.md');
  assert.doesNotMatch(read('AGENTS.md'), /keep committed while the PR is open/);
});

test('active lifecycle instructions require affected proof, not automatic full-suite hooks', () => {
  const workflow = read('docs/engineering-workflow.md');
  assert.match(workflow, /Activation is pending/);
  assert.match(workflow, /Background verification and records/);
  assert.match(workflow, /elapsed duration/);
  assert.match(workflow, /one\s+fresh combined-delta review/);
  assert.match(workflow, /three distinct initial sessions/);
  for (const file of ['.husky/pre-push', '.agents/skills/implement/SKILL.md']) {
    assert.doesNotMatch(read(file), /pnpm test:api|pnpm test:web|full test suite once/);
  }
  for (const skill of ['feature-implement', 'guard', 'reviewloop']) {
    const content = read(`.agents/skills/${skill}/SKILL.md`);
    assert.match(content, /committed/);
    assert.match(content, /bounded|correction/i);
    assert.match(content, /ignored/);
    assert.doesNotMatch(content, /Greptile is not part of the gate|Greptile replaced/);
  }
  assert.match(read('docs/ci-final-activation.md'), /15368/);
  assert.match(read('docs/ci-final-activation.md'), /strict\/up-to-date/);
});

test('wisdom is indexed by topics and every category link resolves', () => {
  const base = path.join(root, '.agents/wisdom');
  const flat = readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name);
  assert.deepEqual(flat, ['README.md']);
  let lessons = 0;
  for (const category of readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const dir = path.join(base, category.name);
    const index = readFileSync(path.join(dir, 'README.md'), 'utf8');
    const links = [...index.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
    assert.ok(links.length, `${category.name} needs indexed topics`);
    for (const link of links) {
      assert.ok(existsSync(path.join(dir, link)), `${category.name}/${link}`);
      lessons++;
    }
  }
  assert.ok(lessons > 0);
  assert.match(read('.agents/skills/capture-wisdom/SKILL.md'), /Only the parent writes/);
});

test('updated skill references and delegation template exist', () => {
  const skills = ['feature-implement', 'guard', 'implement', 'code-review', 'debate', 'test-audit',
    'reviewloop', 'capture-wisdom', 'crew-dispatch', 'writing-for-agents', 'improve-codebase-architecture'];
  for (const skill of skills) {
    const content = read(`.agents/skills/${skill}/SKILL.md`);
    assert.match(content, /^---\r?\nname:/);
    assert.match(content, /description:/);
  }
  const template = read('.agents/skills/writing-for-agents/delegation-template.md');
  for (const heading of ['Goal', 'Worktree and revision', 'Required reading', 'Scope and authority', 'Verification', 'Completion']) {
    assert.ok(template.includes(`## ${heading}`));
  }
});
