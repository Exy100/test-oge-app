import 'astro';

declare module 'astro' {
  interface ClientDirectives {
    'client:after-paint'?: boolean;
  }
}
