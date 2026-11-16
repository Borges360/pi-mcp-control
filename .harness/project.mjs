// harness-managed
// Local entrypoint: reads its installed contract even without the workspace.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const contract = JSON.parse(fs.readFileSync(path.join(here, "project.json"), "utf8"));
if (contract.schema !== "harness/project/v1") throw new Error("Unsupported project contract");
const source = path.resolve(root, contract.sourceRoot);
const command = process.argv[2] ?? "describe";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function plainPath(file) {
  let current = path.resolve(file);
  while (current !== root) {
    if (!current.startsWith(root + path.sep)) return false;
    try { if (fs.lstatSync(current).isSymbolicLink()) return false; }
    catch (error) { if (error.code !== 'ENOENT') return false; }
    current = path.dirname(current);
  }
  return true;
}

if (command === "describe") {
  console.log(JSON.stringify({ ...contract, workspaceAvailable: fs.existsSync(path.join(source, "harness.yaml")) }, null, 2));
} else if (command === "verify") {
  const checks = [];
  function inspect(dir) {
    if (!plainPath(dir)) {
      checks.push({ path: path.relative(root, dir), ok: false, reason: 'linked-path' });
      return;
    }
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) inspect(file);
      else if (entry.name === ".harness-managed.json") {
        let receipt;
        try { receipt = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
        if (receipt?.schema !== "harness/skill-copy/v1" || !receipt.files) {
          checks.push({ path: path.relative(root, file), ok: false, reason: "invalid-receipt" });
          continue;
        }
        for (const [name, expected] of Object.entries(receipt.files)) {
          const target = path.resolve(dir, name);
          const allowed = target.startsWith(dir + path.sep) && !name.includes("\\");
          const ok = allowed && plainPath(target) && fs.existsSync(target) && fs.lstatSync(target).isFile() && hash(fs.readFileSync(target)) === expected;
          checks.push({ path: path.relative(root, target), ok });
        }
      } else if (entry.name.endsWith('.harness-managed')) {
        const target = file.slice(0, -'.harness-managed'.length);
        const ok = plainPath(target) && plainPath(file) && fs.existsSync(target) && fs.lstatSync(target).isFile()
          && hash(fs.readFileSync(target)) === fs.readFileSync(file, 'utf8').trim();
        checks.push({ path: path.relative(root, target), ok });
      }
    }
  }
  for (const folder of [".agents/skills", ".pi/skills", ".cursor/skills"]) inspect(path.join(root, folder));
  for (const folder of ['.cursor/rules', '.codex-plugin']) inspect(path.join(root, folder));
  for (const name of ["project.json", "project.mjs", "install-manifest.json"]) {
    const file = path.join(here, name);
    const receipt = file + ".harness-managed";
    checks.push({ path: path.relative(root, file), ok: fs.existsSync(receipt) && hash(fs.readFileSync(file)) === fs.readFileSync(receipt, "utf8").trim() });
  }
  const ok = checks.every(c => c.ok);
  console.log(JSON.stringify({ project: contract.id, sourceVersion: contract.sourceVersion, ok, checks }, null, 2));
  if (!ok) process.exitCode = 1;
} else if (["inventory", "status", "doctor", "version", "runtimes"].includes(command)) {
  const cli = path.join(source, "bin", "harness.mjs");
  if (!fs.existsSync(cli)) {
    console.error("Workspace unavailable. Use describe/verify for the installed local contract.");
    process.exitCode = 2;
  } else {
    const result = spawnSync(process.execPath, [cli, command, ...process.argv.slice(3)], { cwd: source, stdio: "inherit", windowsHide: true });
    process.exitCode = result.status ?? 2;
  }
} else {
  console.error("Use describe, verify, inventory, status, doctor, version or runtimes.");
  process.exitCode = 2;
}
