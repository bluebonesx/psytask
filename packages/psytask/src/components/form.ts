import type { Primitive } from '../../types';
import { effect } from '../reactive';
import type { Component, Scene } from '../scene';
import { h, on } from '../util';

/**
 * Base properties for all form field components
 *
 * @template T - The type of value this field handles
 */
export type BaseFieldProps<T extends Primitive = string> = {
  /** Unique identifier for the form field */
  id: string;
  /** Label text or HTML element to display. @default id */
  label?: string | HTMLElement;
  /** Whether the field is required for form submission. @default true */
  required?: boolean;
  /** Initial value for the field */
  defaultValue?: T;
  /** Custom validator that returns true if valid, or error message if invalid */
  validate?(value: T): true | string;
  /** Modify the field's root element */
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
  } satisfies ReturnType<Component>;
};

/**
 * Text input field component for capturing string values
 *
 * @example
 *
 * ```ts
 * using emailField = app.scene(TextField, {
 *   defaultProps: {
 *     id: 'email',
 *     inputType: 'email',
 *     label: 'Email Address',
 *     validate: (value) =>
 *       /.+@.+\..+/.test(value) || 'Please enter a valid email',
 *   },
 * });
 * const data = await emailField.show();
 * console.log(data.value); // string
 * ```
 */
export const TextField = function (
  props: BaseFieldProps & {
    /** @see {@link HTMLInputElement.type} */
    inputType?: 'text' | 'email' | 'password' | 'URL';
  },
) {
  const el = h('input');
  effect(() => (el.type = props.inputType ?? 'text'));
  effect(() => (el.value = props.defaultValue ?? ''));
  return init(el, props, () => el.value);
} satisfies Component;

/**
 * Number input field component for capturing numeric values
 *
 * @example
 *
 * ```ts
 * using ageField = app.scene(NumberField, {
 *   defaultProps: {
 *     id: 'age',
 *     label: 'Age',
 *     min: 18,
 *     max: 100,
 *     defaultValue: 25,
 *     validate: (value) => value >= 18 || 'Must be at least 18 years old',
 *   },
 * });
 * const data = await ageField.show();
 * console.log(data.value); // number
 * ```
 */
export const NumberField = function (
  props: BaseFieldProps<number> & {
    /** Minimum allowed value */
    min?: number;
    /** Maximum allowed value */
    max?: number;
    /** Step increment for the number input */
    step?: number;
  },
) {
  const el = h('input', { type: 'number' });
  effect(() => (el.value = props.defaultValue?.toString() ?? ''));
  effect(() => (el.min = props.min?.toString() ?? '0'));
  effect(() => (el.max = props.max?.toString() ?? ''));
  effect(() => (el.step = props.step?.toString() ?? ''));
  return init(el, props, () => +el.value);
} satisfies Component;

/**
 * Multi-line text area component for capturing longer text content
 *
 * @example
 *
 * ```ts
 * using feedbackField = app.scene(TextArea, {
 *   defaultProps: {
 *     id: 'feedback',
 *     label: 'Feedback',
 *     defaultValue: 'Please share your thoughts...',
 *     validate: (value) =>
 *       value.length >= 10 || 'Please provide at least 10 characters',
 *   },
 * });
 * const data = await feedbackField.show();
 * console.log(data.value); // string
 * ```
 */
export const TextArea = function (props: BaseFieldProps) {
  const el = h('textarea', { style: { resize: 'vertical' } });
  effect(() => (el.value = props.defaultValue ?? ''));
  return init(el, props, () => el.value);
} satisfies Component;

/**
 * Option type for Select component
 *
 * @template T - The type of the option value
 */
type SelectOption<T extends string> = {
  /** The actual value that will be stored */
  value: T;
  /** The display text for this option */
  label: string;
};

/**
 * Dropdown select component for choosing from predefined options
 *
 * @example
 *
 * ```ts
 * using difficultyField = app.scene(generic(Select), {
 *   defaultProps: {
 *     id: 'difficulty',
 *     label: 'Difficulty Level',
 *     defaultValue: 'medium',
 *     options: [
 *       { value: 'easy', label: 'Easy' },
 *       { value: 'medium', label: 'Medium' },
 *       { value: 'hard', label: 'Hard' },
 *     ],
 *   },
 * });
 * const data = await difficultyField.show();
 * console.log(data.value); // 'easy' | 'medium' | 'hard'
 * ```
 */
export const Select = function <T extends string>(
  props: BaseFieldProps & {
    defaultValue?: T;
    /** Array of options to display in the dropdown */
    options: SelectOption<T>[];
  },
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
} satisfies Component;

/**
 * Checkbox component for boolean values
 *
 * @example
 *
 * ```ts
 * using consentField = app.scene(Checkbox, {
 *   defaultProps: {
 *     id: 'consent',
 *     label: 'I consent to participate in this study',
 *     validate: (value) => value || 'You must provide consent to continue',
 *   },
 * });
 * const data = await consentField.show();
 * console.log(data.value); // boolean
 * ```
 */
export const Checkbox = function (props: BaseFieldProps<boolean>) {
  const el = h('input', {
    type: 'checkbox',
    style: { 'margin-right': '0.5rem', width: 'auto' },
  });
  effect(() => (el.checked = !!props.defaultValue));
  return init(el, props, () => el.checked);
} satisfies Component;

/**
 * Radio button component for boolean selection (typically used in groups)
 *
 * @example
 *
 * ```ts
 * using yesOption = app.scene(Radio, {
 *   defaultProps: {
 *     id: 'response_yes',
 *     label: 'Yes',
 *     defaultValue: false,
 *   },
 * });
 * const data = await yesOption.show();
 * console.log(data.value); // boolean
 * ```
 *
 * @experimental
 */
export const Radio = function (props: BaseFieldProps<boolean>) {
  const el = h('input', { type: 'radio' });
  effect(() => (el.checked = !!props.defaultValue));
  return init(el, props, () => el.checked);
} satisfies Component;

// Internal form field mapping and types
const fieldMap = { TextField, NumberField, TextArea, Select, Checkbox, Radio };
type FieldRecord = {
  [K in keyof typeof fieldMap]: (typeof fieldMap)[K] extends Component<infer P>
    ? Omit<P, 'id'> & { type: K }
    : never;
}[keyof typeof fieldMap];

/**
 * Dynamic form component that creates a complete form with multiple fields
 *
 * @example
 *
 * ```ts
 * using form = app.scene(generic(Form), {
 *   defaultProps: {
 *     title: 'Participant Information',
 *     subtitle: 'Please fill out the following information',
 *   },
 * });
 *
 * const formData = await form.show({
 *   fields: {
 *     name: {
 *       type: 'TextField',
 *       label: 'Full Name',
 *       validate: (value) =>
 *         value.length >= 2 || 'Name must be at least 2 characters',
 *     },
 *     age: {
 *       type: 'NumberField',
 *       label: 'Age',
 *       min: 18,
 *       max: 100,
 *     },
 *     consent: {
 *       type: 'Checkbox',
 *       label: 'I consent to participate in this study',
 *     },
 *   },
 * });
 *
 * console.log(formData.name); // string
 * console.log(formData.age); // number
 * console.log(formData.consent); // boolean
 * ```
 *
 * @template T - Record type defining the form fields and their configurations
 * @see {@link TextField} , {@link NumberField}, {@link TextArea}, {@link Select}, {@link Checkbox}, {@link Radio}
 */
export const Form = function <T extends Record<string, FieldRecord>>(
  props: {
    /** Configuration object defining all form fields */
    fields?: T;
    /** Main title displayed at the top of the form */
    title?: string;
    /** Subtitle or description text below the title */
    subtitle?: string;
    /** Text for the submit button (defaults to 'OK') */
    submitLabel?: string;
  },
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
          [K in keyof T]: (typeof fieldMap)[T[K]['type']] extends Component<
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
} satisfies Component;
