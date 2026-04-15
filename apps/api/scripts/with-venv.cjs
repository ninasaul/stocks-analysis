const { existsSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const py = path.join(root, ".venv", "bin", "python");

if (!existsSync(py)) {
  const r = spawnSync("node", [path.join(__dirname, "ensure-venv.cjs")], {
    stdio: "inherit",
    cwd: root,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const r = spawnSync(py, process.argv.slice(2), { stdio: "inherit", cwd: root });
process.exit(r.status ?? 0);
