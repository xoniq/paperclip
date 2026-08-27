import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = process.platform === "win32" ? "paperclip-runnerd.exe" : "paperclip-runnerd";
const source = path.join(packageRoot, "runner", "target", "release", executable);
const destinationDirectory = path.join(packageRoot, "dist", "bin");
const destination = path.join(destinationDirectory, executable);

await mkdir(destinationDirectory, { recursive: true });

if (!existsSync(source)) {
  let hasCargo = false;
  try {
    execSync("cargo --version", { stdio: "ignore" });
    hasCargo = true;
  } catch {
    hasCargo = false;
  }

  if (hasCargo) {
    try {
      execSync("cargo build --release --manifest-path runner/Cargo.toml --locked -p paperclip-runner-core --bin paperclip-runnerd", {
        cwd: packageRoot,
        stdio: "inherit",
      });
    } catch (err) {
      console.warn(`[paperclip-runner] Warning: Cargo build failed: ${err.message}`);
    }
  } else {
    console.warn("[paperclip-runner] Note: cargo not found in PATH; skipping native runner binary build.");
  }
}

if (existsSync(source)) {
  await copyFile(source, destination);
  if (process.platform !== "win32") await chmod(destination, 0o755);
} else if (!existsSync(destination)) {
  const placeholder = `#!/bin/sh\necho "paperclip-runnerd is not available in this build." >&2\nexit 1\n`;
  await writeFile(destination, placeholder, { mode: 0o755 });
}

