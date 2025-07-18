declare var global: typeof globalThis & {
  /** Indicates if the environment is production */
  readonly $prod?: true;
};
