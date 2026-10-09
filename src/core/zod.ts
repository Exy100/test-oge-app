import { z } from 'zod';

// Strict CSP forbids even a caught dynamic-compilation capability probe.
z.config({ jitless: true });

export { z };
