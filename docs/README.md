# PsyTask — Codebase Docs

Read this first if you are new to the repo. These docs are derived from code
evidence (source, tests, build scripts, git history), not from design docs.

`AGENTS.md` in the repo root covers **commands, conventions and gotchas**. These
docs cover **why the code is the way it is** and the domain model.

## Index

| File | Content |
| --- | --- |
| [architecture.md](architecture.md) | Repo layout, module responsibilities, boundaries, dependencies, build/dev/e2e pipeline, public API surface |
| [scene-model.md](scene-model.md) | The core domain logic: Scene lifecycle, timer semantics (frame_time precision), props merge rules, close_on, data contract, invariants |
| [tests.md](tests.md) | The browser test harness and what behavior the suite pins down (behavioral contract) |
| [glossary.md](glossary.md) | Domain terms and their precise meanings |
| [adr.md](adr.md) | Key design decisions and the rationale behind them |

## 30-second model

- **PsyTask** = a *very small* framework (published `psytask` bundle ≈ 10 KB,
  per `apps/benchmark` results) for building browser psychology experiments.
  The selling points vs jsPsych/lab.js/psychoJS: bundle size, timing precision,
  and freedom of UI (any reactive UI lib via adapters).
- **A task is a list of Scenes.** Each Scene is created once
  (`app.scene(Component, options)`), then shown repeatedly
  (`await scene.show(patchProps)`). `show()` displays the scene, waits until a
  timer or a `close()` stops it, and resolves with trial data
  (component data getter merged with built-in `frame_times` and `duration`).
- **A Component is a plain function** `(props) => node | { node, data() }`.
  Called **once** at scene creation; per-show DOM updates happen through
  reactivity driven by `props` changes (or `ctx.on('show')` hooks).
- **Timing is rAF-based.** `frame_times` are VSync frame timestamps; scene
  duration is derived from them rather than from wall-clock stopwatches. This is
  the core technical differentiator and the source of most non-obvious code.
- **`using` / `Symbol.dispose` everywhere.** Apps are written with the modern
  `using` keyword for deterministic cleanup (`app`, scenes, collectors are all
  `Disposable`; dispose emits a `'dispose'` event). Old browsers need a manual
  `try/finally` + `app.emit('dispose')` fallback (documented in README).
- **Data collection** = `app.collector('data.csv')` (or `.json`); streaming
  serializers, each `add(row)` emits a chunk; the App auto-merges shared
  `app.data` (`frame_ms`, `leave_count`, + anything you set) into every row at
  `add` time; auto-backup download on page-hide.
- **Ecosystem**: `@psytask/components` (VanJS-based stimuli/setup UI:
  Gratings, ImageStim, Loader, VirtualChinrest/calibration detectors),
  `@psytask/jspsych` (bridge to run jsPsych v8 class plugins inside a Scene),
  `create-psytask` (CLI scaffolder).

## What is NOT in this repo

- No unit-test framework (no vitest/jest): tests are a browser app run through
  Playwright (`apps/tests/`, see [tests.md](tests.md)).
- No runtime `css()` helper in production builds: `css({...})` calls are
  statically rewritten to template literals by a build macro in `scripts/build.ts`
  (dev keeps the runtime version in `packages/psytask/src/utils.ts`).
- `shared/` is a **private** workspace package; it is inlined ("bundled") into
  every published package and app at build time (see `docs/architecture.md`).