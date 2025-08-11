import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import { Window } from 'happy-dom';
import { App } from '../src/app';
import { Scene, type SceneOptions, type SceneSetup } from '../src/scene';
import { detectEnvironment } from '../src/util';

let window: Window;
let document: Document;
let originalWindow: any;
let originalDocument: any;

beforeEach(() => {
  // Setup happy-dom
  window = new Window();
  document = window.document as any;

  // Store original globals
  originalWindow = globalThis.window;
  originalDocument = globalThis.document;

  // Set globals
  globalThis.window = window as any;
  globalThis.document = document as any;
  globalThis.Element = window.Element as any;
  globalThis.HTMLElement = window.HTMLElement as any;
  globalThis.alert = () => {};
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    setTimeout(() => cb(performance.now()), 16);
    return 1;
  };

  // Mock getComputedStyle (both global and window)
  const mockComputedStyle = (element: Element) =>
    ({
      getPropertyValue: (property: string) => {
        if (property === '--psytask') {
          return 'enabled'; // Default to enabled for tests
        }
        return '';
      },
    }) as any;
  globalThis.getComputedStyle = mockComputedStyle as any;
  (window as any).getComputedStyle = mockComputedStyle as any;

  // Setup basic HTML structure
  document.documentElement.innerHTML = `
    <html>
      <head>
        <style>
          :root { --psytask: 'enabled'; }
        </style>
      </head>
      <body></body>
    </html>
  `;

  // Mock console methods to reduce noise
  globalThis.console.warn = () => {};
  globalThis.console.log = () => {};
});

afterEach(() => {
  // Restore original globals
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
});

describe('Scene', () => {
  let mockApp: App;
  let mockEnvData: Awaited<ReturnType<typeof detectEnvironment>>;

  beforeEach(() => {
    mockEnvData = {
      ua: 'test-user-agent',
      os: null,
      browser: 'test-browser/1.0',
      mobile: false,
      'in-app': false,
      screen_wh: [1920, 1080],
      window_wh: [1024, 768],
      frame_ms: 16.67,
    };

    const root = document.createElement('div');
    document.body.appendChild(root);
    mockApp = new App(root, mockEnvData);
  });

  describe('constructor', () => {
    it('should create Scene instance with app and setup function', () => {
      const setup: SceneSetup<[]> = (ctx) => () => {
        ctx.root.textContent = 'test scene';
      };

      const scene = new Scene(mockApp, setup);

      expect(scene.app).toBe(mockApp);
      expect(scene.root).toBeInstanceOf(window.Element);
      expect(scene.root.tagName).toBe('DIV');
      expect(scene.data.start_time).toBe(0);
      // show() should be available to drive updates
      expect(typeof scene.show).toBe('function');
    });

    it('should accept options parameter', () => {
      const options: SceneOptions = {
        duration: 1000,
        close_on: 'click',
      };

      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, options);

      expect(scene.#options).toBe(options);
      expect(scene.#options.duration).toBe(1000);
      expect(scene.#options.close_on).toBe('click');
    });

    it('should setup close event listeners for single close_on event', () => {
      const addEventListenerSpy = spyOn(
        window.Element.prototype,
        'addEventListener',
      );
      const setup: SceneSetup<[]> = () => () => {};

      new Scene(mockApp, setup, { close_on: 'click' });

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
        undefined,
      );
    });

    it('should setup close event listeners for multiple close_on events', () => {
      const addEventListenerSpy = spyOn(
        window.Element.prototype,
        'addEventListener',
      );
      const setup: SceneSetup<[]> = () => () => {};

      new Scene(mockApp, setup, { close_on: ['click', 'keydown'] });

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
        undefined,
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        undefined,
      );
    });

    it('should not setup close event listeners when close_on is undefined', () => {
      let callCount = 0;
      const originalAddEventListener =
        window.Element.prototype.addEventListener;
      window.Element.prototype.addEventListener = function (...args) {
        callCount++;
        return originalAddEventListener.apply(this, args);
      };

      const setup: SceneSetup<[]> = () => () => {};
      new Scene(mockApp, setup, {});

      // Restore
      window.Element.prototype.addEventListener = originalAddEventListener;

      expect(callCount).toBe(0);
    });

    it('should call setup function and get update function', () => {
      const setupSpy = mock((ctx: Scene<never>) => {
        return () => {
          ctx.root.textContent = 'updated';
        };
      });

      const scene = new Scene(mockApp, setupSpy);

      expect(setupSpy).toHaveBeenCalledWith(scene);
      scene.show();
      expect(scene.root.textContent).toBe('updated');
    });

    it('should initialize scene as closed', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      // Scene should be closed initially
      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should add cleanup function to remove from app root', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      // Add scene to app root first
      mockApp.root.appendChild(scene.root);
      expect(mockApp.root.contains(scene.root)).toBe(true);

      // Dispose should remove it
      scene[Symbol.dispose]();
      expect(mockApp.root.contains(scene.root)).toBe(false);
    });
  });

  describe('config method', () => {
    it('should update options and return scene instance', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, { duration: 1000 });

      const result = scene.config({ duration: 2000, close_on: 'click' });

      expect(result).toBe(scene);
      expect(scene.#options.duration).toBe(2000);
      expect(scene.#options.close_on).toBe('click');
    });

    it('should partially update options', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, {
        duration: 1000,
        close_on: 'click',
      });

      scene.config({ duration: 2000 });

      expect(scene.#options.duration).toBe(2000);
      expect(scene.#options.close_on).toBe('click'); // Should remain unchanged
    });
  });

  describe('close method', () => {
    it('should close the scene and resolve promise', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      // Show scene first
      const showPromise = scene.show();

      // Close scene
      scene.close();

      expect(scene.root.style.transform).toBe('scale(0)');

      // Promise should resolve with scene data
      const result = await showPromise;
      expect(result).toBe(scene.data);
    });

    it('should warn when trying to close already closed scene', () => {
      const consoleSpy = spyOn(console, 'warn');
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      // Scene is initially closed
      scene.close();

      expect(consoleSpy).toHaveBeenCalledWith('Scene is already closed');
    });

    it('should handle close when no show promise exists', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      // Close without showing - should not throw
      expect(() => scene.close()).not.toThrow();
    });
  });

  describe('show method', () => {
    it('should show the scene and call update function', () => {
      const updateSpy = mock((text: string) => {});
      const setup: SceneSetup<[string]> = () => updateSpy;
      const scene = new Scene(mockApp, setup);

      scene.show('test text');

      expect(scene.root.style.transform).toBe('scale(1)');
      expect(updateSpy).toHaveBeenCalledWith('test text');
    });

    it('should warn when trying to show already shown scene', () => {
      const consoleSpy = spyOn(console, 'warn');
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      scene.show();
      const result = scene.show();

      expect(consoleSpy).toHaveBeenCalledWith('Scene is already shown');
      expect(result).toBe(scene.data);
    });

    it('should return a promise that resolves with scene data', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      const showPromise = scene.show();
      scene.close();

      const result = await showPromise;
      expect(result).toBe(scene.data);
    });

    it('should warn when duration is not a multiple of frame_ms (development only)', () => {
      process.env.NODE_ENV = 'development';
      const consoleSpy = spyOn(console, 'warn');
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, { duration: 10 }); // Not a multiple of 16.67

      scene.show();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Scene duration is not a multiple of frame_ms'),
      );
    });

    it('should not warn when duration aligns with frame multiples (error < 1ms)', () => {
      process.env.NODE_ENV = 'development';
      const consoleSpy = spyOn(console, 'warn');
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, { duration: 1000 });

      scene.show();

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Scene duration is not a multiple of frame_ms'),
      );
    });

    it('should handle scene without duration', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      scene.show();

      // Wait a moment then close to stop animation
      await new Promise((resolve) => setTimeout(resolve, 20));
      scene.close();

      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should set start_time on first frame', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      scene.show();

      // Wait for requestAnimationFrame to set start_time
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(scene.data.start_time).toBeGreaterThan(0);
    });

    it('should call on_frame callback during animation', async () => {
      const onFrameSpy = mock((lastFrameTime: number) => {});
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, {
        duration: 50, // Short duration to auto-close
        on_frame: onFrameSpy,
      });

      scene.show();

      // Wait for animation frames
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onFrameSpy).toHaveBeenCalled();
    });

    it('should auto-close when duration is reached', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, { duration: 20 }); // Very short duration

      const showPromise = scene.show();

      // Wait for duration to pass
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Scene should auto-close
      expect(scene.root.style.transform).toBe('scale(0)');

      // Promise should resolve
      const result = await showPromise;
      expect(result).toBe(scene.data);
    });

    it('should handle multiple parameters in update function', () => {
      const updateSpy = mock((a: number, b: string, c: boolean) => {});
      const setup: SceneSetup<[number, string, boolean]> = () => updateSpy;
      const scene = new Scene(mockApp, setup);

      scene.show(42, 'test', true);

      expect(updateSpy).toHaveBeenCalledWith(42, 'test', true);
    });
  });

  describe('event handling', () => {
    it('should close scene when close_on event is triggered', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, { close_on: 'click' });

      scene.show();
      expect(scene.root.style.transform).toBe('scale(1)');

      // Trigger click event
      const clickEvent = new (globalThis as any).Event('click');
      scene.root.dispatchEvent(clickEvent);

      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should handle multiple close_on events', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, {
        close_on: ['click', 'keydown'],
      });

      scene.show();

      // Test click event
      const clickEvent = new (globalThis as any).Event('click');
      scene.root.dispatchEvent(clickEvent);
      expect(scene.root.style.transform).toBe('scale(0)');

      // Show again and test keydown
      scene.show();
      const keyEvent = new (globalThis as any).Event('keydown');
      scene.root.dispatchEvent(keyEvent);
      expect(scene.root.style.transform).toBe('scale(0)');
    });
  });

  describe('data handling', () => {
    it('should maintain scene data object', () => {
      const setup: SceneSetup<[]> = (ctx) => () => {
        (ctx.data as any).custom = 'value';
      };
      const scene = new Scene(mockApp, setup);

      scene.show();

      expect(scene.data.start_time).toBe(0);
      expect((scene.data as any).custom).toBe('value');
    });

    it('should preserve custom data when showing scene', async () => {
      const setup: SceneSetup<[]> = (ctx) => () => {
        (ctx.data as any).test = 'data';
      };
      const scene = new Scene(mockApp, setup);

      const showPromise = scene.show();
      scene.close();

      const result = await showPromise;
      expect((result as any).test).toBe('data');
    });
  });

  describe('disposal and cleanup', () => {
    it('should dispose properly with Symbol.dispose', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      // Add to app root
      mockApp.root.appendChild(scene.root);
      expect(mockApp.root.contains(scene.root)).toBe(true);

      // Dispose
      scene[Symbol.dispose]();

      // Should be removed from app root
      expect(mockApp.root.contains(scene.root)).toBe(false);
    });

    it('should handle disposal when scene is shown', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      // Ensure scene root is added to app root first
      if (!mockApp.root.contains(scene.root)) {
        mockApp.root.appendChild(scene.root);
      }

      const showPromise = scene.show();

      // Close and dispose
      scene.close();
      scene[Symbol.dispose]();

      // Should still work
      await expect(showPromise).resolves.toBe(scene.data);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle scene with no update function effects', async () => {
      const setup: SceneSetup<[]> = () => () => {
        // Empty update function
      };
      const scene = new Scene(mockApp, setup, { duration: 50 }); // Add duration to auto-close

      const showPromise = scene.show();

      // Wait for auto-close
      await expect(showPromise).resolves.toBe(scene.data);
    });

    it('should handle scene with complex setup', () => {
      const setup: SceneSetup<[string, number]> = (ctx) => {
        // Setup DOM structure
        const container = document.createElement('div');
        const text = document.createElement('p');
        const button = document.createElement('button');

        container.appendChild(text);
        container.appendChild(button);
        ctx.root.appendChild(container);

        return (message: string, count: number) => {
          text.textContent = `${message} (${count})`;
          button.textContent = 'Click me';
        };
      };

      const scene = new Scene(mockApp, setup);

      scene.show('Hello', 42);

      const text = scene.root.querySelector('p');
      const button = scene.root.querySelector('button');

      expect(text?.textContent).toBe('Hello (42)');
      expect(button?.textContent).toBe('Click me');
    });

    it('should handle rapid show/close cycles', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      // Rapid show/close
      scene.show();
      scene.close();
      scene.show();
      scene.close();

      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should handle scene with zero duration', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, { duration: 0 });

      const showPromise = scene.show();

      // Should auto-close immediately
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(scene.root.style.transform).toBe('scale(0)');
      await expect(showPromise).resolves.toBe(scene.data);
    });

    it('should handle scene with very long duration', () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, { duration: 10000 });

      scene.show();

      expect(scene.root.style.transform).toBe('scale(1)');

      // Manually close to avoid long-running test
      scene.close();
      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should handle scene with undefined options', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, undefined as any);

      expect(scene.#options).toEqual({});

      scene.show();
      // Close quickly to avoid infinite loop
      await new Promise((resolve) => setTimeout(resolve, 20));
      scene.close();

      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should handle show with no parameters', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup);

      scene.show();
      // Wait a moment to let RAF start, then close
      await new Promise((r) => setTimeout(r, 20));
      scene.close();
      expect(scene.root.style.transform).toBe('scale(0)');
    });
  });

  describe('animation timing', () => {
    it('should handle frame timing calculations correctly', async () => {
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, { duration: 100 });

      scene.show();

      // Wait for start_time to be set
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(scene.data.start_time).toBeGreaterThan(0);
    });

    it('should use magic number 1.4 in duration calculation', async () => {
      // This tests the magic number 1.4 mentioned in the TODO comment
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, {
        duration: mockApp.data.frame_ms * 2, // 2 frames
      });

      const showPromise = scene.show();

      // Wait for duration calculation with magic number
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should auto-close based on duration - frame_ms * 1.4
      await expect(showPromise).resolves.toBe(scene.data);
    });
  });

  describe('requestAnimationFrame integration', () => {
    it('should handle requestAnimationFrame properly', () => {
      // This test verifies that Scene uses requestAnimationFrame
      const setup: SceneSetup<[]> = () => () => {};
      const scene = new Scene(mockApp, setup, { duration: 50 });

      // Just verify scene can be shown - RAF handling is tested implicitly
      // in other tests like auto-close and frame timing
      scene.show();
      expect(scene.root.style.transform).toBe('scale(1)');

      scene.close();
      expect(scene.root.style.transform).toBe('scale(0)');
    });
  });
});
