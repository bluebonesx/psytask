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
import { Scene } from '../src/scene';
import { createSceneByJsPsychPlugin } from '../src/jspsych';

// Mock jspsych types
type MockPluginInfo = {
  name: string;
  parameters: Record<string, { default: any }>;
};

class MockJsPsychPlugin {
  static info: MockPluginInfo = {
    name: 'mock-plugin',
    parameters: {
      stimulus: { default: 'default stimulus' },
      choices: { default: ['f', 'j'] },
    },
  };

  constructor(public jsPsych: any) {}

  trial(display_element: HTMLElement, trial: any, on_load: () => void) {
    display_element.innerHTML = trial.stimulus;
    on_load();

    // Simulate user interaction after a delay
    setTimeout(() => {
      this.jsPsych.finishTrial({ rt: 500, response: 'f' });
    }, 100);
  }
}

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

describe('createSceneByJsPsychPlugin', () => {
  let mockEnvData: any;
  let app: App;

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
    app = new App(root, mockEnvData);
  });

  it('should create a scene with jsPsych plugin', async () => {
    const trial = {
      type: MockJsPsychPlugin,
      stimulus: 'Test stimulus',
      choices: ['f', 'j'],
    };

    const scene = createSceneByJsPsychPlugin(app, trial);

    expect(scene).toBeInstanceOf(Scene);

    // Check DOM structure
    const displayElement = scene.root.querySelector('.jspsych-display-element');
    expect(displayElement).toBeTruthy();

    const content = scene.root.querySelector('#jspsych-content');
    expect(content).toBeTruthy();
  });

  it('should warn about invalid plugin type', () => {
    const consoleSpy = spyOn(console, 'warn');

    // Test with invalid plugin type (not a function)
    const invalidTrial: any = {
      type: 'invalid-plugin-type', // string instead of class
      stimulus: 'Test',
    };

    const scene = createSceneByJsPsychPlugin(app, invalidTrial);

    expect(consoleSpy).toHaveBeenCalledWith(
      'jsPsych trial.type only supports jsPsych class plugins, but got',
      'invalid-plugin-type',
    );

    // The scene should be a text scene with error message
    const paragraph = scene.root.querySelector('p');
    expect(paragraph?.textContent).toBe(
      'jsPsych trial.type only supports jsPsych class plugins',
    );
  });

  it('should set default parameters from plugin info', () => {
    const trial: any = {
      type: MockJsPsychPlugin,
      // Don't set stimulus, should use default
    };

    createSceneByJsPsychPlugin(app, trial);

    expect(trial.stimulus).toBe('default stimulus');
    expect(trial.choices).toEqual(['f', 'j']);
  });

  it('should warn about unsupported parameters in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const consoleSpy = spyOn(console, 'warn');

    const trial: any = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      extensions: ['some-extension'], // unsupported parameter
    };

    createSceneByJsPsychPlugin(app, trial);

    expect(consoleSpy).toHaveBeenCalledWith(
      'jsPsych trial "extensions" parameter is not supported',
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should call on_start callback', () => {
    const onStartSpy = mock((trial: any) => {});

    const trial: any = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      on_start: onStartSpy,
    };

    createSceneByJsPsychPlugin(app, trial);

    expect(onStartSpy).toHaveBeenCalledWith(trial);
  });

  it('should add CSS classes to content element', () => {
    const trial = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      css_classes: 'test-class another-class',
    };

    const scene = createSceneByJsPsychPlugin(app, trial);
    const content = scene.root.querySelector('#jspsych-content')!;

    expect(content.classList.contains('test-class')).toBe(true);
  });

  it('should add CSS classes array to content element', () => {
    const trial = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      css_classes: ['class1', 'class2'],
    };

    const scene = createSceneByJsPsychPlugin(app, trial);
    const content = scene.root.querySelector('#jspsych-content')!;

    expect(content.classList.contains('class1')).toBe(true);
    expect(content.classList.contains('class2')).toBe(true);
  });

  it('should handle trial finish with data', async () => {
    const onFinishSpy = mock((data: any) => {});

    const trial: any = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      data: { custom: 'data' },
      on_finish: onFinishSpy,
    };

    const scene = createSceneByJsPsychPlugin(app, trial);

    const result = await scene.show();

    expect(onFinishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        start_time: expect.any(Number),
        custom: 'data',
        rt: 500,
        response: 'f',
      }),
    );
  });

  it('should handle post_trial_gap', async () => {
    // Create a plugin that finishes quickly
    class QuickFinishPlugin extends MockJsPsychPlugin {
      override trial(display_element: any, trial: any, on_load: () => void) {
        display_element.innerHTML = trial.stimulus;
        on_load();

        // Finish trial immediately with post_trial_gap
        setTimeout(() => {
          this.jsPsych.finishTrial({ rt: 100, response: 'test' });
        }, 10);
      }
    }

    const trial: any = {
      type: QuickFinishPlugin,
      stimulus: 'Test with gap',
      post_trial_gap: 50, // 50ms gap
    };

    const scene = createSceneByJsPsychPlugin(app, trial);
    const closeSpy = spyOn(scene, 'close');

    // Start the scene
    const showPromise = scene.show();

    // Wait for the trial to finish and gap to be processed
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Scene should be closed after the gap
    expect(closeSpy).toHaveBeenCalled();

    // Clean up
    scene.close();
  });

  it('should warn about unsupported jsPsych API calls in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const consoleSpy = spyOn(console, 'warn');

    // Create a plugin that accesses non-existent jsPsych methods
    class TestJsPsychAPIAccess extends MockJsPsychPlugin {
      override trial(display_element: any, trial: any, on_load: () => void) {
        display_element.innerHTML = trial.stimulus;
        on_load();

        // Access non-existing jsPsych method - should warn
        try {
          (this.jsPsych as any).nonExistentMethod();
        } catch (e) {
          // Ignore any error, we just want to trigger the proxy
        }

        // Don't call finishTrial to avoid scene lifecycle issues
      }
    }

    const trial: any = {
      type: TestJsPsychAPIAccess,
      stimulus: 'Test',
    };

    // Create the scene - this triggers plugin creation and trial execution
    createSceneByJsPsychPlugin(app, trial);

    // Should have warned about the non-existent method
    expect(consoleSpy).toHaveBeenCalledWith(
      'jsPsych.nonExistentMethod is not supported, only supports: finishTrial, pluginAPI',
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should warn about unsupported pluginAPI calls in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const consoleSpy = spyOn(console, 'warn');

    // Create a plugin that accesses a different non-existent pluginAPI method
    class TestPluginAPIAccessDifferent extends MockJsPsychPlugin {
      override trial(display_element: any, trial: any, on_load: () => void) {
        display_element.innerHTML = trial.stimulus;
        on_load();

        // Access existing method first - should not warn
        this.jsPsych.pluginAPI.getKeyboardResponse(() => {}, []);

        // Access different non-existing method - should warn
        try {
          (this.jsPsych.pluginAPI as any).anotherNonExistentMethod();
        } catch (e) {
          // Ignore any error, we just want to trigger the proxy
        }

        // Don't call finishTrial to avoid scene lifecycle issues
      }
    }

    const trial: any = {
      type: TestPluginAPIAccessDifferent,
      stimulus: 'Test',
    };

    // Create the scene - this triggers plugin creation and trial execution
    createSceneByJsPsychPlugin(app, trial);

    // Should have warned about the non-existent method
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'jsPsych.pluginAPI.anotherNonExistentMethod is not supported, only supports:',
      ),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should warn about unsupported pluginAPI methods in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const consoleSpy = spyOn(console, 'warn');

    // Create a plugin that accesses non-existent pluginAPI methods
    class TestPluginAPIAccess extends MockJsPsychPlugin {
      override trial(
        display_element: HTMLElement,
        trial: any,
        on_load: () => void,
      ) {
        display_element.innerHTML = trial.stimulus;
        on_load();

        // Access existing method first - should not warn
        this.jsPsych.pluginAPI.getKeyboardResponse(() => {}, []);

        // Access non-existing method - should warn
        try {
          (this.jsPsych.pluginAPI as any).nonExistentMethod();
        } catch (e) {
          // Ignore any error, we just want to trigger the proxy
        }

        // Don't call finishTrial to avoid scene lifecycle issues
      }
    }

    const trial: any = {
      type: TestPluginAPIAccess,
      stimulus: 'Test',
    };

    // Create the scene - this triggers plugin creation and trial execution
    createSceneByJsPsychPlugin(app, trial);

    // Should have warned about the non-existent method
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'jsPsych.pluginAPI.nonExistentMethod is not supported, only supports:',
      ),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should handle jsPsych plugin with no on_finish callback', () => {
    const trial: any = {
      type: MockJsPsychPlugin,
      stimulus: 'Test without on_finish',
    };

    // Should not throw when on_finish is not provided
    const scene = createSceneByJsPsychPlugin(app, trial);
    expect(scene).toBeInstanceOf(Scene);
  });

  it('should handle jsPsych plugin with css_classes as string', () => {
    const trial: any = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      css_classes: 'single-class',
    };

    const scene = createSceneByJsPsychPlugin(app, trial);
    const content = scene.root.querySelector('#jspsych-content')!;

    expect(content.classList.contains('single-class')).toBe(true);
  });

  it('should handle jsPsych plugin in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const trial: any = {
      type: MockJsPsychPlugin,
      stimulus: 'Test in production',
    };

    const scene = createSceneByJsPsychPlugin(app, trial);

    expect(scene).toBeInstanceOf(Scene);

    process.env.NODE_ENV = originalEnv;
  });

  it('should handle plugin with minimal parameters', () => {
    class MinimalPlugin extends MockJsPsychPlugin {
      static override info = {
        name: 'minimal-plugin',
        parameters: {},
      };
    }

    const trial: any = {
      type: MinimalPlugin,
      stimulus: 'Test',
    };

    // Should not throw
    const scene = createSceneByJsPsychPlugin(app, trial);
    expect(scene).toBeInstanceOf(Scene);
  });

  it('should handle trial with on_load callback without execution', () => {
    const onLoadSpy = mock(() => {});

    const trial: any = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      on_load: onLoadSpy,
    };

    // Just create the scene, don't execute to avoid timing issues
    const scene = createSceneByJsPsychPlugin(app, trial);
    expect(scene).toBeInstanceOf(Scene);
    // Note: on_load is called during plugin.trial() execution
  });
});

describe('App jsPsych integration', () => {
  let mockEnvData: any;
  let app: App;

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
    app = new App(root, mockEnvData);
  });

  it('should create a scene with jsPsych plugin via app.jsPsych method', async () => {
    const trial = {
      type: MockJsPsychPlugin,
      stimulus: 'Test stimulus',
      choices: ['f', 'j'],
    };

    const scene = app.jsPsych(trial);

    expect(scene).toBeInstanceOf(Scene);

    // Check DOM structure
    const displayElement = scene.root.querySelector('.jspsych-display-element');
    expect(displayElement).toBeTruthy();

    const content = scene.root.querySelector('#jspsych-content');
    expect(content).toBeTruthy();
  });
});
