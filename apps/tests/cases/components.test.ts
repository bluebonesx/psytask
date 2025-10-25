import { Loader, VirtualChinrest } from '@psytask/components';
import { createApp, generic, type SceneSetup } from 'psytask';
import { expect } from './utils';

// utils
export const Adapter = {};
export const Hooks = {};

// components
const expect_Loader_dataSizes = (
  {
    blobs,
    error,
  }: typeof Loader extends SceneSetup<infer P, infer D> ? D : never,
  sizes: number[],
) => {
  if (error) throw error;
  expect(error, null);
  expect(blobs.length, sizes.length);
  for (let i = 0; i < sizes.length; i++) {
    expect(blobs[i] instanceof Blob);
    expect(blobs[i]!.size, sizes[i]);
  }
};
export const _Loader = {
  async 'immediately close'() {
    using app = await createApp();
    using loader = app
      .scene(generic(Loader), { defaultProps: { urls: ['/bytes/1'] } })
      .on('scene:show', () => loader.close());
    expect_Loader_dataSizes(await loader.show(), []);
  },
  async 'empty urls'() {
    using app = await createApp();
    {
      using loader = app.scene(generic(Loader), { defaultProps: { urls: [] } });
      expect_Loader_dataSizes(await loader.show(), []);
    }
    {
      using loader = app.scene(generic(Loader), {
        defaultProps: { urls: ['/bytes/1'] },
      });
      expect_Loader_dataSizes(await loader.show({ urls: [] }), []);
    }
  },
  async 'multi loads'() {
    using app = await createApp();
    using loader = app.scene(generic(Loader), {
      defaultProps: { urls: ['/bytes/1'] },
    });
    expect_Loader_dataSizes(await loader.show(), [1]);
    expect_Loader_dataSizes(await loader.show(), [1]);
    expect_Loader_dataSizes(await loader.show(), [1]);
  },
  async 'change urls'() {
    using app = await createApp();
    using loader = app.scene(generic(Loader), { defaultProps: { urls: [] } });
    expect_Loader_dataSizes(await loader.show({ urls: ['/bytes/1'] }), [1]);
    expect_Loader_dataSizes(await loader.show(), []);
    expect_Loader_dataSizes(
      await loader.show({ urls: ['/bytes/2', '/bytes/3'] }),
      [2, 3],
    );
    expect_Loader_dataSizes(await loader.show(), []);
  },
  async 'with progress'() {
    using app = await createApp();
    using loader = app.scene(generic(Loader), {
      defaultProps: { urls: ['/bytes/100', '/bytes/50'] },
    });

    let hasProgress = false;
    new MutationObserver((mutations, ob) => {
      for (const m of mutations)
        m.addedNodes.forEach(
          (n) =>
            n.nodeName === '#text' &&
            n.textContent?.includes('%') &&
            ((hasProgress = true), ob.disconnect()),
        );
    }).observe(loader.root, { childList: true, subtree: true });
    expect_Loader_dataSizes(await loader.show(), [100, 50]);
    expect(hasProgress);
  },
  async 'with error'() {
    using app = await createApp();
    using loader = app.scene(generic(Loader), {
      defaultProps: {
        urls: ['/status/404', '/bytes/1', '/bytes/2', '/bytes/3'],
      },
    });
    const { blobs, error } = await loader.show();
    expect(blobs, null);
    expect(error instanceof Error);
    expect(error!.message.includes('404'));
  },
};
export const _VirtualChinrest = {
  async usePreviousData() {
    using app = await createApp();
    using vc = app.scene(VirtualChinrest, { defaultProps: {} });

    let p: Promise<any>;
    const confirmationEl = vc.root.querySelector('pre')!;
    const detectorEl = vc.root.querySelector('form')!;

    // localStorage has data
    localStorage.setItem(
      VirtualChinrest.storageKey,
      JSON.stringify({ screen_width_cm: 40, distance_cm: 57 }),
    );
    {
      // value is true
      p = vc.show({ usePreviousData: true });
      expect(confirmationEl.checkVisibility(), false);
      expect(detectorEl.checkVisibility(), false);
      await p;
    }
    {
      // value is false
      p = vc.show({ usePreviousData: false });
      expect(confirmationEl.checkVisibility(), false);
      expect(detectorEl.checkVisibility(), true);
      await p;
    }
    {
      // value is undefined
      p = vc.show();
      expect(confirmationEl.checkVisibility(), true);
      expect(detectorEl.checkVisibility(), false);
      await p;
    }

    // localStorage has no data
    localStorage.removeItem(VirtualChinrest.storageKey);
    {
      // value is true
      p = vc.show({ usePreviousData: true });
      expect(confirmationEl.checkVisibility(), false);
      expect(detectorEl.checkVisibility(), true);
      await p;
    }
    {
      // value is false
      p = vc.show({ usePreviousData: false });
      expect(confirmationEl.checkVisibility(), false);
      expect(detectorEl.checkVisibility(), true);
      await p;
    }
    {
      // value is undefined
      p = vc.show();
      expect(confirmationEl.checkVisibility(), false);
      expect(detectorEl.checkVisibility(), true);
      await p;
    }
  },
  async i18n() {},
  async blindspotDegree() {},
  async data() {},
};
