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
import { App, createApp } from '../src/app';
import { Scene } from '../src/scene';
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

  // Mock getComputedStyle
  globalThis.getComputedStyle = (element: Element) =>
    ({
      getPropertyValue: (property: string) => {
        if (property === '--psytask') {
          return 'enabled'; // Default to enabled for tests
        }
        return '';
      },
    }) as CSSStyleDeclaration;

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

  // Mock console methods to avoid noise in tests
  globalThis.console.warn = () => {};
  globalThis.console.log = () => {};
});

afterEach(() => {
  // Restore original globals
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
});

describe('App', () => {
  let mockEnvData: Awaited<ReturnType<typeof detectEnvironment>>;

  beforeEach(() => {
    mockEnvData = {
      ua: 'test-user-agent',
      os: null, // Use null as valid type
      browser: 'test-browser/1.0',
      mobile: false,
      'in-app': false,
      screen_wh: [1920, 1080],
      window_wh: [1024, 768],
      frame_ms: 16.67,
    };
  });

  describe('constructor', () => {
    it('should create App instance with root element and data', () => {
      const root = document.createElement('div');
      const app = new App(root, mockEnvData);

      expect(app.root).toBe(root);
      expect(app.data).toBe(mockEnvData);
    });

    it('should throw error if psytask CSS is not loaded', () => {
      // Store original mock
      const originalMock = window.getComputedStyle;

      // Mock window.getComputedStyle to return empty value (CSS not loaded)
      window.getComputedStyle = () =>
        ({
          getPropertyValue: () => '', // Always return empty for CSS not loaded
        }) as any;

      const root = document.createElement('div');

      expect(() => new App(root, mockEnvData)).toThrow(
        'Please import psytask CSS file in your HTML file',
      );

      // Restore original mock
      window.getComputedStyle = originalMock;
    });

    it('should add beforeunload event listener', () => {
      const addEventListenerSpy = spyOn(window, 'addEventListener');
      const root = document.createElement('div');

      new App(root, mockEnvData);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
        undefined,
      );
    });

    it('should add visibilitychange event listener', () => {
      const addEventListenerSpy = spyOn(document, 'addEventListener');
      const root = document.createElement('div');

      new App(root, mockEnvData);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
        undefined,
      );
    });

    it('should show alert when page becomes hidden', () => {
      const alertSpy = spyOn(globalThis, 'alert');
      const root = document.createElement('div');
      const app = new App(root, mockEnvData);

      // Simulate page becoming hidden
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
      });

      // Trigger visibilitychange event
      const event = new (globalThis as any).Event('visibilitychange');
      document.dispatchEvent(event as any);

      expect(alertSpy).toHaveBeenCalledWith(
        'Please keep the page visible on the screen during the task running',
      );
    });
  });

  describe('scene method', () => {
    it('should create a new Scene and append to root', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const scene = app.scene((self) => {
        self.root.textContent = 'test scene';
        return () => {};
      });

      expect(scene).toBeInstanceOf(Scene);
      expect(scene.root.classList.contains('psytask-scene')).toBe(true);
      expect(root.children).toContain(scene.root);
      expect(scene.root.textContent).toBe('test scene');
    });

    it('should pass parameters to scene setup function', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const setupSpy = mock((self: Scene<never>) => () => {});
      const scene = app.scene(setupSpy, { duration: 1000 });

      expect(setupSpy).toHaveBeenCalledWith(scene);
    });
  });

  describe('text method', () => {
    it('should create a text scene with default styling', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const scene = app.text('Hello World');

      expect(scene).toBeInstanceOf(Scene);
      const paragraph = scene.root.querySelector('p');
      expect(paragraph?.textContent).toBe('Hello World');

      const container = scene.root.querySelector('div');
      expect(container?.style.textAlign).toBe('center');
      // Note: happy-dom doesn't always preserve CSS values exactly
      expect(container).toBeTruthy();
    });

    it('should accept options parameter', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const scene = app.text('Hello', { duration: 500 });

      expect(scene.options.duration).toBe(500);
    });

    it('should return update function that can modify text properties', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const scene = app.text('Hello');
      // Don't call show() as it will timeout, just test the update function

      const paragraph = scene.root.querySelector('p')!;

      scene.update({ text: 'Modified', size: '24px', color: 'red' });

      expect(paragraph.textContent).toBe('Modified');
      expect(paragraph.style.fontSize).toBe('24px');
      expect(paragraph.style.color).toBe('red');
    });
  });

  describe('fixation method', () => {
    it('should create a fixation scene with "+" character', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const scene = app.fixation();

      const paragraph = scene.root.querySelector('p');
      expect(paragraph?.textContent).toBe('+');
    });

    it('should accept options parameter', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const scene = app.fixation({ duration: 1000 });

      expect(scene.options.duration).toBe(1000);
    });
  });

  describe('blank method', () => {
    it('should create a blank scene with empty text', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const scene = app.blank();

      const paragraph = scene.root.querySelector('p');
      expect(paragraph?.textContent).toBe('');
    });

    it('should accept options parameter', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const scene = app.blank({ duration: 2000 });

      expect(scene.options.duration).toBe(2000);
    });
  });

  describe('disposal', () => {
    it('should dispose properly with Symbol.dispose', () => {
      const root = document.createElement('div');
      const app = new App(root, mockEnvData);

      // Create some scenes
      const scene1 = app.text('Scene 1');
      const scene2 = app.text('Scene 2');

      expect(root.children.length).toBe(2);

      // Dispose the app
      app[Symbol.dispose]();

      // Should clean up properly
      expect(() => app[Symbol.dispose]()).not.toThrow();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle beforeunload event', () => {
      const root = document.createElement('div');
      const app = new App(root, mockEnvData);

      // Create a beforeunload event
      const event = new (globalThis as any).Event('beforeunload');
      event.preventDefault = mock(() => {});

      // Trigger beforeunload
      window.dispatchEvent(event as any);

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should handle text update with partial properties', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      const scene = app.text('Hello');
      const paragraph = scene.root.querySelector('p')!;

      // Test updating only text
      scene.update({ text: 'New Text' });
      expect(paragraph.textContent).toBe('New Text');

      // Test updating only size
      scene.update({ size: '18px' });
      expect(paragraph.style.fontSize).toBe('18px');

      // Test updating only color
      scene.update({ color: 'blue' });
      expect(paragraph.style.color).toBe('blue');

      // Test updating with undefined properties
      scene.update({});
      expect(paragraph.textContent).toBe('New Text'); // Should remain unchanged
    });

    it('should create scenes with proper DOM structure', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const app = new App(root, mockEnvData);

      // Test various scene types
      const textScene = app.text('Hello');
      expect(textScene.root.querySelector('p')).toBeTruthy();

      const fixationScene = app.fixation();
      expect(fixationScene.root.querySelector('p')?.textContent).toBe('+');

      const blankScene = app.blank();
      expect(blankScene.root.querySelector('p')?.textContent).toBe('');

      // All scenes should be added to root
      expect(root.children.length).toBe(3);
    });
  });
});

describe('createApp', () => {
  let detectEnvironmentSpy: any;

  beforeEach(async () => {
    const utilModule = await import('../src/util');
    detectEnvironmentSpy = spyOn(
      utilModule,
      'detectEnvironment',
    ).mockResolvedValue({
      ua: 'test-user-agent',
      os: null, // Use null as valid type
      browser: 'test-browser/1.0',
      mobile: false,
      'in-app': false,
      screen_wh: [1920, 1080],
      window_wh: [1024, 768],
      frame_ms: 16.67,
    });
  });

  it('should create App with default options', async () => {
    const app = await createApp();

    expect(app).toBeInstanceOf(App);
    expect(app.root).toBe(document.body);
    expect(detectEnvironmentSpy).toHaveBeenCalledWith({
      root: document.body,
      framesCount: 60,
    });
  });

  it('should create App with custom options', async () => {
    const customRoot = document.createElement('div');
    const options = {
      root: customRoot,
      framesCount: 120,
    };

    const app = await createApp(options);

    expect(app.root).toBe(customRoot);
    expect(detectEnvironmentSpy).toHaveBeenCalledWith(options);
  });

  it('should mount root to document.body if not connected', async () => {
    const consoleSpy = spyOn(console, 'warn');
    const customRoot = document.createElement('div');
    // Don't append to document, so it's not connected

    const app = await createApp({ root: customRoot });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Root element is not connected to the document, it will be mounted to document.body',
    );
    expect(document.body.contains(customRoot)).toBe(true);
    expect(app.root).toBe(customRoot);
  });

  it('should handle detectEnvironment rejection', async () => {
    detectEnvironmentSpy.mockRejectedValue(new Error('Detection failed'));

    await expect(createApp()).rejects.toThrow('Detection failed');
  });
});
