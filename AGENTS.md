# AGENTS.md

## Project

PsyTask — a lightweight JavaScript framework for psychology experiments. Bun monorepo.

### Workspace layout

- `packages/` — publishable npm packages (built with Rollup)
  - `core` → `@psytask/core` (event emitter, Scene)
  - `psytask` → `psytask` (re-exports core + app, collector, iterator, utils)
  - `components` → `@psytask/components` (UI components, depends on VanJS)
  - `jspsych` → `@psytask/jspsych` (jsPsych plugin adapter)
  - `create-psytask` → `create-psytask` (CLI scaffolding)
- `apps/` — private demo/test apps (built with Bun.build)
  - `tests/` — browser-based test suite (no vitest/jest — runs in browser via Playwright)
  - `play/` — interactive examples
  - `benchmark/` — performance benchmarks
- `shared/` — internal shared code (`utils.ts`, `hook.ts`, `macro/`)
- `scripts/` — build, dev server, e2e, publish tooling

## Commands

```bash
bun run build          # build all packages + apps + typedoc (run from root)
bun run build <name>   # build a single project (e.g. bun run build core)
bun run dev            # dev server at localhost:3000 with file watching
bun run lint           # ESLint (ignores dist/ and scripts/)
bun run format         # Prettier write
bun run e2e tests      # Playwright E2E against built dist/ (requires build first)
bun run e2e benchmark  # Playwright benchmark runner
bun run docs           # TypeDoc → dist/
bun run publish        # publish changed packages to npm
```

CI runs: `bun ci` (frozen-lockfile install) → `bun run build` → e2e tests → deploy/publish.

## Key conventions

- **Package manager: Bun** — uses `bun.lock`, `bun` types, `Bun.build`, `Bun.serve`.
- **Two tsconfigs**: `tsconfig.app.json` (browser code, ES2017 target, DOM lib) and `tsconfig.node.json` (scripts/macro, Bun types, ESNext). Root `tsconfig.json` references both.
- **Build split**: packages use **Rollup** (with esbuild transform + `rollup-plugin-dts` for type bundles). Apps use **Bun.build** directly.
- **`css()` macro** (`shared/macro/index.ts`): Rollup plugin transforms `css({...})` object calls into template literal strings at build time. Only active in production builds.
- **`build.config.ts`**: optional per-project file exporting `importmap`, `styles`, `watchItems`, `before()`, `after()`, `resolve()`. Read by `scripts/utils.ts`.
- **Workspace deps**: use `workspace:^` (packages) or `workspace:*` (apps) in package.json. Shared versions via `catalog:` in root `workspaces.catalog`.
- **`using` keyword**: project uses TC39 Explicit Resource Management (`Symbol.dispose`). TypeScript config includes `ESNext.Disposable` lib.
- **No standard test runner**: tests live in `apps/tests/cases/*.test.ts`, run as a browser app. E2E script (`scripts/e2e.ts`) opens Playwright, navigates to the tests page, and waits for `data-test="passed"` or `data-test="failed"` on the root element.
- **ESLint**: ignores `**/dist/**` and `scripts/**`. Uses `eslint-plugin-compat` with `browserslist` from root package.json.
- **Prettier**: config in root `package.json` (singleQuote, trailingComma all, tsdoc, jsdoc plugin).
- **Entry points**: packages export from `index.ts` at package root, which re-exports from `src/`. Apps use `main.ts` as entry.
- **Dev server**: `bun run dev` starts a Bun HTTP server on port 3000. Apps served at `/psytask/<name>/`, packages at `/psytask/public/<name>/`.

## Gotchas

- `bun run build` must complete before `bun run e2e` — e2e serves from `dist/`.
- The dev server (`bun run dev`) uses `--dev` flag which changes build behavior (sourcemaps, symlinks instead of copies).
- `scripts/` directory is excluded from ESLint — changes there won't be linted.
- `dist/` is gitignored and generated. Never edit files in `dist/`.
- `packages/jspsych/build.config.ts` has a custom `resolve()` for `internal:` imports — resolves jsPsych internal module paths at build time.
- Browser targets defined in root `package.json` `browserslist` — affects `eslint-plugin-compat` checks.
