export interface WebGLResources {
  contexts: number;
  resources: number;
  buffers: number;
  textures: number;
  programs: number;
  shaders: number;
  draws: number;
  allocations: number;
  losses: number;
}
declare global {
  interface Window {
    webGLResources: () => WebGLResources;
  }
}
/** Track actual driver handles independently of three's own memory counters. */
export function installWebGLAudit() {
  type GL = WebGLRenderingContext | WebGL2RenderingContext;
  const contexts = new Map<GL, Map<string, Set<object>>>();
  let draws = 0;
  let allocations = 0;
  let losses = 0;
  function owned(gl: GL) {
    if (gl.isContextLost()) return undefined;
    let resources = contexts.get(gl);
    if (!resources) {
      resources = new Map();
      contexts.set(gl, resources);
      gl.canvas.addEventListener(
        'webglcontextlost',
        () => {
          contexts.delete(gl);
          losses++;
        },
        { once: true },
      );
    }
    return resources;
  }
  const originalContext: unknown = Reflect.get(
    HTMLCanvasElement.prototype,
    'getContext',
  );
  if (typeof originalContext !== 'function') throw new Error('Нет Canvas API.');
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: function (this: HTMLCanvasElement, ...args: unknown[]): unknown {
      const result: unknown = Reflect.apply(originalContext, this, args);
      if (
        (typeof WebGL2RenderingContext !== 'undefined' &&
          result instanceof WebGL2RenderingContext) ||
        (typeof WebGLRenderingContext !== 'undefined' &&
          result instanceof WebGLRenderingContext)
      )
        owned(result);
      return result;
    },
  });
  const kinds = [
    'Buffer',
    'Texture',
    'Program',
    'Shader',
    'Framebuffer',
    'Renderbuffer',
    'VertexArray',
    'Sampler',
    'Query',
    'TransformFeedback',
  ];
  const prototypes = [
    ...(typeof WebGLRenderingContext === 'undefined'
      ? []
      : [WebGLRenderingContext.prototype]),
    ...(typeof WebGL2RenderingContext === 'undefined'
      ? []
      : [WebGL2RenderingContext.prototype]),
  ];
  for (const prototype of prototypes) {
    for (const kind of kinds)
      for (const operation of ['create', 'delete']) {
        const original: unknown = Reflect.get(prototype, operation + kind);
        if (typeof original !== 'function') continue;
        Object.defineProperty(prototype, operation + kind, {
          configurable: true,
          writable: true,
          value: function (this: GL, ...args: unknown[]): unknown {
            const result: unknown = Reflect.apply(original, this, args);
            const resources = owned(this);
            if (resources) {
              let handles = resources.get(kind);
              if (!handles) {
                handles = new Set();
                resources.set(kind, handles);
              }
              if (
                operation === 'create' &&
                result !== null &&
                typeof result === 'object'
              ) {
                handles.add(result);
                allocations++;
              } else if (
                operation === 'delete' &&
                args[0] !== null &&
                typeof args[0] === 'object'
              )
                handles.delete(args[0]);
            }
            return result;
          },
        });
      }
    for (const name of [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
    ]) {
      const original: unknown = Reflect.get(prototype, name);
      if (typeof original !== 'function') continue;
      Object.defineProperty(prototype, name, {
        configurable: true,
        writable: true,
        value: function (this: GL, ...args: unknown[]): unknown {
          if (!this.isContextLost()) draws++;
          return Reflect.apply(original, this, args);
        },
      });
    }
  }
  window.webGLResources = () => {
    const count = (kind?: string) =>
      [...contexts]
        .filter(([gl]) => !gl.isContextLost())
        .reduce(
          (sum, [, resources]) =>
            sum +
            (kind
              ? (resources.get(kind)?.size ?? 0)
              : [...resources.values()].reduce(
                  (n, entries) => n + entries.size,
                  0,
                )),
          0,
        );
    return {
      contexts: [...contexts.keys()].filter((gl) => !gl.isContextLost()).length,
      resources: count(),
      buffers: count('Buffer'),
      textures: count('Texture'),
      programs: count('Program'),
      shaders: count('Shader'),
      draws,
      allocations,
      losses,
    };
  };
}
export function disableWebGL() {
  const original: unknown = Reflect.get(
    HTMLCanvasElement.prototype,
    'getContext',
  );
  if (typeof original !== 'function') throw new Error('Нет Canvas API.');
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: function (
      this: HTMLCanvasElement,
      context: string,
      ...args: unknown[]
    ): unknown {
      return /^(?:webgl2?|experimental-webgl)$/u.test(context)
        ? null
        : Reflect.apply(original, this, [context, ...args]);
    },
  });
}
