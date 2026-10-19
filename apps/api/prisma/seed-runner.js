const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const compiledPath = path.join(__dirname, '../dist/prisma/seed.js');
const tsNodePath = path.join(__dirname, 'seed.ts');

// A spawn error or a kill signal leaves `status` null; that is a failure, not 0.
function exitWith(result) {
  if (result.error) console.error(result.error);
  if (result.signal) console.error(`Seed process killed by ${result.signal}.`);
  process.exit(result.status ?? 1);
}

if (fs.existsSync(compiledPath)) {
  console.log('Running compiled seed.js...');
  exitWith(spawnSync(process.execPath, [compiledPath], { stdio: 'inherit' }));
} else {
  console.log('Running seed.ts via ts-node...');
  // ts-node's own entry through node: no shell, so a path with spaces stays one argument.
  const tsNodeBin = require.resolve('ts-node/dist/bin.js');
  exitWith(spawnSync(process.execPath, [tsNodeBin, '--transpile-only', tsNodePath], { stdio: 'inherit' }));
}
