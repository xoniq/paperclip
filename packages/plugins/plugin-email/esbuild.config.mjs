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
 *
 * nodemailer is inlined for the same reason: the worker must run from
 * `dist/worker.js` alone, without the plugin's node_modules being present.
 */
const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });
const watch = process.argv.includes("--watch");

/**
 * nodemailer is CommonJS, and esbuild's ESM output rewrites the `require` calls
 * it cannot resolve statically into a shim that throws
 * `Dynamic require of "events" is not supported` — at import time, so the
 * worker dies on startup rather than at first send. Putting a real `require` in
 * scope makes that shim delegate to it instead of throwing.
 *
 * Worker only: the manifest and UI bundles have no CommonJS dependency, and the
 * UI bundle targets the browser where `node:module` does not exist.
 */
const requireBanner = [
  'import { createRequire as __pluginCreateRequire } from "node:module";',
  "const require = __pluginCreateRequire(import.meta.url);",
].join("\n");

const contexts = await Promise.all([
  esbuild.context({ ...presets.esbuild.worker, banner: { js: requireBanner } }),
  esbuild.context(presets.esbuild.manifest),
  esbuild.context({ ...presets.esbuild.ui, jsx: "automatic" }),
]);

if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("esbuild watch mode enabled for worker, manifest, and ui");
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
