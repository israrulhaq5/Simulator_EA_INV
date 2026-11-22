'use strict';

/**
 * CI-free, one-command Knox local acceptance runner.
 * From repository root:
 *   npm run verify:knox
 * or:
 *   node scripts/verify-knox.js
 *
 * Creates knox-verification.log in the repository root.
 * The test binds only 127.0.0.1:502; no real inverter is contacted.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LOG = path.join(ROOT, 'knox-verification.log');
const skipPort502 = process.argv.includes('--skip-port502');
const log = fs.createWriteStream(LOG, { encoding: 'utf8', flags: 'w' });

function output(value) {
  const text = String(value);
  process.stdout.write(text);
  log.write(text);
}

function run(label, command, args) {
  output('\n========== ' + label + ' ==========\n');
  output('> ' + [command, ...args].join(' ') + '\n');
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let settled = false;
    const done = (passed, reason) => {
      if (settled) return;
      settled = true;
      output('\n' + (passed ? 'PASS' : 'FAIL') + ': ' + label + (reason ? ' (' + reason + ')' : '') + '\n');
      resolve(passed);
    };
    child.stdout.on('data', (data) => output(data.toString()));
    child.stderr.on('data', (data) => output(data.toString()));
    child.on('error', (error) => done(false, error.message));
    child.on('close', (code, signal) => done(code === 0, 'exit ' + (signal || code)));
  });
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const supported = major > 22 || (major === 22 && minor >= 10) ||
    (major === 20 && minor >= 19);
  output('KNOX 110 kW simulator — local acceptance, no CI\n');
  output('Node.js ' + process.version + ' / Platform ' + process.platform + '\n');
  output('Test output: ' + LOG + '\n');
  if (!supported) {
    output('FAIL: use Node.js 22.10+ (recommended) or Node.js 20.19+.\n');
    process.exitCode = 1;
    return;
  }

  const steps = [
    ['Install locked backend dependencies', 'npm', ['ci', '--prefix', 'backend', '--no-audit', '--no-fund']],
    ['Install locked frontend dependencies', 'npm', ['ci', '--prefix', 'frontend', '--no-audit', '--no-fund']],
    ['Knox Modbus TCP tests (dynamic free ports)', 'node', ['--test', 'backend/tests/knox-simulator.test.js']],
    ['Zero-export controller tests', 'node', ['--test', 'backend/tests/zero-export.service.test.js']],
    ['Backend lint and complete unit/integration test suite', 'npm', ['run', 'check', '--prefix', 'backend']],
    ['Frontend production build', 'npm', ['run', 'build', '--prefix', 'frontend']],
  ];
  if (!skipPort502) {
    steps.push([
      'Knox actual TCP port 502 acceptance (localhost only)',
      'node',
      ['backend/scripts/verify-knox-port502.js'],
    ]);
  }

  for (const [name, cmd, args] of steps) {
    if (!(await run(name, cmd, args))) {
      output('\nRESULT: FAIL. Fix the step above; share knox-verification.log.\n');
      process.exitCode = 1;
      return;
    }
  }

  if (skipPort502) {
    output('\nRESULT: PARTIAL PASS (port 502 bind check skipped).\n');
    output('The other backend/Modbus socket tests and frontend build passed.\n');
    output('Port 502 still requires verification after stopping any existing server.\n');
  } else {
    output('\nRESULT: ALL AUTOMATED LOCAL KNOX ACCEPTANCE STEPS PASSED.\n');
  }
  output('Report: ' + LOG + '\n');
}

main()
  .catch((error) => {
    output('\nUNEXPECTED FAILURE: ' + (error.stack || error.message) + '\n');
    process.exitCode = 1;
  })
  .finally(() => log.end());
