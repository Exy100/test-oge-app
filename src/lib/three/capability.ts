let supported: boolean | undefined;
/** three r186 requires WebGL2. Release the temporary probe context. */
export function supportsWebGL2(): boolean {
  if (supported !== undefined) return supported;
  let context: WebGL2RenderingContext | null = null;
  try {
    context = document.createElement('canvas').getContext('webgl2');
    supported = context !== null && !context.isContextLost();
  } catch { supported = false; }
  finally { context?.getExtension('WEBGL_lose_context')?.loseContext(); }
  return supported;
}
