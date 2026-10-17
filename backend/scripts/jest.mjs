#!/usr/bin/env node
/**
 * Jest runner with a Node version guard.
 *
 * Jest 30 + Nest 12 (ESM-only packages) require Node >= 24.9: jest's ESM
 * loader depends on `vm.SourceTextModule.prototype.moduleRequests`
 * (Node 24.10+). Older nodes fail with confusing errors like "Must use
 * import to load ES Module" or "moduleRequests unavailable" (see MEMORY.md §6).
 *
 * This machine has an old Node 22 at /usr/local/bin that shadows the
 * project's Node 24 when the PATH is ordered badly. So: if the current
 * process runs on an unsupported Node, re-exec under ~/.local/node24/bin/node
 * (override with NODE_BINARY). With a supported Node, just run Jest with
 * --experimental-vm-modules.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_NODE = [24, 9];
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jestBin = path.join(backendDir, 'node_modules', 'jest', 'bin', 'jest.js');

function isSupported(nodeBin) {
  const probe = spawnSync(nodeBin, ['-p', 'process.versions.node'], { encoding: 'utf8' });
  if (probe.status !== 0) return false;
  const [major = 0, minor = 0] = probe.stdout.trim().split('.').map(Number);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

function runJest(nodeBin) {
  const env = { ...process.env };
  const parts = env.NODE_OPTIONS ? env.NODE_OPTIONS.split(/\s+/).filter(Boolean) : [];
  if (!parts.includes('--experimental-vm-modules')) parts.push('--experimental-vm-modules');
  env.NODE_OPTIONS = parts.join(' ');

  const child = spawn(nodeBin, [jestBin, ...process.argv.slice(2)], {
    cwd: backendDir,
    env,
    stdio: 'inherit',
  });
  child.on('close', (code) => process.exit(code ?? 1));
}

if (!isSupported(process.execPath)) {
  const fallback = process.env.NODE_BINARY ?? path.join(os.homedir(), '.local/node24/bin/node');
  if (fs.existsSync(fallback) && isSupported(fallback)) {
    process.stderr.write(
      `[jest] Node ${process.versions.node} is unsupported for this test suite; ` +
        `re-executing under ${fallback}.\n`,
    );
    const child = spawn(fallback, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
      cwd: backendDir,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('close', (code) => process.exit(code ?? 1));
  } else {
    process.stderr.write(
      `[jest] Node >= ${MIN_NODE[0]}.${MIN_NODE[1]} is required (found ${process.versions.node}). ` +
        `Point NODE_BINARY at a supported node or put it first on the PATH.\n`,
    );
    process.exit(1);
  }
} else {
  runJest(process.execPath);
}
