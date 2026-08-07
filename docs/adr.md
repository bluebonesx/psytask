# Architecture Decision Records

Key decisions, reconstructed from code + commit history. Status: all **Accepted**
unless noted. Each entry records the context, the choice, and consequences.

---

## ADR-001 — Scenes as the unit of a task ("tasks are like PPTs")

**Context.** Experimental tasks are sequences of trials sharing little structural
variety (fixation → stimulus → response → feedback). Existing frameworks hit two
pain points: forcing a monolith experiment runner, and heavy abstractions.

**Decision.** The framework exposes one primitive — the **Scene** (create once,
show repeatedly) — plus iterators (`RandomSampling`, `StairCase`) for sequencing.
`app.scene(Component, options)` → `await scene.show(patchProps)` → trial data.
Components are plain functions called **once**; display state is driven by
props reactivity, never by re-rendering the whole scene.

**Consequences.**
- The API surface is tiny and PPT-intuitive; the README literally teaches the
  whole model in two code blocks.
- Scene creation cost is paid once; repeated shows are cheap (props assignment
  + DOM show/hide via `scale`).
- The "called once" constraint is invisible-but-load-bearing: authors must use
  `ctx.on('show')` for per-trial logic, and `getCurrentScene()` must be called
  at sync top scope. Tests pin both (see tests.md).

## ADR-002 — rAF/VSync-based timing instead of setTimeout/Date.now

**Context.** Reaction-time and stimulus-onset measurements need sub-frame
accuracy and alignment with the display refresh. `setTimeout` drifts with tab
throttling and event-loop load; `performance.now()` alone can't align onset with
an actual painted frame.

**Decision.**
- `createTimer` records the **start timestamps of VSync frames**
  (`TimerRecords`); a scene's show-duration is derived from those records, not
  from a stopwatch (`d7a6c6a feat(core): real duration`).
- A module-level `currentFrameTime` tracks "inside the render pipeline"
  (set per rAF, cleared by a macrotask after microtasks drain). `close()` uses
  it to stop the timer in the same frame as the triggering event
  (`queueMicrotask` vs one-shot `rAF`).
- If a scene starts *within a frame callback/microtask*, that same frame's
  timestamp is captured as the scene's frame 0; otherwise the next frame is.
- App default duration condition compensates a **half frame** to hit the
  nominal wall-clock duration on average
  (`time - records[0] >= duration - frame_ms/2`), with `frame_ms` measured
  once at `createApp` (IQR-outlier-filtered mean).

**Consequences.**
- `frame_times[0]` is the ground truth for trial-relative RTs; tests assert it
  equals an independently captured rAF timestamp.
- The stopping frame is excluded from records (state changes land *after* the
  last recorded frame); `close()` from a keydown during a frame records that
  frame and stops within it.
- Subtle invariants: timer instances are per-scene and single-flight
  (`start()` twice without stop is an error); consecutive shows never
  double-count a frame.

## ADR-003 — ComponentAdapter: reactivity system as a pluggable adapter

**Context.** The project wants UI freedom (Vue, Solid, Lit, Van, RxJS, MobX...)
without owning a reactivity engine, and without punishing plain-JS components.

**Decision.** `createComponentAdapter(reactiveFn)` yields `{ mark, render }`:
marking stamps the reactive fn on the component via a `Symbol`; rendering wraps
`defaultProps` with that fn and calls the component exactly once on top of the
`sceneStack`. The default app adapter is identity (no reactivity — you update
DOM via `on('show')`), `@psytask/components` ships the VanJS adapter, and users
can `adapter.mark` a component and nest frameworks freely
(`af0e9b2 refactor(core): replace adapter.wrap with adapter.mark`).

**Consequences.**
- Cross-framework nesting works because the reactive fn travels **with the
  component**, not with the renderer (tests: Vue parent + Solid child).
- `mark` is idempotent; an unmarked component picks up the rendering
  adapter's fn.
- The reactive proxy contract is shallow: `@psytask/components`'s adapter
  lazily materializes read keys (so missing optionals are trackable) and
  `noreactive`s nested objects (deep reactivity is the *component's* job).

## ADR-004 — `using` / Disposable for resource lifecycle

**Context.** Browser experiments leak listeners/DOM easily when cleanup is
manual (jsPsych/lab.js require framework callbacks). The project targets modern
browsers and accepts cutting-edge JS.

**Decision.** Every long-lived object (App, Scene, Collector, `EventEmitter`)
implements `Disposable`; `using` scope-exit (or manual `emit('dispose')`)
triggers teardown: remove root DOM, remove window/document listeners, flush
collector backups, cancel FPS watchers. `EventEmitter` synthesizes the
`dispose` event and the symbol polyfill (`Symbol.for('Symbol.dispose')`) for
older engines; the README documents the `try/finally` fallback for CDN users on
old browsers.

**Consequences.**
- Deterministic, nested, order-reversed cleanup without a DI container.
- The `using` requirement is a DX + browser-compat constraint; `play`'s
  welcome screen and the README explicitly gate on it.

## ADR-005 — Build split: Rollup for packages, Bun.build for apps, css() macro

**Context.** Packages must ship as minimal ESM on npm with bundled `.d.ts` and
tiny browser bundles (10.67 KB is a marketing number); apps are private demos
that can lean on the server and importmaps.

**Decision.**
- **Packages** → Rollup (+esbuild transform, commonjs, node-resolve) producing
  `index.js` (externals = declared deps) and `index.min.js` (externals = shared
  CDN importmap), plus `dist/index.d.ts` via `rollup-plugin-dts` with
  `shared` types inlined (published artifacts are self-contained).
- **Apps** → `Bun.build` with a virtual HTML generation step and per-app
  `build.config.ts` for importmap/styles/watch/copy hooks.
- `css({...})` is a **build-time macro** (AST rewrite to template literals,
  production only) so CSS strings cost nothing at runtime; dev uses the
  runtime stringifier twin in `psytask`'s utils.
- `shared/` is intentionally inlined (not externalized): it is a private
  package that bundles into every consumer.

**Consequences.**
- CSS and `css()` must stay structurally static (macro warns on non-literal
  args); dev/prod must behave identically.
- `bun run build` must precede `bun run e2e` (e2e serves `dist/`); the dev
  server symlinks instead of copying and disables the macro.

## ADR-006 — jsPsych bridge by mocking the runtime, not adopting it

**Context.** Hundreds of jsPsych v8 plugins exist and are battle-tested;
reimplementing them is pointless, but running fully under jsPsych forfeits
PsyTask's Scene/timing benefits. v8 plugins are (mostly) self-contained class
plugins only needing a DOM root + `jsPsych` API surface.

**Decision.** `jsPsychStim` is a normal PsyTask Component that builds the
jspsych DOM cascade inside the Scene root and mocks the API minima plugins rely
on: `finishTrial(trial_data)`, `pluginAPI.KeyboardListenerAPI` (bound to
`ctx.root`) and `pluginAPI.TimeoutAPI` (auto-bound). Unsupported `jsPsych.*` /
`pluginAPI.*` access warns via Proxy (missing keys yield `undefined` + a
`console.warn`). `on_start`/`on_load`/`on_finish`, `post_trial_gap`,
`css_classes` (string | array | getter) are honored; plugin default parameters
are filled from `Plugin.info.parameters`. The trial re-runs on `show` only if
props differ from the creation-time defaults. Internal jsPsych modules are
imported via `internal:` specifiers resolved at build time
(`packages/jspsych/build.config.ts`).

**Consequences.**
- Interop is limited to v8 class plugins (v7 function plugins throw), and to
  the mocked API surface — plugins using `jsPsych.data`, cameras, audio, etc.
  will warn (and typically no-op or break loudly).
- Timing/data stay fully PsyTask-native; plugin data merges into the Scene's
  show() result.
- Tests validate against real CDN plugins (survey, html-keyboard-response,
  html-button-response) — requires network in the test run.

## ADR-007 — Collector as a streaming serializer with shared-row stamping

**Context.** Trials generate rows on an event loop; writing the full file per
row is wasteful; losing data to a closed tab is tragic; users need custom
formats and server pushes (JATOS).

**Decision.** `Collector` serializes incrementally: `header` once, `body` per
row into an accumulating buffer (both emitted as `chunk` events), `footer` on
`final()`. Format picked by filename extension (`.csv` RFC-4180-ish with
JSON-stringified objects; `.json` as an array) and extensible via
`Collector.serializers`. `app.collector()` automatically stamps `app.data`
(`frame_ms`, `leave_count`, user data) into every row **at add-time** via
`Object.assign` — the collector row is a snapshot. `backup_on_leave` (default
on) downloads a `.bak` when the tab hides.

**Consequences.**
- Rows are immutable snapshots; later `app.data` edits don't leak into earlier
  rows (pinned by tests) — be deliberate about when shared data may change.
- Unknown extensions throw at construction (fail fast); custom serializers are
  a first-class extension point (XML example in tests).
- `add()` returns the serialized-so-far string; `download()` no-ops on empty
  data.

## ADR-008 — Iterators with feedback for trial sequencing

**Context.** Trial sequences need randomness (sampling) and adaptive
staircases; `for...of` is the most ergonomic loop for authors; adaptive
algorithms need per-trial feedback *inside* the loop.

**Decision.** `createIterableBuilder` wraps a generator into a single-pass
iterable exposing `.response(value)` (fed to the generator as `yield`'s
return) and, after completion, `.data` (the generator's return value).
`RandomSampling` and `StairCase` are built on it.

**Consequences.**
- Single-pass semantics are enforced by erroring on a second iteration and on
  premature `.data` access.
- `StairCase` encodes a precise protocol the psychophysics community expects:
  1-up-1-down before the first reversal, then "N consecutive same-value
  correct → step down, M consecutive same-value incorrect → step up", clamped,
  with the threshold = mean of reversal values. The exhaustive numeric test
  vectors are the specification.
- Type-level feedback: `.response` on a no-feedback generator is a type error
  (`never`).

## ADR-009 — FPS detection + leave guards at app bootstrap

**Context.** Timing math needs `frame_ms` up front; subjects abandon tasks by
switching tabs; data loss and invalid trials follow.

**Decision.** `createApp()` (async) runs a full-screen FPS probe
(`detectFPS`, default 30 frames, IQR-filtered mean), wiring alerts for leaving
during detection (`alert` + reload) and during the task (`alert`), plus a
`beforeunload` warning. Leaving increments `app.data.leave_count` (recorded in
every collector row).

**Consequences.**
- App construction is async and takes ~0.5s+; the overlay is visually
  explicit.
- All listeners are tracked and removed on dispose (test asserts exactly 2).
- `leave_count` is experimental data in itself — do not remove the alert
  handlers casually.