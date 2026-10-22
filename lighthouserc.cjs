module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run preview -- --host 127.0.0.1 --port 4323',
      startServerReadyPattern: 'Local',
      url: [
        'http://127.0.0.1:4323/test-oge-app/',
        'http://127.0.0.1:4323/test-oge-app/materials/',
        'http://127.0.0.1:4323/test-oge-app/stream/',
        'http://127.0.0.1:4323/test-oge-app/variants/',
        'http://127.0.0.1:4323/test-oge-app/variants/V01/',
        'http://127.0.0.1:4323/test-oge-app/variants/V01/?exam=1',
        'http://127.0.0.1:4323/test-oge-app/variants/V01/?training=1',
        'http://127.0.0.1:4323/test-oge-app/variants/random/?seed=lighthouse-variant',
        'http://127.0.0.1:4323/test-oge-app/variants/print/?id=V01',
        'http://127.0.0.1:4323/test-oge-app/variants/V01/result/',
        'http://127.0.0.1:4323/test-oge-app/variants/random/result/',
      ],
      numberOfRuns: 3,
      settings: { chromeFlags: '--headless --no-sandbox' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
};
