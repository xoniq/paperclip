import esbuild from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

/**
 * The worker is bundled rather than emitted with `tsc`.
 *
 * A plugin worker is spawned as a plain `node dist/worker.js` with no
 * TypeScript loader. `@paperclipai/plugin-sdk` pulls in `@paperclipai/shared`,
 * which inside this workspace resolves to its TypeScript source — only the
 * published package points at `dist`. Emitting bare JS therefore produces a
 * worker that crashes on startup with ERR_UNKNOWN_FILE_EXTENSION as soon as it
 * is installed from a source checkout. Bundling inlines both, so the worker has
 * nothing left to resolve at runtime.
 */
const presets = createPluginBundlerPresets();
const watch = process.argv.includes("--watch");

const workerCtx = await esbuild.context(presets.esbuild.worker);
const manifestCtx = await esbuild.context(presets.esbuild.manifest);

if (watch) {
  await Promise.all([workerCtx.watch(), manifestCtx.watch()]);
  console.log("esbuild watch mode enabled for worker and manifest");
} else {
  await Promise.all([workerCtx.rebuild(), manifestCtx.rebuild()]);
  await Promise.all([workerCtx.dispose(), manifestCtx.dispose()]);
}
