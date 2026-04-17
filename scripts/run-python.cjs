#!/usr/bin/env node
/**
 * Cross-platform wrapper to invoke a Python script inside scripts/.venv.
 * Works on both POSIX (bin/python) and Windows (Scripts/python.exe).
 *
 * Usage: node scripts/run-python.js <script.py> [args...]
 */
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const scriptsDir = path.resolve(__dirname);
const venvDir = path.join(scriptsDir, ".venv");

const posix = path.join(venvDir, "bin", "python");
const win32 = path.join(venvDir, "Scripts", "python.exe");
const python = fs.existsSync(posix) ? posix : fs.existsSync(win32) ? win32 : null;

if (!python) {
  console.error(
    "Python venv not found. Run:\n" +
      "  python3 -m venv scripts/.venv\n" +
      "  scripts/.venv/bin/pip install -r scripts/requirements.txt"
  );
  process.exit(1);
}

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error("Usage: node scripts/run-python.js <script.py> [args...]");
  process.exit(1);
}

try {
  execFileSync(python, [path.join(scriptsDir, script), ...args], {
    stdio: "inherit",
  });
} catch (err) {
  process.exit(err.status ?? 1);
}
