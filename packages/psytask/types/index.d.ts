declare global {
  const process: { env: { NODE_ENV: 'development' | 'production' } };
}

export type LooseObject = { [key: string]: any };
export type Primitive = string | number | boolean | null | undefined;
export type Serializable = { [key: string]: Primitive };
