import fs from 'fs';
import readline from 'readline';

const args = process.argv.slice(2);
const filepath = args[0];

if (!filepath) {
  console.error("Usage: node summarize.mjs <file.csv>");
  process.exit(1);
}

const data = {};
const totalCpuPerTime = {};

const rl = readline.createInterface({
  input: fs.createReadStream(filepath),
  crlfDelay: Infinity
});

let isFirst = true;
rl.on('line', (line) => {
  if (isFirst) {
    isFirst = false;
    return;
  }
  const [timestamp, type, name, valueStr] = line.split(',');
  if (!timestamp || !type || !name || !valueStr) return;
  
  const value = parseFloat(valueStr);
  if (!Number.isFinite(value)) return;
  
  if (!data[type]) data[type] = {};
  if (!data[type][name]) data[type][name] = [];
  data[type][name].push(value);
  
  if (type === 'container') {
    totalCpuPerTime[timestamp] = (totalCpuPerTime[timestamp] || 0) + value;
  }
});

rl.on('close', () => {
  const p95 = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index];
  };

  const avg = (arr) => {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };
  
  const max = (arr) => {
      if (arr.length === 0) return 0;
      return Math.max(...arr);
  };

  console.log("=== CPU Performance Summary ===");
  console.log("Container CPU (%):");
  if (data['container']) {
    for (const [name, values] of Object.entries(data['container'])) {
      console.log(`  ${name.padEnd(15)}: Avg ${avg(values).toFixed(2).padStart(6)}% | p95 ${p95(values).toFixed(2).padStart(6)}% | Max ${max(values).toFixed(2).padStart(6)}%`);
    }
  }

  console.log("\nProcess CPU (%):");
  if (data['process']) {
    for (const [name, values] of Object.entries(data['process'])) {
      console.log(`  ${name.padEnd(15)}: Avg ${avg(values).toFixed(2).padStart(6)}% | p95 ${p95(values).toFixed(2).padStart(6)}% | Max ${max(values).toFixed(2).padStart(6)}%`);
    }
  }
  
  console.log("\nHost Load (1m avg):");
  if (data['load'] && data['load']['load1']) {
      const values = data['load']['load1'];
      console.log(`  ${'load1'.padEnd(15)}: Avg ${avg(values).toFixed(2).padStart(6)}  | p95 ${p95(values).toFixed(2).padStart(6)}  | Max ${max(values).toFixed(2).padStart(6)} `);
  }

  const totals = Object.values(totalCpuPerTime);
  const over180 = totals.filter(t => t > 180).length;
  const share = totals.length > 0 ? (over180 / totals.length) * 100 : 0;
  
  console.log(`\nTotal Container CPU > 180% (of 200%): ${over180}/${totals.length} samples (${share.toFixed(2)}%)`);
});
