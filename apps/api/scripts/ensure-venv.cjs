const { existsSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!existsSync(path.join(root, ".venv"))) {
  run("python3", ["-m", "venv", ".venv"]);
}

const pip = path.join(root, ".venv", "bin", "pip");
run(pip, ["install", "-r", "requirements.txt"]);
