const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const compiledPath = path.join(__dirname, '../dist/prisma/seed.js');
const tsNodePath = path.join(__dirname, 'seed.ts');

if (fs.existsSync(compiledPath)) {
  console.log('Running compiled seed.js...');
  const result = spawnSync('node', [compiledPath], { stdio: 'inherit' });
  process.exit(result.status || 0);
} else {
  console.log('Running seed.ts via ts-node...');
  const result = spawnSync('npx', ['ts-node', '--transpile-only', tsNodePath], { stdio: 'inherit', shell: true });
  process.exit(result.status || 0);
}
