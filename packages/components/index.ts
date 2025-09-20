import type { SceneSetup } from '@psytask/core';
import { modify } from 'shared/utils';
import { reactive } from 'vanjs-ext';

/**
 * Adapter to use {@link https://github.com/vanjs-org/van VanJS} to create scene
 *
 * @example Write custom vanjs scene
 *
 * ```ts
 * import { adapter } from '@psytask/components';
 * import van from 'vanjs-core';
 *
 * const { div } = van.tags;
 * const vanjsStim = adapter((props: { text: string }) => ({
 *   // node content will auto update when props.text changes
 *   node: div(() => props.text),
 * }));
 * ```
 */
export const adapter =
  <T extends SceneSetup>(setup: T): T =>
  //@ts-ignore
  (props, ctx) => {
    const rprops = reactive(props);
    ctx.on('scene:show', (props) => modify(rprops, props));
    return setup(rprops, ctx);
  };

export * from './base';
export * from './hooks';
export * from './visual';
