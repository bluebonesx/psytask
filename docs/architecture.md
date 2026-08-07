# Architecture

## Repo layout

Bun monorepo (`bun.lock` workspaces; versions shared via root `workspaces.catalog`).

```
packages/               publishable npm packages (Rollup build)
  core/        @psytask/core        event emitter + Scene + Timer + adapter core (framework-agnostic)
  psytask/     psytask              umbrella: re-exports core + App/Collector/iterators/utils
  components/  @psytask/components  VanJS UI components + hooks (depends on psytask)
  jspsych/     @psytask/jspsych     jsPsych v8 plugin bridge (depends on @psytask/core)
  create-psytask/  create-psytask   CLI scaffolder (Bun.build, node target, standalone)
apps/                   private apps (Bun.build, browser)
  tests/       browser test suite (Playwright E2E)          → served at /psytask/tests/
  play/        playground: Monaco editor + iframe preview   → /psytask/play/
  benchmark/   benchmark runner vs jspsych/lab.js/psychoJS  → /psytask/benchmark/
shared/                 private, NOT published: utils.ts, types.d.ts, hook.ts, macro (bundled into consumers)
scripts/                build.ts, dev.ts, e2e.ts, publish.ts, utils.ts (excluded from ESLint)
```

## Module responsibilities & public API surface

### `packages/core` (`@psytask/core`) — zero-dependency kernel
- `EventEmitter<T>`: typed emitter; listeners stored in a `Set` per event type
  (dedupe + easy counts); `dispose` is a reserved built-in event; emitter itself
  implements `Disposable` (`[Symbol.dispose]() { this.emit('dispose') }`).
- `Scene<T extends MaybeGenericComponent>`: the unit of a task. Owns a root
  `HTMLDivElement`, a `Timer`, the reactive props object, and a data getter.
  Emits `'show' | 'frame' | 'close'` plus inherited `'dispose'`.
- `createTimer(shouldStop)`: the rAF timer factory (see scene-model.md).
- `Component` type: `(props: P) => NodeLike | NodeLike[] | { node, data() }`.
- `createComponentAdapter(reactiveFn)`: wraps components with a reactive props
  system. `mark` stamps the reactive fn onto the component via a `Symbol`
  (idempotent; survives cross-adapter rendering); `render` calls the component
  exactly once with `defaultProps`, wrapping the call with the `sceneStack`
  (for `getCurrentScene`), and normalizes the return into
  `{ props, nodes, data }`.
- `generic(f)`: runtime identity; only exists to give generic components
  (e.g. `Loader`) full type-inference for `scene.show()`.
- `getCurrentScene()`: returns top of `sceneStack`; throws if called outside a
  component render. **Only valid synchronously in the component body** (the
  stack is pushed/popped around the single render call) — a documented
  constraint, verified by tests.

### `packages/psytask` (`psytask`) — the battery-included umbrella
Re-exports everything from `@psytask/core`, plus:
- `App` + `createApp()`: FPS detection at startup, leave-page alerts,
  `app.data` shared row data, `app.scene()` (wraps `Scene` with `duration` and
  `close_on` sugar), `app.collector()`.
- `Collector`: streaming CSV/JSON serializer (see scene-model.md).
- `createIterableBuilder`, `RandomSampling`, `StairCase`: trial-sequence
  iterators (`for...of` + `.response()` feedback).
- utils: `css` (runtime twin of the build macro), `on` (listener + cleanup in
  one call), `onPageLeave`, `defaultProps` (Proxy providing defaults for
  missing keys without writing to props), `detectFPS`.

### `packages/components` (`@psytask/components`) — VanJS-powered UI
- `adapter`: shallow-reactive VanJS adapter. Props are a `Proxy` over
  `reactive({})`: reads of **any** key lazily create the property (so
  *missing* optional keys are still trackable), and written values that are
  objects are wrapped with `noreactive` (shallow only — nested objects are
  deliberately NOT reactive).
- hooks: `useDevicePixelRatio`, `useWindowPhysicalPix`, `useFetch`
  (status `waiting/loading/success/failed` store, progress via
  Content-Length, abort on failure of any sibling via `AbortController`).
- components: `ImageStim` (canvas w/ ImageBitmap/ImageData or draw callback),
  `Grating` (per-pixel computed gabor/grating on a canvas, with orientation,
  phase, spatial frequency, color ramp, Gaussian-style mask),
  `Loader` (concurrent url→Blob loader with progress list, abort-on-error,
  generic-blobs typing), `PhysicalWidthDetector` & `ViewDistanceDetector`
  (calibration UIs), `VirtualChinrest` (composes the two detectors, persists
  `pix_per_cm`/`distance_cm` to localStorage, returns deg↔cm↔pix converters).

### `packages/jspsych` (`@psytask/jspsych`) — jsPsych v8 plugin bridge
`jsPsychStim` is a normal PsyTask Component. It mocks the jsPsych runtime
enough to run jsPsych **class plugins** (`static info`, v8 style) inside a
Scene: builds the jspsych DOM cascade
(`div.jspsych-display-element > .jspsych-content-wrapper > #jspsych-content`),
fills plugin parameter defaults, calls `on_start`, instantiates the plugin with
a mocked `jsPsych` (`finishTrial` + `pluginAPI` limited to `KeyboardListenerAPI`
and `TimeoutAPI`, auto-bound; every other API is a Proxy that logs a warning),
then `await plugin.trial(content, trial, on_load)`; `trial_data` is merged with
`trial.data`, `on_finish` runs, `post_trial_gap` delays close. On each `show`,
if props differ from the scene-creation defaults, the trial re-runs.
Function-style (v7) plugins throw at runtime.
`internal:jspsych:*` imports are resolved at build time by the package's
custom `build.config.ts` `resolve()`.

### `packages/create-psytask` — CLI
Clack-prompted scaffolder; copies `template/`, rewrites package.json
(scripts per bundler choice: vite vs bun), toggles TS/JS
(JS → rename tsconfig→jsconfig, swap `main.ts`→`main.js`). Node>=22.

### `shared/`
Internal util code that is **inlined into every consumer at build time**
(never external, never published): micro-utils (`ERR`, `rAF`, `mount`, `tags`
(an HTML-tag factory Proxy), `css`-adjacent helpers, `IQR`, `mean`, ...), the
`LooseObject`/`Merge`/`Equal` types, `hook.ts` (`useHash` for the play app),
and `macro/index.ts` (a `glob()` Bun macro used by `play`/`benchmark` to list
example/bench files at build time). Global type refinements for `Object.keys`,
`String.split`, `Array.map` etc. live in `shared/env.d.ts`.

## Dependency graph

```
shared ─────────────┐ (bundled inline into everything)
                    ▼
@psytask/core ◄───── psytask ─────────────┐
   ▲                  ▲                  ▼
   │                  │            @psytask/components (peer+deps: psytask, vanjs-core, vanjs-ext)
   └── @psytask/jspsych (deps: auto-bind, @psytask/core)
README.md (root) is a symlink → packages/psytask/README.md
```

Design rule: **`core` is UI-framework-agnostic and has zero runtime deps.**
Everything else layers on it. `components` additionally requires
`vanjs-core`/`vanjs-ext` (catalog versions). Note `@psytask/components` lists
`psytask` in BOTH dependencies and peerDependencies (so it works as a direct dep
or as a peer of the host app).

## Build pipeline (`scripts/build.ts`)

- `scripts/utils.ts` imports `bun.lock` directly to discover workspace
  projects, computes `workspace:` deps, and topologically sorts with cycle
  detection.
- **Packages → Rollup** (esbuild transform + `@rollup/plugin-commonjs` +
  `node-resolve`), two outputs: `index.js` (Node-ish, external = the package's
  declared deps) and `index.min.js` (browser, external = the shared CDN
  importmap). Types via `rollup-plugin-dts` with `includeExternal: ['shared']`
  so published `.d.ts` bundles are self-contained.
- **Apps → Bun.build** with a virtual `index.html` generated from
  `build.config.ts` `importmap`/`styles`; external = importmap keys; app asset
  dirs (cases/, examples/) are copied (prod) or symlinked (dev) by each app's
  custom `after()` in `build.config.ts`.
- `css()` **macro**: when `!__DEV__`, a Rollup plugin AST-walks the bundle and
  rewrites static `css({...})` calls into template-literal CSS strings
  (`background-color:red;...`), warning on non-literal args. In dev, the
  runtime `css()` from `packages/psytask/src/utils.ts` is used instead.
  → **Never write dynamic calls to `css()` expecting them to be inlined.**
- `bun run build <name>` builds one project (deps first); bare `bun run build`
  builds everything + TypeDoc → `dist/`.

## Dev server & E2E

- `bun run dev` → `scripts/dev.ts`: Bun HTTP server on `:3000`, lazy builds with
  fs watching per project, serves apps at `http://host:3000/psytask/<name>/` and
  packages at `/psytask/public/<name>/`. Dev builds use sourcemaps + symlinks
  and disable the css macro.
- `bun run e2e tests` → `scripts/e2e.ts`: Playwright; **must run after
  `bun run build`** (E2E serves `dist/` via a static server, see the CI action
  `.github/actions/e2e`). Prod runs chromium+firefox+webkit concurrently; dev
  mode runs a headed local chromium. Progress/errors are colored console relay.
- `bun run e2e benchmark` drives the benchmark app: opens case-windows via
  `window.open`, collects results, saves downloads under `dist/download/`.
- CI (`cd.yml`): `bun ci` → `bun run build` → e2e → deploy Pages + publish
  changed packages (tag pushes or workflow_dispatch).

## Things future agents should know before touching a build

1. `shared/` code is **inlined** into packages and apps. Changing `shared/`
   changes published bundles without any version bump mechanics — rebuild
   everything.
2. Bundlers differ per target; do not assume `Bun.build` for packages.
3. `css()` macro + `css()` runtime must stay behaviorally identical.
4. `dist/` is generated; never edit it. The dev server symlinks into it.
5. `scripts/**` is excluded from ESLint (per root eslint.config.js + AGENTS.md).
6. Version bumping/publishing is semi-automated (`scripts/publish.ts` compares
   against the npm registry and skips unchanged packages); `scripts/version.ts`
   is a TODO stub with no logic.