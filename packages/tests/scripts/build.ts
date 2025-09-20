import { buildApp } from 'shared/scripts';

buildApp(
  [
    {
      entrypoints: Array.from(new Bun.Glob('./cases/*.test.ts').scanSync()),
      minify: false,
    },
  ],
  {
    importmap: {
      chai: 'https://cdn.jsdelivr.net/npm/chai@5.2.2/+esm',
      'vanjs-ext': 'https://cdn.jsdelivr.net/npm/vanjs-ext@0.6.3?bundle',
      psytask: '/public/psytask/index.min.js',
      '@psytask/core': '/public/core/index.min.js',
      '@psytask/components': '/public/components/index.min.js',
      '@psytask/jspsych': '/public/jspsych/index.min.js',
    },
    styles: ['/public/components/main.css'],
  },
);
