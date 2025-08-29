import type { Primitive } from '../../types';
import { effect, type Reactive } from '../reactive';
import type { Scene, SceneSetup } from '../scene';
import { h, on } from '../util';

type BaseFieldProps<T extends Primitive = string> = {
  id: string;
  /** @default this.id */
  label?: string | HTMLElement;
  /** @default true */
  required?: boolean;
  defaultValue?: T;
  validate?(value: T): true | string;
  setup?(root: HTMLDivElement): void;
};
const init = <T extends Primitive>(
  inputEl: Extract<
    HTMLElementTagNameMap[keyof HTMLElementTagNameMap],
    { name: string; required: boolean }
  >,
  props: BaseFieldProps<T> & { type?: never },
  getValue: () => T,
) => {
  inputEl.style.width = '100%';
  effect(() => (inputEl.id = props.id));
  effect(() => (inputEl.name = props.id));
  effect(() => (inputEl.required = props.required ?? true));
  let cleanup: () => void;
  effect(() => {
    cleanup?.();
    if (props.validate) {
      const validate = () => {
        const result = props.validate!(getValue());
        inputEl.setCustomValidity(result === true ? '' : result);
      };
      validate();
      cleanup = on(inputEl, 'change', validate);
    }
  });

  const labelEl = h('label');
  effect(() => (labelEl.htmlFor = props.id));
  effect(() => {
    const { label } = props;
    labelEl.replaceChildren(
      label instanceof HTMLElement
        ? label
        : (label ?? props.id + ((props.required ?? true) ? '*' : '')),
    );
  });

  const root = h('div', {}, [labelEl, ' ', inputEl]);
  effect(() => props.setup?.(root));
  return {
    node: root,
    data: () => ({ value: getValue() }),
  } satisfies ReturnType<SceneSetup>;
};

// field
export const TextField = function (
  props: Reactive<
    BaseFieldProps & { inputType?: 'text' | 'email' | 'password' | 'URL' }
  >,
) {
  const el = h('input');
  effect(() => (el.type = props.inputType ?? 'text'));
  effect(() => (el.value = props.defaultValue ?? ''));
  return init(el, props, () => el.value);
} satisfies SceneSetup;

export const NumberField = function (
  props: Reactive<
    BaseFieldProps<number> & { min?: number; max?: number; step?: number }
  >,
) {
  const el = h('input', { type: 'number' });
  effect(() => (el.value = props.defaultValue?.toString() ?? ''));
  effect(() => (el.min = props.min?.toString() ?? '0'));
  effect(() => (el.max = props.max?.toString() ?? ''));
  effect(() => (el.step = props.step?.toString() ?? ''));
  return init(el, props, () => +el.value);
} satisfies SceneSetup;

export const TextArea = function (props: Reactive<BaseFieldProps>) {
  const el = h('textarea', { style: { resize: 'vertical' } });
  effect(() => (el.value = props.defaultValue ?? ''));
  return init(el, props, () => el.value);
} satisfies SceneSetup;

type SelectOption<T extends string> = { value: T; label: string };
export const Select = function <T extends string>(
  props: Reactive<
    BaseFieldProps & { defaultValue?: T; options: SelectOption<T>[] }
  >,
) {
  const el = h('select');
  effect(() => (el.value = props.defaultValue ?? ''));
  effect(() => {
    el.replaceChildren(
      ...props.options.map((opt) =>
        h(
          'option',
          { value: opt.value, selected: opt.value === props.defaultValue },
          opt.label,
        ),
      ),
    );
  });
  return init(el, props, () => el.value);
} satisfies SceneSetup;

export const Checkbox = function (props: Reactive<BaseFieldProps<boolean>>) {
  const el = h('input', {
    type: 'checkbox',
    style: { 'margin-right': '0.5rem', width: 'auto' },
  });
  effect(() => (el.checked = !!props.defaultValue));
  return init(el, props, () => el.checked);
} satisfies SceneSetup;

export const Radio = function (props: Reactive<BaseFieldProps<boolean>>) {
  const el = h('input', { type: 'radio' });
  effect(() => (el.checked = !!props.defaultValue));
  return init(el, props, () => el.checked);
} satisfies SceneSetup;

// form
const fieldMap = { TextField, NumberField, TextArea, Select, Checkbox, Radio };
type FieldRecord = {
  [K in keyof typeof fieldMap]: (typeof fieldMap)[K] extends SceneSetup<infer P>
    ? Omit<P, 'id'> & { type: K }
    : never;
}[keyof typeof fieldMap];
export const Form = function <T extends Record<string, FieldRecord>>(
  props: Reactive<{
    fields?: T;
    title?: string;
    subtitle?: string;
    submitLabel?: string;
  }>,
  ctx: Scene<never>,
) {
  const titleEl = h('h2', { style: { 'margin-bottom': '0.5rem' } });
  effect(() => (titleEl.textContent = props.title ?? ''));

  const subtitleEl = h('p');
  effect(() => (subtitleEl.textContent = props.subtitle ?? ''));

  const submitButton = h('button', {
    type: 'button',
    style: { width: '100%', 'margin-top': '1rem' },
    onclick() {
      formEl.checkValidity() ? ctx.close() : formEl.reportValidity();
    },
  });
  effect(() => (submitButton.textContent = props.submitLabel ?? 'OK'));

  const fieldContainer = h('div', {
    style: {
      display: 'grid',
      gap: '0.5rem',
      'grid-template-columns': 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))',
    },
  });
  const formEl = h(
    'form',
    {
      style: { margin: '2rem', 'min-width': '60%' },
      onsubmit: (e: Event) => e.preventDefault(),
    },
    [titleEl, subtitleEl, fieldContainer, submitButton],
  );

  let fields: (ReturnType<(typeof fieldMap)[keyof typeof fieldMap]> & {
    id: string;
  })[];
  ctx.on('scene:show', () => (fields = []));
  effect(() => {
    if (!props.fields) return;
    fields = Object.entries(props.fields).reduce(
      (acc, [id, { type, ...p }]) => {
        const Comp = fieldMap[type];
        if (!Comp) throw new Error(`Unknown field type: ${type}`);
        //@ts-ignore
        acc.push({ id, ...Comp({ id, ...p }) });
        return acc;
      },
      [],
    );
    fieldContainer.replaceChildren(...fields.map((f) => f.node));
  });

  // if (process.env.NODE_ENV === 'development') {
  //   ctx.on('scene:show', () => ctx.close());
  // }
  return {
    node: h(
      'div',
      {
        className: 'psytask-center',
        style: { 'white-space': 'pre-line', 'line-height': 1.5 },
      },
      formEl,
    ),
    data() {
      const data = fields.reduce(
        (acc, { id, data }) => ({ ...acc, [id]: data().value }),
        {} as {
          [K in keyof T]: (typeof fieldMap)[T[K]['type']] extends SceneSetup<
            infer P,
            infer D
          >
            ? D['value']
            : never;
        },
      );
      console.info('Form', data);
      return data;
    },
  };
} satisfies SceneSetup;
