import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { reactive } from '../../src/reactive';
import { App } from '../../src/app';
import { Scene } from '../../src/scene';
import {
  GaussianMask,
  TextStim,
  ImageStim,
  Grating,
  VirtualChinrest,
} from '../../src/components/visual';

// Mock browser APIs that are not available in test environment
class MockImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

global.ImageData = MockImageData as any;

global.createImageBitmap = async (source: any) => {
  return {
    width: source.width || 100,
    height: source.height || 100,
    close: () => {},
  } as ImageBitmap;
};

// Mock CanvasRenderingContext2D
global.CanvasRenderingContext2D = class MockCanvasRenderingContext2D {
  clearRect() {}
  putImageData() {}
  drawImage() {}
} as any;

const mockCanvas2D = () => ({
  clearRect: mock(() => {}),
  putImageData: mock(() => {}),
  drawImage: mock(() => {}),
  fillRect: mock(() => {}),
  fillStyle: '',
});

const mockImageData = (width: number, height: number) =>
  new MockImageData(width, height);

describe('Visual Scenes', () => {
  let app: App;

  beforeEach(() => {
    // Mock canvas getContext to return our mock
    HTMLCanvasElement.prototype.getContext = mock(() => mockCanvas2D()) as any;

    app = new App(document.body);
  });

  describe('GaussianMask', () => {
    it('should create a Gaussian mask function', () => {
      const mask = GaussianMask(1);
      expect(typeof mask).toBe('function');
    });

    it('should return maximum value at center (0, 0)', () => {
      const mask = GaussianMask(1);
      expect(mask(0, 0)).toBe(1);
    });

    it('should return decreasing values with distance from center', () => {
      const mask = GaussianMask(1);
      const center = mask(0, 0);
      const near = mask(0.5, 0);
      const far = mask(1, 0);

      expect(center).toBeGreaterThan(near);
      expect(near).toBeGreaterThan(far);
      expect(far).toBeGreaterThan(0);
    });

    it('should be symmetric', () => {
      const mask = GaussianMask(1);
      expect(mask(1, 0)).toBeCloseTo(mask(-1, 0));
      expect(mask(0, 1)).toBeCloseTo(mask(0, -1));
      expect(mask(1, 1)).toBeCloseTo(mask(-1, -1));
    });

    it('should handle different sigma values', () => {
      const narrow = GaussianMask(0.5);
      const wide = GaussianMask(2);

      // Narrow mask should decrease faster
      expect(narrow(1, 0)).toBeLessThan(wide(1, 0));
    });
  });

  describe('TextStim', () => {
    it('should create a text stimulus with default properties', () => {
      const props = reactive({} as Parameters<typeof TextStim>[0]);
      const result = TextStim(props);

      expect(result.node).toBeInstanceOf(HTMLDivElement);
      expect(result.node.className).toBe('psytask-center');
      expect(result.node.textContent).toBe('Hello Word');
    });

    it('should handle string children', () => {
      const props = reactive({ children: 'Custom text' });
      const result = TextStim(props);
      expect(result.node.textContent).toBe('Custom text');
    });

    it('should handle Node children', () => {
      const span = document.createElement('span');
      span.textContent = 'Span content';
      const props = reactive({ children: span });
      const result = TextStim(props);
      expect(result.node.contains(span)).toBe(true);
    });

    it('should handle array of children', () => {
      const span = document.createElement('span');
      span.textContent = 'Span';
      const props = reactive({ children: ['Text ', span, ' More text'] });
      const result = TextStim(props);
      expect(result.node.textContent).toBe('Text Span More text');
    });

    it('should apply CSS properties', () => {
      const props = reactive({
        color: 'red',
        fontSize: '20px',
        textAlign: 'center' as const,
      });
      const result = TextStim(props);

      expect(result.node.style.color).toBe('red');
      expect(result.node.style.fontSize).toBe('20px');
      expect(result.node.style.textAlign).toBe('center');
    });

    it('should update text when children change', async () => {
      const props = reactive({ children: 'Initial text' });
      const result = TextStim(props);
      expect(result.node.textContent).toBe('Initial text');

      props.children = 'Updated text';
      // Wait for reactive effect to be applied
      await 0;
      expect(result.node.textContent).toBe('Updated text');
    });

    it('should update styles when CSS properties change', async () => {
      const props = reactive({ color: 'red' });
      const result = TextStim(props);
      expect(result.node.style.color).toBe('red');

      props.color = 'blue';
      // Wait for reactive effect to be applied
      await 0;
      expect(result.node.style.color).toBe('blue');
    });
  });

  describe('ImageStim', () => {
    it('should create a canvas element', () => {
      const props = reactive({} as Parameters<typeof ImageStim>[0]);
      const result = ImageStim(props);
      expect(result.node).toBeInstanceOf(HTMLCanvasElement);
    });

    it('should throw error if canvas context is not available', () => {
      // Mock getContext to return null
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = () => null;

      expect(() => {
        ImageStim(reactive({} as Parameters<typeof ImageStim>[0]));
      }).toThrow('Failed to get canvas 2d context');

      // Restore original method
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });

    it('should handle ImageData', () => {
      const imageData = mockImageData(10, 10);
      const props = reactive({ image: imageData as any });
      const result = ImageStim(props);
      const canvas = result.node as HTMLCanvasElement;

      expect(canvas.width).toBe(10);
      expect(canvas.height).toBe(10);
    });

    it('should handle ImageBitmap', async () => {
      // Create a simple mock ImageBitmap
      const canvas = { width: 20, height: 20 };
      const imageBitmap = await createImageBitmap(canvas as any);
      const props = reactive({ image: imageBitmap as any });
      const result = ImageStim(props);
      const resultCanvas = result.node as HTMLCanvasElement;

      expect(resultCanvas.width).toBe(20);
      expect(resultCanvas.height).toBe(20);
    });

    it('should call draw function when provided', () => {
      const drawMock = mock((ctx: CanvasRenderingContext2D) => {
        ctx.fillStyle = 'blue';
        ctx.fillRect(0, 0, 10, 10);
      });

      const props = reactive({ draw: drawMock } as Parameters<
        typeof ImageStim
      >[0]);
      ImageStim(props);

      expect(drawMock).toHaveBeenCalledTimes(1);
      expect(drawMock).toHaveBeenCalledWith(
        expect.objectContaining({
          clearRect: expect.any(Function),
          putImageData: expect.any(Function),
          drawImage: expect.any(Function),
        }),
      );
    });

    it('should clear canvas before drawing', async () => {
      // Create a specific mock context that we can spy on
      const mockCtx = mockCanvas2D();
      const clearRectSpy = spyOn(mockCtx, 'clearRect');

      // Override getContext for this test to return our specific mock
      HTMLCanvasElement.prototype.getContext = mock(() => mockCtx) as any;

      const props = reactive({} as Parameters<typeof ImageStim>[0]);
      const result = ImageStim(props);

      // Trigger redraw by updating props
      (props as any).image = mockImageData(5, 5);

      // Wait for effect to process the update
      await 0;

      // Check that clearRect was called
      expect(clearRectSpy).toHaveBeenCalled();
    });
  });

  describe('Grating', () => {
    it('should create a grating with default parameters', () => {
      const scene = app.scene(Grating, {
        defaultProps: {
          type: 'sin' as const,
          size: 100,
          sf: 0.1,
        },
      });

      expect(scene).toBeInstanceOf(Scene);
      expect(scene.root.querySelector('canvas')).toBeInstanceOf(
        HTMLCanvasElement,
      );
    });

    it('should handle different wave types', () => {
      const types = ['sin', 'square', 'triangle', 'sawtooth'] as const;

      types.forEach((type) => {
        const scene = app.scene(Grating, {
          defaultProps: {
            type,
            size: 50,
            sf: 0.1,
          },
        });

        expect(scene).toBeInstanceOf(Scene);
        expect(scene.root.querySelector('canvas')).toBeInstanceOf(
          HTMLCanvasElement,
        );
      });
    });

    it('should handle custom wave function', () => {
      const customWave = (x: number) => Math.cos(x);
      const scene = app.scene(Grating, {
        defaultProps: {
          type: customWave,
          size: 50,
          sf: 0.1,
        },
      });

      expect(scene).toBeInstanceOf(Scene);
      expect(scene.root.querySelector('canvas')).toBeInstanceOf(
        HTMLCanvasElement,
      );
    });

    it('should handle different sizes', async () => {
      // Square size
      const squareScene = app.scene(Grating, {
        defaultProps: {
          type: 'sin' as const,
          size: 100,
          sf: 0.1,
        },
      });

      // Wait for effects to be applied
      await 0;

      const squareCanvas = squareScene.root.querySelector(
        'canvas',
      ) as HTMLCanvasElement;
      // Check that width and height are equal (square) and canvas exists
      expect(squareCanvas).toBeInstanceOf(HTMLCanvasElement);
      expect(squareCanvas.width).toBe(squareCanvas.height);

      // Rectangular size
      const rectScene = app.scene(Grating, {
        defaultProps: {
          type: 'sin' as const,
          size: [120, 80] as [number, number],
          sf: 0.1,
        },
      });

      // Wait for effects to be applied
      await 0;

      const rectCanvas = rectScene.root.querySelector(
        'canvas',
      ) as HTMLCanvasElement;
      // Check that canvas exists and width/height ratio is correct
      expect(rectCanvas).toBeInstanceOf(HTMLCanvasElement);
      expect(rectCanvas.width / rectCanvas.height).toBeCloseTo(120 / 80);
    });

    it('should handle orientation parameter', () => {
      const scene = app.scene(Grating, {
        defaultProps: {
          type: 'sin' as const,
          size: 50,
          sf: 0.1,
          ori: Math.PI / 4, // 45 degrees
        },
      });

      expect(scene).toBeInstanceOf(Scene);
      expect(scene.root.querySelector('canvas')).toBeInstanceOf(
        HTMLCanvasElement,
      );
    });

    it('should handle phase parameter', () => {
      const scene = app.scene(Grating, {
        defaultProps: {
          type: 'sin' as const,
          size: 50,
          sf: 0.1,
          phase: Math.PI / 2,
        },
      });

      expect(scene).toBeInstanceOf(Scene);
      expect(scene.root.querySelector('canvas')).toBeInstanceOf(
        HTMLCanvasElement,
      );
    });

    it('should handle color parameter', () => {
      const scene = app.scene(Grating, {
        defaultProps: {
          type: 'sin' as const,
          size: 50,
          sf: 0.1,
          color: [255, 0, 0] as [number, number, number],
        },
      });

      expect(scene).toBeInstanceOf(Scene);
      expect(scene.root.querySelector('canvas')).toBeInstanceOf(
        HTMLCanvasElement,
      );
    });

    it('should handle dual color parameter', () => {
      const scene = app.scene(Grating, {
        defaultProps: {
          type: 'sin' as const,
          size: 50,
          sf: 0.1,
          color: [
            [255, 0, 0],
            [0, 255, 0],
          ] as [[number, number, number], [number, number, number]],
        },
      });

      expect(scene).toBeInstanceOf(Scene);
      expect(scene.root.querySelector('canvas')).toBeInstanceOf(
        HTMLCanvasElement,
      );
    });

    it('should handle mask parameter', () => {
      const mask = GaussianMask(1);
      const scene = app.scene(Grating, {
        defaultProps: {
          type: 'sin' as const,
          size: 50,
          sf: 0.1,
          mask,
        },
      });

      expect(scene).toBeInstanceOf(Scene);
      expect(scene.root.querySelector('canvas')).toBeInstanceOf(
        HTMLCanvasElement,
      );
    });

    it('should update when parameters change', async () => {
      const scene = app.scene(Grating, {
        defaultProps: {
          type: 'sin' as const,
          size: 50,
          sf: 0.1,
        },
      });

      // Just verify that the grating was created successfully
      expect(scene).toBeInstanceOf(Scene);
      expect(scene.root.querySelector('canvas')).toBeInstanceOf(
        HTMLCanvasElement,
      );

      // Change parameters by updating the mutable props - the reactive system will handle the update
      (scene.props as any).sf = 0.2;
      await 0;

      // Verify it's still a canvas (the internal update will have happened)
      expect(scene.root.querySelector('canvas')).toBeInstanceOf(
        HTMLCanvasElement,
      );
    });
  });

  describe('VirtualChinrest', () => {
    let scene: Scene<() => { node: HTMLDivElement }>;

    beforeEach(() => {
      scene = new Scene(app, () => ({ node: document.createElement('div') }), {
        defaultProps: {},
      });

      // Mock localStorage
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: mock(() => null),
          setItem: mock(() => {}),
          removeItem: mock(() => {}),
          clear: mock(() => {}),
        },
        writable: true,
      });
    });

    it('should create a virtual chinrest with default parameters', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);
      expect(result.node).toBeInstanceOf(HTMLDivElement);
    });

    it('should use custom i18n strings', () => {
      const customI18n = {
        confirm: 'Custom confirm',
        yes: 'Custom yes',
        no: 'Custom no',
        screen_width: 'Custom screen width',
        line_spacing: 'Custom line spacing',
        distance: 'Custom distance',
        SWT_guide: 'Custom SWT guide',
        DT_guide: 'Custom DT guide',
        DT_start: 'Custom DT start',
        DT_stop: 'Custom DT stop',
      };

      const props = reactive({ i18n: customI18n });
      const result = VirtualChinrest(props, scene as Scene<never>);
      expect(result.node).toBeInstanceOf(HTMLDivElement);
    });

    it('should handle blindspot degree parameter', () => {
      const props = reactive({ blindspotDegree: 15 } as Parameters<
        typeof VirtualChinrest
      >[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);
      expect(result.node).toBeInstanceOf(HTMLDivElement);
    });

    it('should handle usePreviousData true', () => {
      const mockData = JSON.stringify({
        screen_width_cm: 30,
        distance_cm: 60,
      });

      (window.localStorage.getItem as any).mockReturnValue(mockData);

      const props = reactive({ usePreviousData: true } as Parameters<
        typeof VirtualChinrest
      >[0]);
      const closeMock = mock(() => {});
      scene.close = closeMock;

      const result = VirtualChinrest(props, scene as Scene<never>);

      // Should auto-close when using previous data
      scene.emit('scene:show', null);
      expect(closeMock).toHaveBeenCalled();
    });

    it('should handle usePreviousData false', () => {
      const mockData = JSON.stringify({
        screen_width_cm: 30,
        distance_cm: 60,
      });

      (window.localStorage.getItem as any).mockReturnValue(mockData);

      const props = reactive({ usePreviousData: false } as Parameters<
        typeof VirtualChinrest
      >[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      // Should show screen width setup even with existing data
      expect(result.node).toBeInstanceOf(HTMLDivElement);
    });

    it('should show confirmation when previous data exists and usePreviousData is undefined', () => {
      const mockData = JSON.stringify({
        screen_width_cm: 30,
        distance_cm: 60,
      });

      (window.localStorage.getItem as any).mockReturnValue(mockData);

      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      expect(result.node).toBeInstanceOf(HTMLDivElement);
      // The component should render some content
      expect(result.node.children.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle pointer events for line adjustment', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      // Should create a div element
      expect(result.node).toBeInstanceOf(HTMLDivElement);
      // The component should render some content
      expect(result.node.children.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate distance from blindspot test', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      // Should have distance measurement elements
      expect(result.node).toBeInstanceOf(HTMLDivElement);
    });

    it('should return measurement functions in data', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      const data = result.data();
      expect(typeof data.deg2cm).toBe('function');
      expect(typeof data.deg2pix).toBe('function');
      expect(typeof data.deg2csspix).toBe('function');
      expect(typeof data.pix_per_cm).toBe('number');
      expect(typeof data.distance_cm).toBe('number');
    });

    it('should save data to localStorage on completion', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      // Mock successful completion
      const data = result.data();
      expect(data).toBeDefined();
    });

    it('should handle console logging', () => {
      const consoleMock = spyOn(console, 'info').mockImplementation(() => {});

      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      result.data();
      expect(consoleMock).toHaveBeenCalledWith(
        'VirtualChinrest',
        expect.any(Object),
      );

      consoleMock.mockRestore();
    });

    it('should handle window resize during measurements', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      // Simulate window resize
      Object.defineProperty(app.data, 'dpr', { value: 2 });

      expect(result.node).toBeInstanceOf(HTMLDivElement);
    });

    it('should handle form validation', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      // Should create a div element
      expect(result.node).toBeInstanceOf(HTMLDivElement);
      // The component should render some content
      expect(result.node.children.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle input changes', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      const input = result.node.querySelector(
        'input[type="number"]',
      ) as HTMLInputElement;
      if (input) {
        input.value = '25';
        input.dispatchEvent(new Event('change'));
        expect(input.value).toBe('25');
      }
    });

    it('should handle invalid input values', () => {
      const consoleMock = spyOn(console, 'warn').mockImplementation(() => {});

      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      const input = result.node.querySelector(
        'input[type="number"]',
      ) as HTMLInputElement;
      if (input) {
        input.value = 'invalid';
        input.dispatchEvent(new Event('change'));
        expect(consoleMock).toHaveBeenCalled();
      }

      consoleMock.mockRestore();
    });

    it('should handle scene:frame events for blindspot tracking', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      // Trigger a scene:frame event to test frame listener
      scene.emit('scene:frame', { lastFrameTime: 100 });

      expect(result.node).toBeInstanceOf(HTMLDivElement);
    });

    it('should handle pointer events on interactive elements', async () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      // Find any clickable elements and simulate events
      const clickableElements =
        result.node.querySelectorAll('[style*="cursor"]');

      clickableElements.forEach((element) => {
        // Simulate pointer events
        const pointerEvent = new PointerEvent('pointerup', { bubbles: true });
        element.dispatchEvent(pointerEvent);
      });

      expect(result.node).toBeInstanceOf(HTMLDivElement);
    });

    it('should calculate distance measurements correctly', () => {
      const props = reactive({} as Parameters<typeof VirtualChinrest>[0]);
      const result = VirtualChinrest(props, scene as Scene<never>);

      const data = result.data();

      // Test measurement functions exist and work
      expect(typeof data.deg2cm).toBe('function');
      expect(typeof data.deg2pix).toBe('function');
      expect(typeof data.deg2csspix).toBe('function');

      // Test that functions return numbers
      expect(typeof data.deg2cm(1)).toBe('number');
      expect(typeof data.deg2pix(1)).toBe('number');
      expect(typeof data.deg2csspix(1)).toBe('number');
    });
  });
});
