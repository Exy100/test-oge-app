/** Small catalogue metadata shared by navigation and the variant builder. */
export const VARIANT_VERSION = 'informatics-variant-v1';
export const fixedVariants = Object.freeze(
  Array.from({ length: 10 }, (_, index) => {
    const id = `V${String(index + 1).padStart(2, '0')}`;
    return Object.freeze({ id, seed: `${VARIANT_VERSION}:${id}` });
  }),
);
