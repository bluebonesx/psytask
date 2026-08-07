# Glossary

Precise meanings of PsyTask terms as used in this codebase (code > README).

| Term | Meaning |
| --- | --- |
| **Scene** | A "slide" of an experiment: one root `<div>` + one Component instance + a Timer. Created once (`app.scene`), shown repeatedly (`show()`), auto-disposed (`using`). Emits `show`, `frame`, `close`, `dispose`. |
| **Component** | A plain function `(props) => Node \| Node[] \| { node, data() }`. Called **once**; per-show updates happen via props reactivity or `getCurrentScene()` hooks. |
| **Props** (`P`, `defaultProps`, `patchProps`) | The input controlling a scene's display. `defaultProps` set at creation; each `show(patchProps)` starts from `{...defaultProps, ...patchProps}` and assigns onto the reactive props object. |
| **Data Getter** (`data()`) | Component-supplied function returning the per-show trial data object. Merged with built-ins `frame_times`/`duration`; those two keys are reserved (`ForbiddenData`). |
| **Timer / TimerRecords** | rAF/VSync-time recorder created per scene by `options.timer()` factory. `start()` resolves with `records` — *frame start timestamps*. The stopping frame is excluded; consecutive shows never overlap frames. |
| **frame_ms** | App-measured average frame gap (IQR-filtered) at startup; used for the half-frame duration tolerance. |
| **duration** (reserved key) | Real elapsed show time: `currentFrameTime - records[0]`. |
| **frame_times** (reserved key) | `TimerRecords` array returned with every `show()`. |
| **ComponentAdapter** | Object `{ mark, render }` gluing a reactivity system to Props. `mark` stamps a reactive fn on the component (idempotent, per-component, cross-adapter-safe); `render` calls the component once and normalizes output to `{ props, nodes, data }`. |
| **sceneStack / getCurrentScene** | Module-level stack of scenes pushed around the single component render call; `getCurrentScene()` returns the current scene **only synchronously at top scope of the component body**. |
| **show** event | Emitted when props have been updated, immediately before the root is displayed. |
| **frame** event | Emitted with the frame time for each recorded VSync frame while shown. |
| **close** event | Emitted after the timer stops and the root is hidden (data getter is merged after this event). |
| **dispose** event | Emitted by `Symbol.dispose` (`using` scope exit) or manually; cleanup (DOM removal, listeners) happens here. |
| **close_on** | App-scene option: DOM event name(s) that close the scene; supports `key:<key>`, `mouse:left\|middle\|right\|unknown`, or any DOM event type. |
| **config()** | One-shot option overrides (`duration`, `close_on`); resolved options are copied back into the user opts on close, so behavior resets each show unless re-configured. |
| **Collector** | Streaming data serializer (`.csv`/`.json` or custom) + row storage; emits `add`/`chunk`; auto-stamps `app.data` into rows at add-time; `final()`/`download()`/backup-on-leave. |
| **Serializer** | `{ header(row), body(row), footer(rows) }` producing the cumulative text; chosen by filename extension; extensible via `Collector.serializers`. |
| **app.data** | Shared per-participant data (starts as `{ frame_ms, leave_count }`); merged into every collector row when added. |
| **createApp** | Async app bootstrap: FPS detection (overlay + leave-guard), `beforeunload` alert, App construction. |
| **RandomSampling** | Buildable iterable: sample candidates with/without replacement; never mutates input; `.response` unavailable (yield type `never`). |
| **StairCase** | Buildable iterable: 1-down-1-up until first reversal, then `down`-consecutive-correct → decrease and `up`-consecutive-incorrect → increase, clamped; `.response(boolean)` required; `data` = `{value, response, reversal}[]`. |
| **createIterableBuilder** | Generates the `.response()`/`.data` single-pass iterable facade over a generator. |
| **generic()** | Runtime identity / type-level constructor to keep full inference for generic components (e.g. `Loader`). |
| **VanJS / vanjs-core / vanjs-ext** | The default reactivity engine (used by `@psytask/components`): `van.state`, `van.derive`, `van.tags`; ext: `reactive`, `noreactive`, `calc`, `list`, `replace`. |
| **adapter** (`@psytask/components`) | The standard VanJS adapter: shallow-reactive props Proxy; lazy tracking of missing keys; nested objects become `noreactive`. |
| **jsPsychStim** | `@psytask/jspsych` component running jsPsych v8 class plugins against a mocked jsPsych runtime (`finishTrial`, `pluginAPI.{KeyboardListenerAPI,TimeoutAPI}`); everything else warns. |
| **VirtualChinrest / detectors** | Zoom-proof calibration UIs: `PhysicalWidthDetector` (credit-card width → pix/cm), `ViewDistanceDetector` (blindspot method → viewing distance), `VirtualChinrest` (composes both, persists `pix_per_cm`+`distance_cm` in localStorage key `psytask:virtual-chinrest`, returns `deg2cm/deg2pix/deg2csspix` converters). |
| **css() macro** | Build-time (Rollup) transformation of static `css({...})` into CSS strings; runtime twin exists in dev. |
| **`using` / Disposable** | TC39 explicit resource management: scope-end disposes App/Scene/Collector/emitters (emits `dispose`). Old browsers need manual fallback. |
| **importmap** | Per-app `build.config.ts` mapping of module specifiers to CDN/built URLs; used by generated `index.html` and the playground editor. |

Note: the exported `css` helper name collides conceptually with the global
`css()` used in `app.ts` — in production the import resolves to whatever the
macro inlined; in dev it's the runtime stringifier. Keep both in sync.