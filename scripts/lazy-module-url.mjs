/** Emit an ESM entry URL so a failed browser import can use a fresh request. */
export function lazyModuleUrl() {
  const suffix = '?module-url';
  let build = false;
  return {
    name: 'lazy-module-url',
    configResolved(config) {
      build = config.command === 'build';
    },
    async resolveId(source, importer) {
      if (!source.endsWith(suffix)) return;
      const resolved = await this.resolve(
        source.slice(0, -suffix.length),
        importer,
      );
      if (!resolved) throw new Error('Lazy module could not be resolved.');
      return resolved.id + suffix;
    },
    load(id) {
      if (!id.endsWith(suffix)) return;
      const source = id.slice(0, -suffix.length);
      if (!build) return `export default ${JSON.stringify('/@fs' + source)};`;
      const reference = this.emitFile({
        type: 'chunk',
        id: source,
        name: 'RandomVariantContent',
        preserveSignature: 'exports-only',
      });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
  };
}
