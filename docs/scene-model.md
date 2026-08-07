# Scene model, timing and data contract

The heart of PsyTask. Everything below is inferred from
`packages/core/src/scene.ts`, `packages/core/src/event-emitter.ts`,
`packages/psytask/src/app.ts`/`collector.ts`/`iterator.ts`, and the test suite.
Code is the source of truth; this doc explains *why*.

## Mental model: a task is a deck of slides

A Scene ≈ a slide, created once and shown many times:

```ts
using scene = app.scene(Component, {
  defaultProps: { text: 'Press F or J' },
  duration: 1e3,          // or close_on: 'key:f' etc.
});
const data = await scene.show({ text: 'trial 1' }); // per-trial override
```

`show()` resolves with **trial data** = component's data-getter output merged
with built-in timestamps (see "The data contract" below).

## Component contract (what a component may be)

Following the README, a Component is a function Props→Node(s) or
`{ node, data() }`:

- Return `NodeLike` (string | Node) or an array; they get appended to the
  scene root.
- Or return `{ node, data: () => D }` where `D` is the per-show data.
- **Called exactly once** (at scene construction, via `adapter.render`). All
  subsequent display changes must come from *reactivity* on `props` or from
  scene event hooks registered with `getCurrentScene()`.
- `getCurrentScene()` is only valid synchronously in the component body.
  Calling it inside event handlers/async closures throws
  (verified by tests "nested usage" / "outside usage").
- Data getters may **not** return keys `frame_times` / `duration` — reserved
  (`ForbiddenData` in the types).

## Scene lifecycle (`scene.show`)

Order of operations (mirrors the README mermaid, confirmed in code):

1. **Props update**: `newProps = { ...defaultProps, ...patchProps }`; every key
   of `currentProps ∪ newProps` is assigned onto the reactive props object.
   → **Every show starts from the defaults again**; a missing patch key resets
   that prop to `undefined` (or its default), see test "reset optional props".
2. `emit('show')` — components reset state/DOM here.
3. `root.style.scale = '1'; root.focus()` (root has `tabIndex = -1` so it can
   receive keyboard events). Visible **on the next frame**; meanwhile DOM reads
   in `show()` handlers still see it hidden (`scale: '0'` — visible but
   zero-sized; deliberate: keeps layout/painting pipeline sane, no
   display:none flicker).
4. `await timer.start(t => emit('frame', t))` — see timer section.
5. `root.style.scale = '0'`.
6. `emit('close')`, then resolve `{ ...dataGetter(), frame_times, duration }`.

`scene.close()` (manual close, e.g. on a keypress): stops the timer
*precisely* — `queueMicrotask` if we're inside the rAF render pipeline, else
delayed one `rAF`. This makes manual closes land on the same frame as the
triggering event, keeping `frame_times` consistent.

`dispose` (`using` scoping end / manual emit) removes the root DOM node.

## The rAF timer and frame-time semantics

`createTimer(shouldStop)` in `packages/core/src/scene.ts`:

- Module-level `currentFrameTime` tracks "are we inside the rAF render
  pipeline". A global rAF loop sets it per frame and clears it via a `setTimeout`
  (macrotask) after the pipeline drains. **Microtasks spawned during a frame
  callback still see it set** — this is what `close()` and `start()` rely on.
- `start(onFrame?)`:
  - If called inside a frame (or its microtasks), the **current frame time is
    recorded as the first element** of `TimerRecords` immediately and `onFrame`
    fires for it; the next `rAF` begins thereafter.
  - Otherwise the first record arrives on the next frame.
  - Each subsequent frame: `shouldStop(time, records)` runs with the
    *already-recorded* times; if it says stop, the just-arrived time is
    `records.pop()`-ed so the stopping frame is **excluded** from records, and
    the promise resolves. Non-stopping frames call `onFrame(time)`.
- `frame_times` = the *start timestamps of the VSync frames* during which the
  scene was shown. Frames are never double-counted across adjacent `show()`
  calls, and consecutive shows' records never overlap (tests "show - multi
  call", "data - start time").
- A timer instance is created **once per scene** (in the constructor, via the
  `options.timer` factory); `start()` must not be called twice without a stop
  in between (documented; throws if done twice — see `Timer` jsdoc).

Why frames are "the unit": stimulus onset/offset should align to VSync, and RT
is computed between frame times in the experiment code, not from `Date.now()`.

## `duration` and the app-side half-frame tolerance

- `Scene.show` resolves `duration = currentFrameTime - records[0]` (real
  elapsed, not a stopwatch — commit "feat(core): real duration").
- `App.scene`'s default timer condition:
  `time - records[0] >= opts.duration - app.data.frame_ms / 2` — a deliberate
  half-frame compensation so a `duration: 1000` scene shows for ~1000ms of
  *frame* time when the wall-clock usually would have already overshoot a bit.
- `createApp()` measures `frame_ms` at startup: `detectFPS` records 30 frame
  gaps, values outside `Q1 ± 1.5*IQR` are treated as outliers and dropped, the
  mean of the rest becomes `app.data.frame_ms`.
- `duration` is NOT meaningful for a scene that closed instantly (records may
  be empty) — `records[0]` is `undefined` then; tests assert only frame-array
  length in that case.

## `close_on` (App sugar for closing on input)

`app.scene(Component, { close_on })` accepts a DOM event name or an array,
with two special prefixes:

- `'key: <key>'` — closes on `keydown` with `e.key === <key>`. Plain
  `'keydown'` also works (closes on any key).
- `'mouse: left|middle|right|unknown'` — closes on `mousedown` with matching
  `e.button`. Plain `'mousedown'` closes on any button.
- Any other DOM event type (`'click'`, `'pointerdown'`, `'abort'`, `'paste'`,
  ...) is passed through as-is. `'composition*'`/`'focus*'` events are
  excluded by type.

Implementation notes (tests pin these):
- Listeners are attached on `'show'` and removed on `'close'` (via `once`).
  Only **one keydown and one mousedown listener each** is ever attached per
  show — useful when the options may contain several `key:` entries.
- `scene.config({...})` patches options for the *next* show only and is
  **one-shot**: `Scene` copies the fully-resolved options back into the user's
  `opts` on `close`, so a subsequent `show()` without `config()` returns to
  the last-resolved behavior (tests "config - override default options" and
  "config - restore undefined"). `config({ key: undefined })` removes it.

## Data collection (Collector)

- `app.collector(filename)` → `Collector` (+ wiring: every row gets
  `Object.assign(row, app.data)` on `'add'` — so `frame_ms`, `leave_count` and
  any user-set shared fields are stamped into each row **at add-time**;
  later `app.data` mutations don't retroactively edit earlier rows; test
  "collector - add shared data").
- Serializers are chosen by file extension: `.csv` (RFC-4180-ish quoting,
  objects/arrays JSON-stringified, null/undefined → empty) or `.json` (array
  of rows). Custom serializers: constructor option or
  `Collector.serializers[ext] = { header, body, footer }`. Unknown/missing
  extension throws.
- `add(row)` appends `header` (once, lazily on first add) + `body` into an
  internal buffer, emits `'add'` then `'chunk'`, and **returns the whole
  serialized-so-far string**. `final()` appends the `footer` only (idempotent
  across calls). `download()` blob-downloads `filename`.
- `backup_on_leave` (default true): on `visibilitychange`→hidden, downloads a
  `<timestamp>.bak` copy so participants can't lose data by closing the tab.

## Trial-sequence iterators (`packages/psytask/src/iterator.ts`)

`createIterableBuilder(gen)` turns a generator into a single-pass iterable that
can be **fed responses mid-loop**:

- `for (const value of it) { ...; it.response(x); }` — `response` is the value
  sent back into the generator (`yield` return value). If the generator's
  yielded type is `never` (no feedback expected), calling `.response` is a
  type error.
- After the loop, `it.data` is the generator's `return` value. Accessing
  `.data` before completion throws; iterating twice throws
  ("Iterator already done").

`RandomSampling({ candidates, sample?, replace? })`: samples with/without
replacement from a **copy** (input array never mutated); without replacement
+ `sample > len` throws; `sample` defaults to `candidates.length`.

`StairCase({ start, step, up, down, reversals, trials?, min?, max? })`:
- Yields the current value; **requires a boolean** `response(correct)` per
  trial (anything else throws).
- Before the *first reversal*: plain 1-down-1-up on each response.
- After: a value changes only after **`down` consecutive correct responses at
  the same value** (decrease) or **`up` consecutive incorrect responses at the
  same value** (increase); both rules may apply on the same trial; result is
  clamped to `[min, max]`.
- A trial counts as a `reversal` when the response differs from the previous
  trial's response. The loop ends when `reversalCount >= reversals` (or
  `trials` reached). `data` = `{ value, response, reversal }[]` — the canonical
  threshold estimate is the mean of the `reversal` entries' values (examples
  in README + `expect_StairCase_data` in tests).
- The test suite covers exhaustive numerical sequences for 1-up-1-down,
  unequal up/down, negative steps/values, min/max clamping, `trials` cap, and
  first-trial edge cases.

## FPS detection & leave handling (`createApp`)

- `detectFPS`: shows a full-screen "Detecting FPS... N%" overlay, collects 30
  frame gaps; if the tab is hidden mid-detection, alert + `history.go()`
  (reload). Overlay is removed afterwards.
- `createApp` wires `onPageLeave` (visibilitychange→hidden) → increments
  `app.data.leave_count` and (if enabled) alerts; plus a `beforeunload`
  handler. All listeners are removed on `dispose` (test asserts exactly 2
  total listeners while alive).
- FPS detection runs **before** the app is returned — `createApp` is async by
  design.

## EventEmitter semantics (tests pin these)

- Listeners per type in a `Set` → duplicate registration is a no-op.
- `emit` iterates over a **copy** of the set: adding/removing listeners from
  inside a listener affects only future emissions; nested `emit` works.
- `once` wraps with self-removal (can't be manually removed; removal happens on
  first emission).
- `dispose` emits automatically when the emitter is `using`-scoped out (or via
  `Symbol.for('Symbol.dispose')` polyfill for browsers lacking the symbol).
- `off` of a non-registered listener is a no-op.