// _json-helper.mjs — Helper script for the release-metadata integration test.
// Reads a JSON file and prints a dotted-path field value.
// Usage: node _json-helper.mjs <file> <dotted.field.path>
//        < /path/to/updates.json node _json-helper.mjs channels.nightly.latestVersion

import { readFileSync } from 'node:fs';
import { argv } from 'node:process';

const file = argv[2];
const field = argv[3];

if (!file || !field) {
  console.error('Usage: node _json-helper.mjs <file> <dotted.field.path>');
  process.exit(1);
}

const json = JSON.parse(readFileSync(file, 'utf8'));
const parts = field.split('.');
let val = json;
for (const p of parts) {
  if (val == null) break;
  val = val[p];
}
if (val === undefined) {
  process.exit(2);
}
console.log(typeof val === 'object' ? JSON.stringify(val) : val);
