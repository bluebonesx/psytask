export default {
  tasks: [
    { entrypoints: Array.from(new Bun.Glob('cases/*/*.bench.ts').scanSync()) },
  ],
};
