#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function resolveWorkspacePackageVersion(name, sourceRoot, fallbackVersion) {
  const manifestPath = resolve(sourceRoot, "scripts", "release-package-manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const match = manifest.find((entry) => entry.name === name);
      if (match) {
        const pkgJsonPath = resolve(sourceRoot, match.dir, "package.json");
        if (existsSync(pkgJsonPath)) {
          const workspacePkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
          if (workspacePkg.version) return workspacePkg.version;
        }
      }
    } catch {}
  }
  return fallbackVersion;
}

export function materializePublishManifest(pkg, { sourceRoot = repoRoot } = {}) {
  const publishConfig = pkg.publishConfig ?? {};
  const publishManifest = { ...pkg };

  for (const key of ["main", "types", "exports", "bin"]) {
    if (publishConfig[key] !== undefined) publishManifest[key] = publishConfig[key];
  }

  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    if (!publishManifest[section]) continue;
    publishManifest[section] = Object.fromEntries(
      Object.entries(publishManifest[section]).map(([name, specifier]) => {
        if (typeof specifier !== "string" || !specifier.startsWith("workspace:")) return [name, specifier];
        const range = specifier.slice("workspace:".length);
        const prefix = range === "^" || range === "~" ? range : "";
        const version = resolveWorkspacePackageVersion(name, sourceRoot, pkg.version);
        return [name, `${prefix}${version}`];
      }),
    );
  }

  if (publishManifest.scripts) {
    publishManifest.scripts = { ...publishManifest.scripts };
    delete publishManifest.scripts.prepack;
    delete publishManifest.scripts.postpack;
    delete publishManifest.scripts.prepare;
    delete publishManifest.scripts.prepublish;
    delete publishManifest.scripts.prepublishOnly;
  }

  delete publishManifest.publishConfig;
  return publishManifest;
}

export function createBundledInstallManifest(publishManifest, bundledDependencies) {
  const bundledDependencyNames = new Set(bundledDependencies);
  const installManifest = structuredClone(publishManifest);

  delete installManifest.devDependencies;

  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    if (!installManifest[section]) continue;
    installManifest[section] = Object.fromEntries(
      Object.entries(installManifest[section]).filter(([name]) => bundledDependencyNames.has(name)),
    );
    if (Object.keys(installManifest[section]).length === 0) delete installManifest[section];
  }

  return installManifest;
}

function patchedDependencyPackageName(specifier) {
  const versionSeparator = specifier.lastIndexOf("@");
  const packageNameEnd = specifier.startsWith("@") ? specifier.indexOf("/") : 0;
  if (packageNameEnd < 0) return specifier;
  return versionSeparator > packageNameEnd ? specifier.slice(0, versionSeparator) : specifier;
}

export function selectBundledDependencyPatches(
  destinationDir,
  bundledDependencies,
  patchedDependencies,
) {
  const patchesByPackageName = new Map();
  for (const [specifier, patchPath] of Object.entries(patchedDependencies)) {
    const packageName = patchedDependencyPackageName(specifier);
    const packagePatches = patchesByPackageName.get(packageName) ?? new Map();
    packagePatches.set(specifier, patchPath);
    patchesByPackageName.set(packageName, packagePatches);
  }

  const selectedPatches = [];
  for (const packageName of new Set(bundledDependencies)) {
    const packagePatches = patchesByPackageName.get(packageName);
    if (!packagePatches) continue;

    const installedManifestPath = resolve(
      destinationDir,
      "node_modules",
      packageName,
      "package.json",
    );
    let installedManifest;
    try {
      installedManifest = JSON.parse(readFileSync(installedManifestPath, "utf8"));
    } catch (cause) {
      throw new Error(
        `Cannot select a patch for bundled dependency ${packageName}: failed to read ${installedManifestPath}`,
        { cause },
      );
    }

    if (
      installedManifest.name !== packageName ||
      typeof installedManifest.version !== "string" ||
      installedManifest.version.length === 0
    ) {
      throw new Error(
        `Cannot select a patch for bundled dependency ${packageName}: installed package manifest must declare the expected name and a version`,
      );
    }

    const installedSpecifier = `${packageName}@${installedManifest.version}`;
    const patchPath = packagePatches.get(installedSpecifier);
    if (patchPath === undefined) {
      const configuredSpecifiers = [...packagePatches.keys()].sort().join(", ");
      throw new Error(
        `Cannot select a patch for bundled dependency ${packageName}: installed ${installedSpecifier}, but configured patches are ${configuredSpecifiers}`,
      );
    }
    if (typeof patchPath !== "string" || patchPath.length === 0) {
      throw new Error(`Patch path for ${installedSpecifier} must be a non-empty string`);
    }
    selectedPatches.push({ packageName, specifier: installedSpecifier, patchPath });
  }

  return selectedPatches;
}

export function applyBundledDependencyPatches(destinationDir, bundledDependencies, sourceRoot = repoRoot) {
  const rootPackage = JSON.parse(readFileSync(resolve(sourceRoot, "package.json"), "utf8"));
  const patchedDependencies = rootPackage.pnpm?.patchedDependencies ?? {};

  for (const { packageName, patchPath } of selectBundledDependencyPatches(
    destinationDir,
    bundledDependencies,
    patchedDependencies,
  )) {
    execFileSync(
      "patch",
      ["-p1", "--forward", "-d", resolve(destinationDir, "node_modules", packageName)],
      {
        input: readFileSync(resolve(sourceRoot, patchPath)),
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
  }
}

export function ensureStagingNpmShim(destinationDir) {
  const stagingParent = dirname(destinationDir);
  const pnpmBinDir = resolve(stagingParent, "pnpm-bin");
  if (!existsSync(pnpmBinDir)) return;
  const shimPath = resolve(pnpmBinDir, "npm");
  if (existsSync(shimPath)) return;

  const shimScript = `#!/bin/sh
set -e

SELF_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SELF_REAL="$SELF_DIR/npm"

REAL_NPM=""
OLD_IFS="$IFS"
IFS=":"
for DIR in $PATH; do
  [ -z "$DIR" ] && continue
  DIR_REAL="$(cd "$DIR" 2>/dev/null && pwd -P || true)"
  if [ -n "$DIR_REAL" ] && [ "$DIR_REAL/npm" != "$SELF_REAL" ] && [ -x "$DIR/npm" ]; then
    REAL_NPM="$DIR/npm"
    break
  fi
done
IFS="$OLD_IFS"

if [ -z "$REAL_NPM" ]; then
  echo "npm shim error: could not locate system npm" >&2
  exit 1
fi

is_pack=false
target_dir=""
dest_dir=""
prev=""

for arg in "$@"; do
  if [ "$arg" = "pack" ]; then
    is_pack=true
  elif [ "$is_pack" = true ]; then
    if [ "$prev" = "--pack-destination" ]; then
      dest_dir="$arg"
    elif [ "$arg" = "--pack-destination" ]; then
      :
    elif [ -z "$target_dir" ] && [ -d "$arg" ]; then
      target_dir="$arg"
    fi
  fi
  prev="$arg"
done

if [ "$is_pack" = true ] && [ -n "$target_dir" ]; then
  REAL_TARGET="$(cd "$target_dir" && pwd -P)"
  if [ -n "$dest_dir" ]; then
    REAL_DEST="$(cd "$dest_dir" && pwd -P)"
    cd "$REAL_TARGET"
    exec "$REAL_NPM" pack --pack-destination "$REAL_DEST"
  else
    cd "$REAL_TARGET"
    exec "$REAL_NPM" pack
  fi
fi

exec "$REAL_NPM" "$@"
`;

  try {
    writeFileSync(shimPath, shimScript, { mode: 0o755 });
  } catch {}
}

export function prepareBundledPackage(sourceDir, destinationDir, { sourceRoot = repoRoot } = {}) {
  ensureStagingNpmShim(destinationDir);
  const sourcePackagePath = resolve(sourceDir, "package.json");
  const sourcePackage = JSON.parse(readFileSync(sourcePackagePath, "utf8"));
  const bundledDependencies = sourcePackage.bundleDependencies ?? sourcePackage.bundledDependencies ?? [];

  if (bundledDependencies.length === 0) {
    throw new Error(`${sourcePackage.name} does not declare bundled dependencies`);
  }

  if (sourcePackage.name === "@paperclipai/server") {
    const files = sourcePackage.files ?? [];
    const uiDistPath = resolve(sourceDir, "ui-dist");
    if (files.includes("ui-dist") && !existsSync(uiDistPath)) {
      const rootUiDist = resolve(sourceRoot, "ui", "dist");
      if (existsSync(resolve(rootUiDist, "index.html"))) {
        cpSync(rootUiDist, uiDistPath, { recursive: true });
      } else {
        const prepareUiDistScript = resolve(sourceRoot, "scripts", "prepare-server-ui-dist.sh");
        if (existsSync(prepareUiDistScript)) {
          try {
            execFileSync("bash", [prepareUiDistScript], { cwd: sourceRoot, stdio: "inherit" });
          } catch (error) {
            console.warn(`[prepare-bundled-package] Warning: failed to prepare ui-dist: ${error.message}`);
          }
        }
      }
    }
    const skillsPath = resolve(sourceDir, "skills");
    if (files.includes("skills") && !existsSync(skillsPath)) {
      const rootSkills = resolve(sourceRoot, "skills");
      if (existsSync(rootSkills)) {
        cpSync(rootSkills, skillsPath, { recursive: true });
      }
    }
    const themesPath = resolve(sourceDir, "themes");
    if (files.includes("themes") && !existsSync(themesPath)) {
      const rootThemes = resolve(sourceRoot, "themes");
      if (existsSync(rootThemes)) {
        cpSync(rootThemes, themesPath, { recursive: true });
      }
    }
  }

  rmSync(destinationDir, { recursive: true, force: true });
  mkdirSync(destinationDir, { recursive: true });
  for (const entry of sourcePackage.files ?? []) {
    const sourcePath = resolve(sourceDir, entry);
    if (existsSync(sourcePath)) {
      cpSync(sourcePath, resolve(destinationDir, entry), { recursive: true });
    }
  }
  for (const entry of ["README.md", "LICENSE", "LICENSE.md"]) {
    const sourcePath = resolve(sourceDir, entry);
    if (existsSync(sourcePath)) cpSync(sourcePath, resolve(destinationDir, entry));
  }

  const deployedPackagePath = resolve(destinationDir, "package.json");
  const publishManifest = materializePublishManifest(sourcePackage, { sourceRoot });
  const installManifest = createBundledInstallManifest(publishManifest, bundledDependencies);
  writeFileSync(deployedPackagePath, `${JSON.stringify(installManifest, null, 2)}\n`);

  execFileSync(
    "npm",
    ["install", "--omit=dev", "--no-package-lock", "--legacy-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: destinationDir, stdio: "inherit" },
  );
  writeFileSync(deployedPackagePath, `${JSON.stringify(publishManifest, null, 2)}\n`);
  applyBundledDependencyPatches(destinationDir, bundledDependencies, sourceRoot);

  if (bundledDependencies.includes("acpx")) {
    const acpxPackage = JSON.parse(
      readFileSync(resolve(destinationDir, "node_modules/acpx/package.json"), "utf8"),
    );
    const expectedPatchMarker = {
      "0.12.0": "onAgentStderr",
      "0.13.1": "spawnEnvironment",
    }[acpxPackage.version];
    const acpxRuntime = readFileSync(
      resolve(destinationDir, "node_modules/acpx/dist/runtime.js"),
      "utf8",
    );
    if (!expectedPatchMarker || !acpxRuntime.includes(expectedPatchMarker)) {
      throw new Error(
        `staged acpx@${acpxPackage.version} runtime is missing the repository patch`,
      );
    }
  }

  if (bundledDependencies.includes("embedded-postgres")) {
    const embeddedPostgresSource = readFileSync(
      resolve(destinationDir, "node_modules/embedded-postgres/dist/index.js"),
      "utf8",
    );
    if (
      !embeddedPostgresSource.includes("const LC_MESSAGES_LOCALE = 'C';") ||
      !embeddedPostgresSource.includes("globalThis.process.env")
    ) {
      throw new Error("staged embedded-postgres runtime is missing the repository patch");
    }

    const embeddedPostgresPackage = JSON.parse(
      readFileSync(resolve(destinationDir, "node_modules/embedded-postgres/package.json"), "utf8"),
    );
    const stagedPackage = JSON.parse(readFileSync(deployedPackagePath, "utf8"));
    stagedPackage.optionalDependencies = {
      ...(stagedPackage.optionalDependencies ?? {}),
      ...(embeddedPostgresPackage.optionalDependencies ?? {}),
    };
    writeFileSync(deployedPackagePath, `${JSON.stringify(stagedPackage, null, 2)}\n`);
    rmSync(resolve(destinationDir, "node_modules/@embedded-postgres"), { recursive: true, force: true });
  }
}

// Compare realpaths: Node resolves symlinks when forming the main module's
// import.meta.url, so a bare `process.argv[1] === fileURLToPath(...)` check
// silently no-ops (exit 0) when the checkout lives behind a symlinked path
// (e.g. a bind-mounted home directory). The git-ref installer then fails one
// step later with a confusing missing-package.json error from `npm pack`.
const invokedAsScript = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  const [sourceDir, destinationDir] = process.argv.slice(2);
  if (!sourceDir || !destinationDir) {
    console.error("Usage: prepare-bundled-package.mjs <source-dir> <destination-dir>");
    process.exit(1);
  }
  prepareBundledPackage(resolve(sourceDir), resolve(destinationDir));
}
