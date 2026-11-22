'use strict';

// Starts the Zero-Export API and Vite UI together without relying on
// the root concurrently dependency. Use "npm run dev" from the repo root.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');
const envPath = path.join(backend, '.env');
const envExamplePath = path.join(backend, '.env.example');
const children = [];
let closing = false;
let exitCode = 0;

function info(message) {
  process.stdout.write('[START] ' + message + '\n');
}

function installIfMissing(label, folder, modulePath) {
  if (fs.existsSync(modulePath)) return;
  info(label + ' dependencies missing; installing from package-lock.json ...');
  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = isWindows
    ? ['/d', '/s', '/c', 'npm.cmd ci --no-audit --no-fund']
    : ['ci', '--no-audit', '--no-fund'];
  const result = spawnSync(command, args, { cwd: folder, stdio: 'inherit', windowsHide: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(label + ' dependency installation failed (exit ' + result.status + ').');
  }
  if (!fs.existsSync(modulePath)) {
    throw new Error(label + ' entrypoint not found after npm ci: ' + modulePath);
  }
}

function prefixOutput(stream, label, target) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    buffer += chunk;
    let end = buffer.indexOf('\n');
    while (end !== -1) {
      target.write('[' + label + '] ' + buffer.slice(0, end + 1));
      buffer = buffer.slice(end + 1);
      end = buffer.indexOf('\n');
    }
  });
  stream.on('end', () => {
    if (buffer) target.write('[' + label + '] ' + buffer + '\n');
  });
}

function stopAll(code = 0) {
  if (closing) return;
  closing = true;
  exitCode = code;
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGTERM'); } catch { /* already stopped */ }
    }
  }
  if (children.length === 0 || children.every(({ child }) => child.exitCode !== null || child.signalCode !== null)) {
    process.exitCode = exitCode;
  }
}

function run(label, script, cwd, args = []) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env },
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: false,
  });
  children.push({ label, child });
  prefixOutput(child.stdout, label, process.stdout);
  prefixOutput(child.stderr, label, process.stderr);
  child.once('error', error => {
    process.stderr.write('[' + label + '] Could not start: ' + error.message + '\n');
    stopAll(1);
  });
  child.once('exit', (code, signal) => {
    if (!closing) {
      process.stderr.write('[' + label + '] Stopped unexpectedly (exit ' + (signal || code) + ').\n');
      stopAll(code || 1);
    }
    if (children.every(({ child: entry }) => entry.exitCode !== null || entry.signalCode !== null)) {
      process.exitCode = exitCode;
    }
  });
}

try {
  const [nodeMajor] = process.versions.node.split('.').map(Number);
  if (nodeMajor < 20) throw new Error('Node.js 20+ required; found ' + process.version);

  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(envExamplePath, envPath, fs.constants.COPYFILE_EXCL);
    info('Created backend/.env from .env.example (default MongoDB: 127.0.0.1:27017).');
  }
  installIfMissing('Backend', backend, path.join(backend, 'node_modules', 'mongoose', 'package.json'));
  installIfMissing('Frontend', frontend, path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'));

  info('Starting backend API :3001 and frontend :5173.');
  info('MongoDB must be running on the URI in backend/.env.');
  info('When ready, open http://localhost:5173/simulator');
  info('Press Ctrl+C to stop both.');
  run('API', path.join(backend, 'src', 'index.js'), backend);
  run('UI', path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), frontend, ['--strictPort']);
} catch (error) {
  process.stderr.write('[START] ' + (error.stack || error.message) + '\n');
  stopAll(1);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
