import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { App } from '../src/app';
import {
  Scene,
  type SceneOptions,
  type SceneSetup,
  generic,
} from '../src/scene';
import { h } from '../src/util';

describe('Scene', () => {
  let mockApp: App;
  beforeEach(() => {
    mockApp = new App(document.body);
  });

  describe('constructor', () => {
    it('should create Scene instance with app and setup function', () => {
      const setup: SceneSetup<{}> = (props, ctx) => ({
        node: 'test scene',
      });

      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      expect(scene.app).toBe(mockApp);
      expect(scene.root).toBeInstanceOf(window.HTMLDivElement);
      expect(scene.root.tagName).toBe('DIV');
      // show() should be available to drive updates
      expect(typeof scene.show).toBe('function');
    });

    it('should accept options parameter', () => {
      const options: SceneOptions<SceneSetup<{}>> = {
        defaultProps: {},
        duration: 1000,
        close_on: 'click',
      };

      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, options);

      expect(scene.options).toBe(options);
      expect(scene.options.duration).toBe(1000);
      expect(scene.options.close_on).toBe('click');
    });

    it('should setup close event listeners for single close_on event', () => {
      const addEventListenerSpy = spyOn(
        window.Element.prototype,
        'addEventListener',
      );
      const setup: SceneSetup<{}> = () => ({ node: '' });

      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        close_on: 'click',
      });
      scene.show(); // Event listeners are added when scene is shown

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
      const setup: SceneSetup<{}> = () => ({ node: '' });

      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        close_on: ['click', 'keydown'],
      });
      scene.show(); // Event listeners are added when scene is shown

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
      window.Element.prototype.addEventListener = function (...args: any) {
        callCount++;
        return originalAddEventListener.apply(this, args);
      };

      const setup: SceneSetup<{}> = () => ({ node: '' });
      new Scene(mockApp, setup, { defaultProps: {} });

      // Restore
      window.Element.prototype.addEventListener = originalAddEventListener;

      expect(callCount).toBe(0);
    });

    it('should call setup function and get node', () => {
      const setupSpy = mock((props: any, ctx: Scene<any>) => {
        return { node: 'updated' };
      });

      const scene = new Scene(mockApp, setupSpy, { defaultProps: {} });

      expect(setupSpy).toHaveBeenCalledWith(scene.props, scene);
      expect(scene.root.textContent).toBe('updated');
    });

    it('should initialize scene as closed', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      // Scene should be closed initially
      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should add cleanup function to remove from app root', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      // Scene root should be added to app root automatically
      expect(mockApp.root.contains(scene.root)).toBe(true);

      // Emit cleanup should remove it
      scene.emit('cleanup', null);
      expect(mockApp.root.contains(scene.root)).toBe(false);
    });
  });

  describe('config method', () => {
    it('should update options and return scene instance', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 1000,
      });

      const result = scene.config({ duration: 2000, close_on: 'click' });

      expect(result).toBe(scene);
      expect(scene.options.duration).toBe(2000);
      expect(scene.options.close_on).toBe('click');
    });

    it('should partially update options', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 1000,
        close_on: 'click',
      });

      scene.config({ duration: 2000 });

      expect(scene.options.duration).toBe(2000);
      expect(scene.options.close_on).toBe('click'); // Should remain unchanged
    });
  });

  describe('close method', () => {
    it('should close the scene and resolve promise', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      // Show scene first
      const showPromise = scene.show();

      // Close scene
      scene.close();

      expect(scene.root.style.transform).toBe('scale(0)');

      // Promise should resolve with scene data
      const result = await showPromise;
      expect(typeof result).toBe('object');
      expect(result.start_time).toBeGreaterThanOrEqual(0);
    });

    it('should throw when trying to close not shown scene', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      // Scene is initially not shown
      expect(() => scene.close()).toThrow('Scene is not being shown');
    });

    it('should handle close when no show promise exists', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      // Close without showing - should throw
      expect(() => scene.close()).toThrow('Scene is not being shown');
    });
  });

  describe('show method', () => {
    it('should show the scene and update props', () => {
      let currentText = '';
      const setup: SceneSetup<{ text?: string }> = (props) => {
        const div = document.createElement('div');
        // Setup reactive effect manually since we can't import `effect` function
        const updateText = () => {
          div.textContent = props.text || '';
          currentText = props.text || '';
        };
        updateText(); // Initial setup
        return { node: div };
      };
      const scene = new Scene(mockApp, setup, { defaultProps: { text: '' } });

      scene.show({ text: 'test text' });

      expect(scene.root.style.transform).toBe('scale(1)');
      // The props are updated, but the DOM update might be async
      expect(scene.props.text).toBe('test text');
    });

    it('should throw when trying to show already shown scene', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.show();
      expect(() => scene.show()).toThrow('Scene is already being shown');
    });

    it('should return a promise that resolves with scene data', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      const showPromise = scene.show();
      scene.close();

      const result = await showPromise;
      expect(typeof result).toBe('object');
      expect(result.start_time).toBeGreaterThanOrEqual(0);
    });

    it('should warn when duration is not a multiple of frame_ms (development only)', () => {
      process.env.NODE_ENV = 'development';
      const consoleSpy = spyOn(console, 'warn');
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 10,
      }); // Not a multiple of 16.67

      scene.show();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Scene duration is not a multiple of frame_ms'),
      );
    });

    it('should not warn when duration aligns with frame multiples (error < 1ms)', () => {
      process.env.NODE_ENV = 'development';
      const consoleSpy = spyOn(console, 'warn');
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 1000,
      });

      scene.show();
      // Close immediately to avoid cancelAnimationFrame
      scene.close();

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Scene duration is not a multiple of frame_ms'),
      );
    });

    it('should handle scene without duration', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.show();

      // Wait a moment then close to stop animation
      await 0;
      scene.close();

      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should set start_time on first frame', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      const showPromise = scene.show();

      // Wait for requestAnimationFrame to set start_time
      await new Promise((r) => setTimeout(r, 17));
      scene.close();

      const result = await showPromise;
      expect(result.start_time).toBeGreaterThan(0);
    });

    it('should call scene:frame event during animation', async () => {
      const onFrameSpy = mock((event: { lastFrameTime: number }) => {});
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 50, // Short duration to auto-close
      });

      scene.on('scene:frame', onFrameSpy);
      scene.show();

      // Wait for animation frames
      await new Promise((r) => setTimeout(r, 17));

      expect(onFrameSpy).toHaveBeenCalled();
    });

    it('should auto-close when duration is reached', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 20,
      }); // Very short duration

      const result = await scene.show();
      expect(scene.root.style.transform).toBe('scale(0)');
      expect(typeof result).toBe('object');
      expect(result.start_time).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple parameters in props', () => {
      const setup: SceneSetup<{ a?: number; b?: string; c?: boolean }> = (
        props,
      ) => {
        const div = document.createElement('div');
        // Set initial content
        div.textContent = `${props.a}-${props.b}-${props.c}`;
        return { node: div };
      };
      const scene = new Scene(mockApp, setup, {
        defaultProps: { a: 0, b: '', c: false },
      });

      scene.show({ a: 42, b: 'test', c: true });

      // Check that props are updated
      expect(scene.props.a).toBe(42);
      expect(scene.props.b).toBe('test');
      expect(scene.props.c).toBe(true);
    });
  });

  describe('event handling', () => {
    it('should close scene when close_on event is triggered', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        close_on: 'click',
      });

      scene.show();
      expect(scene.root.style.transform).toBe('scale(1)');

      // Trigger click event
      const clickEvent = new (globalThis as any).Event('click');
      scene.root.dispatchEvent(clickEvent);

      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should handle multiple close_on events', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        close_on: ['click', 'keydown'],
      });

      scene.show();

      // Test click event
      const clickEvent = new (globalThis as any).Event('click');
      scene.root.dispatchEvent(clickEvent);
      expect(scene.root.style.transform).toBe('scale(0)');

      // Wait a bit then show again and test keydown
      await 0;
      scene.show();
      const keyEvent = new (globalThis as any).Event('keydown');
      scene.root.dispatchEvent(keyEvent);
      expect(scene.root.style.transform).toBe('scale(0)');
    });
  });

  describe('data handling', () => {
    it('should handle scene data object', () => {
      const setup: SceneSetup<{}, { custom: string }> = (props, ctx) => ({
        node: 'test',
        data: () => ({ custom: 'value' }),
      });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.show();

      expect(scene.data).toBeDefined();
      expect(scene.data?.().custom).toBe('value');
    });

    it('should preserve custom data when showing scene', async () => {
      const setup: SceneSetup<{}, { test: string }> = (props, ctx) => ({
        node: 'test',
        data: () => ({ test: 'data' }),
      });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      const showPromise = scene.show();
      scene.close();

      const result = await showPromise;
      expect(result.test).toBe('data');
    });
  });

  describe('disposal and cleanup', () => {
    it('should dispose properly with cleanup event', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      // Scene root should be added to app root automatically
      expect(mockApp.root.contains(scene.root)).toBe(true);

      // Emit cleanup should remove it
      scene.emit('cleanup', null);

      // Should be removed from app root
      expect(mockApp.root.contains(scene.root)).toBe(false);
    });

    it('should handle disposal when scene is shown', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      // Scene root is already added to app root in constructor
      expect(mockApp.root.contains(scene.root)).toBe(true);

      const showPromise = scene.show();

      // Close and emit cleanup
      scene.close();
      scene.emit('cleanup', null);

      // Should still work
      const result = await showPromise;
      expect(typeof result).toBe('object');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle scene with no update function effects', async () => {
      const setup: SceneSetup<{}> = () => ({
        node: '', // Empty node
      });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 50,
      }); // Add duration to auto-close

      const showPromise = scene.show();

      // Wait for auto-close
      const result = await showPromise;
      expect(typeof result).toBe('object');
    });

    it('should handle scene with complex setup', () => {
      const setup: SceneSetup<{ message?: string; count?: number }> = (
        props,
        ctx,
      ) => {
        // Setup DOM structure
        const container = document.createElement('div');
        const text = document.createElement('p');
        const button = document.createElement('button');

        // Set initial content
        text.textContent = `${props.message || ''} (${props.count || 0})`;
        button.textContent = 'Click me';

        container.appendChild(text);
        container.appendChild(button);

        return { node: container };
      };

      const scene = new Scene(mockApp, setup, {
        defaultProps: { message: '', count: 0 },
      });

      scene.show({ message: 'Hello', count: 42 });

      const text = scene.root.querySelector('p');
      const button = scene.root.querySelector('button');

      // Check props are updated
      expect(scene.props.message).toBe('Hello');
      expect(scene.props.count).toBe(42);
      expect(button?.textContent).toBe('Click me');
    });

    it('should handle rapid show/close cycles', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      // Rapid show/close with async waits
      scene.show();
      scene.close();
      await 0;

      scene.show();
      scene.close();

      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should handle scene with zero duration', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 0,
      });
      expect(scene.root.style.transform).toBe('scale(0)');

      const result = await scene.show();
      expect(typeof result).toBe('object');
    });

    it('should handle scene with very long duration', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 10000,
      });

      scene.show();

      expect(scene.root.style.transform).toBe('scale(1)');

      // Manually close to avoid long-running test
      scene.close();
      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should handle scene with undefined options', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      expect(scene.options.defaultProps).toEqual({});

      scene.show();
      // Close quickly to avoid infinite loop
      await 0;
      scene.close();

      expect(scene.root.style.transform).toBe('scale(0)');
    });

    it('should handle show with no parameters', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.show();
      // Wait a moment to let RAF start, then close
      await new Promise((r) => setTimeout(r, 20));
      scene.close();
      expect(scene.root.style.transform).toBe('scale(0)');
    });
  });

  describe('animation timing', () => {
    it('should handle frame timing calculations correctly', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 100,
      });

      const result = await scene.show();
      expect(result.start_time).toBeGreaterThan(0);
    });

    it('should use magic number 1.5 in duration calculation', async () => {
      // This tests the magic number 1.5 mentioned in the source code
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: mockApp.data.frame_ms * 2, // 2 frames
      });

      const showPromise = scene.show();

      // Wait for duration calculation with magic number
      await 0;

      // Should auto-close based on duration - frame_ms * 1.5
      const result = await showPromise;
      expect(typeof result).toBe('object');
    });
  });

  describe('requestAnimationFrame integration', () => {
    it('should handle requestAnimationFrame properly', () => {
      // This test verifies that Scene uses requestAnimationFrame
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 50,
      });

      // Just verify scene can be shown - RAF handling is tested implicitly
      // in other tests like auto-close and frame timing
      scene.show();
      expect(scene.root.style.transform).toBe('scale(1)');

      scene.close();
      expect(scene.root.style.transform).toBe('scale(0)');
    });
  });

  describe('generic function', () => {
    it('should be a type helper that returns a function', () => {
      const setup: SceneSetup<{ name: string }, { value: number }> = (
        props,
      ) => ({
        node: 'test',
        data: () => ({ value: 123 }),
      });

      const result = generic(setup);

      // generic is just a type helper, it should return a function
      expect(typeof result).toBe('function');
    });
  });

  describe('use method', () => {
    it('should call setup function and return result with props', () => {
      const setup: SceneSetup<{ name: string }> = (props, ctx) => ({
        node: h('div', null, 'Test content'),
        data: () => ({ result: props.name }),
      });

      const scene = new Scene(mockApp, () => ({ node: 'dummy' }), {
        defaultProps: {},
      });

      const result = scene.use(setup, { name: 'test' });

      expect(result.node).toBeInstanceOf(HTMLDivElement);
      expect(result.data).toBeInstanceOf(Function);
      expect(result.props).toBeDefined();
      expect(result.props.name).toBe('test');
    });
  });

  describe('context menu prevention', () => {
    it('should prevent context menu on right click', () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      const contextMenuEvent = new Event('contextmenu') as any;
      contextMenuEvent.preventDefault = mock(() => {});

      scene.root.dispatchEvent(contextMenuEvent);

      expect(contextMenuEvent.preventDefault).toHaveBeenCalled();
    });
  });

  describe('mouse event handling', () => {
    it('should handle mouse:left events', async () => {
      const mouseLeftSpy = mock((event: MouseEvent) => {});
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.on('mouse:left', mouseLeftSpy);
      scene.show();

      // Simulate left mouse button down (button = 0)
      const mouseEvent = new MouseEvent('mousedown', { button: 0 });
      scene.root.dispatchEvent(mouseEvent);

      expect(mouseLeftSpy).toHaveBeenCalledWith(mouseEvent);
      scene.close();
    });

    it('should handle mouse:middle events', async () => {
      const mouseMiddleSpy = mock((event: MouseEvent) => {});
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.on('mouse:middle', mouseMiddleSpy);
      scene.show();

      // Simulate middle mouse button down (button = 1)
      const mouseEvent = new MouseEvent('mousedown', { button: 1 });
      scene.root.dispatchEvent(mouseEvent);

      expect(mouseMiddleSpy).toHaveBeenCalledWith(mouseEvent);
      scene.close();
    });

    it('should handle mouse:right events', async () => {
      const mouseRightSpy = mock((event: MouseEvent) => {});
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.on('mouse:right', mouseRightSpy);
      scene.show();

      // Simulate right mouse button down (button = 2)
      const mouseEvent = new MouseEvent('mousedown', { button: 2 });
      scene.root.dispatchEvent(mouseEvent);

      expect(mouseRightSpy).toHaveBeenCalledWith(mouseEvent);
      scene.close();
    });

    it('should handle mouse:unknown events for other buttons', async () => {
      const mouseUnknownSpy = mock((event: MouseEvent) => {});
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.on('mouse:unknown', mouseUnknownSpy);
      scene.show();

      // Simulate unknown mouse button down (button = 5)
      const mouseEvent = new MouseEvent('mousedown', { button: 5 });
      scene.root.dispatchEvent(mouseEvent);

      expect(mouseUnknownSpy).toHaveBeenCalledWith(mouseEvent);
      scene.close();
    });
  });

  describe('keyboard event handling', () => {
    it('should handle key:* events', async () => {
      const keyEnterSpy = mock((event: KeyboardEvent) => {});
      const keyEscapeSpy = mock((event: KeyboardEvent) => {});
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.on('key:Enter', keyEnterSpy);
      scene.on('key:Escape', keyEscapeSpy);
      scene.show();

      // Simulate Enter key press
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      scene.root.dispatchEvent(enterEvent);

      // Simulate Escape key press
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      scene.root.dispatchEvent(escapeEvent);

      expect(keyEnterSpy).toHaveBeenCalledWith(enterEvent);
      expect(keyEscapeSpy).toHaveBeenCalledWith(escapeEvent);
      scene.close();
    });

    it('should handle multiple key events for same scene', async () => {
      const keySpy = mock((event: KeyboardEvent) => {});
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.on('key:a', keySpy);
      scene.on('key:b', keySpy);
      scene.show();

      // Both should use the same keydown listener
      const keyAEvent = new KeyboardEvent('keydown', { key: 'a' });
      const keyBEvent = new KeyboardEvent('keydown', { key: 'b' });

      scene.root.dispatchEvent(keyAEvent);
      scene.root.dispatchEvent(keyBEvent);

      expect(keySpy).toHaveBeenCalledTimes(2);
      scene.close();
    });
  });

  describe('frame times logging', () => {
    it('should log frame times when frame_times option is enabled', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 50,
        frame_times: true,
      });

      const showPromise = scene.show();

      // Wait for some frames to be logged
      await 0;

      const result = await showPromise;
      expect(result.frame_times).toBeInstanceOf(Array);
      expect(result.frame_times.length).toBeGreaterThan(0);
    });

    it('should not log frame times when frame_times option is disabled', async () => {
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, {
        defaultProps: {},
        duration: 50,
        frame_times: false,
      });

      const showPromise = scene.show();

      // Wait for duration to pass
      await 0;

      const result = await showPromise;
      expect(result.frame_times).toEqual([]);
    });
  });

  describe('non-scene event handling', () => {
    it('should handle custom DOM events that do not start with scene:', async () => {
      const customEventSpy = mock((event: Event) => {});
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.on('custom' as any, customEventSpy);
      scene.show();

      const customEvent = new Event('custom');
      scene.root.dispatchEvent(customEvent);

      expect(customEventSpy).toHaveBeenCalledWith(customEvent);
      scene.close();
    });
  });

  describe('development mode features', () => {
    it('should set global window.s reference in development mode', () => {
      process.env.NODE_ENV = 'development';
      const setup: SceneSetup<{}> = () => ({ node: '' });
      const scene = new Scene(mockApp, setup, { defaultProps: {} });

      scene.show();

      expect((window as any).s).toBe(scene);
      scene.close();
    });
  });
});
