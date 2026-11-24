#!/usr/bin/env node
import { parseInput, emitReport } from './viewer/pipeline.mjs';
const args = process.argv.slice(2);
if (args.length !== 3 || args[1] !== '-o' || !args[2].endsWith('.html')) {
  console.error('Usage: tuari-viewer <zip-or-folder> -o report.html');
  process.exitCode = 1;
} else {
  try { await emitReport(await parseInput(args[0]), args[2]); }
  catch (error) { console.error(`tuari-viewer: ${error.message}`); process.exitCode = 1; }
}
