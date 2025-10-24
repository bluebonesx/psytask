import { glob } from 'shared/macros' with { type: 'macro' };
import { ERR, mount } from 'shared/utils';
import van from 'vanjs-core';
const { div } = van.tags;

const env = await (async () => {
  const ua = navigator.userAgent;
  const { detect } = await import(
    //@ts-ignore
    'https://cdn.jsdelivr.net/npm/detect-browser/es/index.min.js'
  );
  const browser = detect(ua);
  if (!browser) ERR('Cannot detect browser environment');
  return {
    ua,
    os: browser.os,
    browser: browser.name + '/' + browser.version,
    mobile: /Mobi/i.test(ua),
    'in-app': /wv|in-app/i.test(ua), // webview or in-app browser
    screen_wh_pix: [window.screen.width, window.screen.height] as [
      width: number,
      height: number,
    ],
    window_wh_pix: (function () {
      const wh: [width: number, height: number] = [
        window.innerWidth,
        window.innerHeight,
      ];
      window.addEventListener('resize', () => {
        wh[0] = window.innerWidth;
        wh[1] = window.innerHeight;
      });
      return wh;
    })(),
  } as const;
})();
const libs = glob('*', { cwd: 'cases' });

mount(div('Stay tuned... >^<'));
