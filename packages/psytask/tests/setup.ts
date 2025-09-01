import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { beforeEach } from 'bun:test';

if (!process.argv[1]?.includes('e2e')) {
  // inject happy-dom
  GlobalRegistrator.register();

  beforeEach(() => {
    // Setup basic HTML structure
    document.documentElement.innerHTML = `
    <html>
      <head>
        <style>
          body { --psytask: 0; }
        </style>
      </head>
      <body></body>
    </html>
  `;

    // Mock global methods to reduce noise
    globalThis.alert = () => {};
    globalThis.console.warn = () => {};
    globalThis.console.info = () => {};
  });
}
