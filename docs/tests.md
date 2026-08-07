# Test harness & behavioral contract

There is no vitest/jest. The suite is a **browser app** (`apps/tests/`) run by
Playwright (`bun run e2e tests`; requires `bun run build` first, CI serves
`dist/`). Run *all* tests across chromium/firefox/webkit in CI.

## How the harness works

- `apps/tests/main.ts` imports the test modules (`cases/{core,psytask,
  components,jspsych}.test.ts`) — each file exports grouped objects whose
  leaves are async functions in the shape `{ [group]: { [caseName]: fn } }`
  (JS object-key names, note the leading `_` prefixes in exports). It builds a
  reactive VanJS tree of `<details>`/`<section>` views.
- Test jobs run through a **sequential FIFO microtask queue** (`runJob`):
  tests never run concurrently; between jobs it `await sleep(1)` to let the
  DOM/render pipeline settle. A failing test stops the queue.
- Each case view has `data-test` attribute `pending | running | passed |
  failed`; group states are derived from children (deepest failure wins).
  Playwright's `tests` script clicks the first `▶` button, then observes the
  **first** `[data-test]` element's attribute (the `ALL` group root) for
  `passed`/`failed` (1-minute timeout).
- Test tools in `cases/utils.ts`: `expect` (Object.is or deep-JSON equality),
  `expect_closeTo`, `expect_includes`, `expect_error`, `DefaultScene`/
  `DefaultAdapter` (identity adapter + auto-stopping timer), spies
  (`spy_listeners`, `spy_functionCall`, `spy_browserDownload`), mocks
  (`mock_event`, `mock_leaveAndBack` visibility, `mock_changeDPR`,
  `mock_httpbin` fetching `/bytes/N`, `/status/N`), `sleep`, `nextFrame`.

## Behavioral contract pinned by the suite (read before changing behavior)

### core (`core.test.ts`)
- `getCurrentScene`: valid at top scope of a component body; throws inside
  event handlers and outside components.
- Scene disposal removes the root DOM node.
- **Props reset**: `show(patch)` merges over defaults; next `show()` without a
  key resets that prop to `undefined` (optional) or back to the default.
  (A commented-out test group shows that mutating `defaultProps`' nested
  objects is intentionally unsupported/being removed.)
- Lifecycle hook counts: `show` ×1, `close` ×1, `frame` per recorded frame;
  no duplicate frames across multiple `show()` calls.
- Display: node connected, zero-width before `show()`, full-size during
  `show()`, zero-width after.
- `close()` immediately (or from `on('show')`) → resolves with empty
  `frame_times`.
- Timer stop excludes the stopping frame; `frame_times[0]` equals an
  externally captured rAF timestamp (including when `show()` is called from
  within a rAF callback); consecutive shows' frame ranges never overlap.
- `duration` equals the gap between consecutive shows' first frame times.
- Adapter: node normalization (string/element/array/object), `mark` idempotent,
  marked component keeps its own reactive fn across adapters (**cross-framework
  nesting**: Vue parent embedding a Solid child works), and adaptation to
  Vue/Solid/Preact/MobX/valtio/nanostores via their reactivity primitives.
- EventEmitter: dedupe, emit ordering + safe mutation during emit, `once`
  self-removal, `dispose` emission, no-op `off`/`emit` without listeners.
- `generic` type-level check makes `scene.show(props)` keep the exact type.

### psytask (`psytask.test.ts`)
- `createApp` runs exactly `frame_count` FPS frames; leave alert behavior
  (enabled/disabled/i18n), `leave_count` increments, `history.go()` during FPS.
- Scene root fills the viewport while shown; `config` one-shot semantics
  (see scene-model.md) including restoring `undefined` options.
- `close_on` matrix: plain event names, `key:<key>` incl. space, `mouse:<button>`
  incl. `unknown`; component-registered listeners still fire once (and only
  once) when the scene closes on input (`dispose`-registered native listeners
  coexist with `close_on`).
- VanJS adapter through `app.scene` is **shallow-reactive**: mutating a nested
  object doesn't re-run derivations; only replacing/adding top-level props does.
  Reading a non-existent optional prop is tracked (see adapter's lazy-create).
- Iterators: single-pass (second iteration throws), `.response` feeding,
  `.data` timing, RandomSampling semantics (no mutation, no-replacement bound),
  exhaustive StairCase numeric sequences (see scene-model.md).
- Collector: CSV/JSON exact output incl. quoting of commas/quotes/newlines,
  object/array stringification, null/undefined → empty, multi-`final`
  idempotency, empty data (`''` for csv, `'[{},{}]'` for json with `{}` rows),
  custom/registered serializers, unknown extension errors, backup-on-leave
  download filename pattern `test.csv<ts>.bak`, dispose removes
  visibilitychange listener.
- `defaultProps` proxy: merges defaults, stays reactive, type-checked.
- `detectFPS` length/durations; leave alert.

### components (`components.test.ts`)
- adapter shallow reactivity + optional-key tracking (as in psytask tests).
- `useDevicePixelRatio` reacts to mock DPR changes; `useWindowPhysicalPix`
  reports `innerWidth*dpr`; `useFetch` lifecycle (`waiting→loading→success`,
  reactive URL inputs, 404 → `failed` with error message).
- `Loader`: close-while-loading resolves fast; empty urls (array or object);
  repeated/changed urls; progress text appears (`%`); one failing url aborts
  the rest and reports the error; custom `children` re-runs only when the
  reference changes; generic type inference for `blobs` key mapping.
- `ImageStim`: ImageData/ImageBitmap sizing; `draw` runs on show.
- `Grating`: pixel math — sin grating orientation/color flips render with
  ~128 alpha at half-intensity; size updates; mask = circle opacity.
- Detectors: `PhysicalWidthDetector` pix↔cm math incl. 0/NaN edge cases, drag
  interaction (pointerdown/move/up), i18n rendering; `ViewDistanceDetector`
  blindspot physics (`distance = avg(cm) / (2 tan(deg/2))`), frame-advance
  moving animation, i18n.
- `VirtualChinrest`: deg2cm/deg2pix/deg2csspix math incl. DPR reactivity;
  previous-data flow (usePreviousData true/false/undefined + confirm accept/
  cancel), and *all* invalid-previous-data shapes (missing key, wrong types,
  NaN) fall back to running the detectors with a `console.warn` (never crash).

### jspsych (`jspsych.test.ts`)
- Missing jsPsych/pluginAPI keys → `undefined` values + exactly one
  `console.warn` each (no exceptions).
- `post_trial_gap` delays close by ≥ the gap.
- `css_classes` accepts a string, array, or getter, applied to
  `#jspsych-content`.
- Lifecycle: `on_start` mutates the trial, `on_load` runs, `on_finish` mutates
  returned data; plugin data + `trial.data` merge into show() result.
- Real plugins (CDN): `@jspsych/plugin-survey` (fill + submit), 
  `html-keyboard-response` (keydown → response), `html-button-response`
  (click → response). These require network access — the jspsych CSS is loaded
  once, memoized.

## Writing new tests

- Add a grouped case in the matching `cases/*.test.ts` (or a new module added
  to `mods` in `main.ts`). Async functions only; assertion helpers throw on
  failure.
- Keep cases independent: they share one page and run sequentially; restore
  globals you mock (`spy_*` objects are `Disposable`, so prefer `using`).
  Mock DPR/fetch/leave events rather than relying on real timing where
  possible; use `sleep`/`nextFrame` to cross render-pipeline boundaries.
- Re-run `bun run build` then `bun run e2e tests` to validate.