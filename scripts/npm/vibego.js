#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const platformPackageByHost = {
  "android:arm64": "@vibego/vibego-android-arm64",
  "linux:x64": "@vibego/vibego-linux-x64",
  "linux:arm64": "@vibego/vibego-linux-arm64",
  "darwin:x64": "@vibego/vibego-darwin-x64",
  "darwin:arm64": "@vibego/vibego-darwin-arm64",
  "win32:x64": "@vibego/vibego-win32-x64",
  "win32:arm64": "@vibego/vibego-win32-arm64"
};

const hostKey = `${process.platform}:${process.arch}`;
const platformPackage = platformPackageByHost[hostKey];

if (!platformPackage) {
  throw new Error(`Unsupported platform: ${process.platform} (${process.arch})`);
}

let packageJsonPath;

try {
  packageJsonPath = require.resolve(`${platformPackage}/package.json`);
} catch {
  throw new Error(`Missing optional dependency ${platformPackage}. Reinstall with: npm i -g vibego@latest`);
}

const vendorRoot = path.join(path.dirname(packageJsonPath), "vendor");
const binaryName = process.platform === "win32" ? "vibego.exe" : "vibego";
const binaryPath = path.join(vendorRoot, binaryName);

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

["SIGINT", "SIGTERM", "SIGHUP"].forEach((signal) => {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
