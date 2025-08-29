import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { App } from '../../src/app';
import { Scene } from '../../src/scene';
import { jsPsychStim } from '../../src/scenes/jspsych';

class MockJsPsychPlugin {
  static info = {
    name: 'mock-plugin',
    parameters: {
      stimulus: { default: 'default stimulus' },
      choices: { default: ['f', 'j'] },
    } as Record<string, { default: any }>,
  };

  constructor(public jsPsych: any) {}

  trial(display_element: HTMLElement, trial: any, on_load: () => void) {
    display_element.innerHTML = trial.stimulus;
    on_load();

    // Only simulate user interaction for tests that actually show the scene
    // Check if the trial has a special flag to auto-finish
    if (trial.autoFinish !== false) {
      setTimeout(() => {
        // Check if the scene is actually being shown before finishing
        try {
          this.jsPsych.finishTrial({ rt: 500, response: 'f' });
        } catch (error) {
          // Ignore errors about scene not being shown - this is expected for tests
          // that create scenes without calling show()
          if (
            !(error instanceof Error) ||
            !error.message?.includes('Scene is not being shown')
          ) {
            throw error;
          }
        }
      }, 100);
    }
  }
}

describe('jsPsych scene', () => {
  let app: App;

  beforeEach(() => {
    app = new App(document.body);
  });

  it('should create a scene with jsPsych plugin', async () => {
    const trial = {
      type: MockJsPsychPlugin,
      stimulus: 'Test stimulus',
      choices: ['f', 'j'],
    };

    const scene = app.scene(jsPsychStim, { defaultProps: trial });

    expect(scene).toBeInstanceOf(Scene);

    // Check DOM structure
    const displayElement = scene.root.querySelector('.jspsych-display-element');
    expect(displayElement).toBeTruthy();

    const content = scene.root.querySelector('#jspsych-content');
    expect(content).toBeTruthy();
  });

  it('should throw error for invalid plugin type', () => {
    // Test with invalid plugin type (not a class plugin)
    const invalidTrial: any = {
      type: 'invalid-plugin-type',
      stimulus: 'Test',
    };

    expect(() =>
      app.scene(jsPsychStim, { defaultProps: invalidTrial }),
    ).toThrow(/jsPsych trial.type only supports jsPsych class plugins/);
  });

  it('should set default parameters from plugin info', () => {
    const trial: any = {
      type: MockJsPsychPlugin,
      // Don't set stimulus, should use default
    };

    const scene = app.scene(jsPsychStim, { defaultProps: trial });

    // Check the reactive props object instead of original trial
    expect(scene.props.stimulus).toBe('default stimulus');
    expect(scene.props.choices).toEqual(['f', 'j']);
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

    app.scene(jsPsychStim, { defaultProps: trial });

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

    const scene = app.scene(jsPsychStim, { defaultProps: trial });

    // The on_start callback is called with the reactive props object
    expect(onStartSpy).toHaveBeenCalledWith(scene.props);
  });

  it('should add CSS classes to content element', () => {
    const trial = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      css_classes: 'test-class another-class',
    };

    const scene = app.scene(jsPsychStim, { defaultProps: trial });
    const content = scene.root.querySelector('#jspsych-content')!;

    expect(content.classList.contains('test-class')).toBe(true);
  });

  it('should add CSS classes array to content element', () => {
    const trial = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      css_classes: ['class1', 'class2'],
    };

    const scene = app.scene(jsPsychStim, { defaultProps: trial });
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

    const scene = app.scene(jsPsychStim, { defaultProps: trial });

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

    const scene = app.scene(jsPsychStim, { defaultProps: trial });
    const closeSpy = spyOn(scene, 'close');

    // Start the scene to put it in "shown" state
    const showPromise = scene.show();

    // Wait for the trial to finish and gap to be processed
    await new Promise((r) => setTimeout(r, 100));

    // Scene should be closed after the gap
    expect(closeSpy).toHaveBeenCalled();

    // Wait for the show promise to complete
    await showPromise;
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
    app.scene(jsPsychStim, { defaultProps: trial });

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
    app.scene(jsPsychStim, { defaultProps: trial });

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
    app.scene(jsPsychStim, { defaultProps: trial });

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
    const scene = app.scene(jsPsychStim, { defaultProps: trial });
    expect(scene).toBeInstanceOf(Scene);
  });

  it('should handle jsPsych plugin with css_classes as string', () => {
    const trial: any = {
      type: MockJsPsychPlugin,
      stimulus: 'Test',
      css_classes: 'single-class',
    };

    const scene = app.scene(jsPsychStim, { defaultProps: trial });
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

    const scene = app.scene(jsPsychStim, { defaultProps: trial });

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
    const scene = app.scene(jsPsychStim, { defaultProps: trial });
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
    const scene = app.scene(jsPsychStim, { defaultProps: trial });
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
    app = new App(root);
  });

  it('should create a scene with jsPsych plugin via app.scene + jsPsychTrial', async () => {
    const trial = {
      type: MockJsPsychPlugin,
      stimulus: 'Test stimulus',
      choices: ['f', 'j'],
    };

    const scene = app.scene(jsPsychStim, { defaultProps: trial });

    expect(scene).toBeInstanceOf(Scene);

    // Check DOM structure
    const displayElement = scene.root.querySelector('.jspsych-display-element');
    expect(displayElement).toBeTruthy();

    const content = scene.root.querySelector('#jspsych-content');
    expect(content).toBeTruthy();
  });
});
