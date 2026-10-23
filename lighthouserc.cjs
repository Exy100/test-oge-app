const urls = [
  'http://127.0.0.1:4323/test-oge-app/',
  'http://127.0.0.1:4323/test-oge-app/materials/',
  'http://127.0.0.1:4323/test-oge-app/materials/i1/bits-bytes/',
  'http://127.0.0.1:4323/test-oge-app/materials/i1/text-encoding/',
  'http://127.0.0.1:4323/test-oge-app/materials/i1/changing-text/',
  'http://127.0.0.1:4323/test-oge-app/materials/i2/code-tables/',
  'http://127.0.0.1:4323/test-oge-app/materials/i2/decoding/',
  'http://127.0.0.1:4323/test-oge-app/materials/i2/unique-decoding/',
  'http://127.0.0.1:4323/test-oge-app/materials/i3/logic-operations/',
  'http://127.0.0.1:4323/test-oge-app/materials/i3/logic-negation/',
  'http://127.0.0.1:4323/test-oge-app/materials/i3/natural-solutions/',
  'http://127.0.0.1:4323/test-oge-app/materials/i4/graph-models/',
  'http://127.0.0.1:4323/test-oge-app/materials/i4/shortest-route/',
  'http://127.0.0.1:4323/test-oge-app/materials/i4/directed-paths/',
  'http://127.0.0.1:4323/test-oge-app/materials/i5/executor-commands/',
  'http://127.0.0.1:4323/test-oge-app/materials/i5/executor-algorithm/',
  'http://127.0.0.1:4323/test-oge-app/materials/i5/executor-reverse/',
  'http://127.0.0.1:4323/test-oge-app/materials/i5/executor-check/',
  'http://127.0.0.1:4323/test-oge-app/materials/i6/program-variables/',
  'http://127.0.0.1:4323/test-oge-app/materials/i6/program-conditions/',
  'http://127.0.0.1:4323/test-oge-app/materials/i6/program-loops/',
  'http://127.0.0.1:4323/test-oge-app/materials/i6/program-tracing/',
  'http://127.0.0.1:4323/test-oge-app/materials/i7/network-resources/',
  'http://127.0.0.1:4323/test-oge-app/materials/i7/url-parts/',
  'http://127.0.0.1:4323/test-oge-app/materials/i7/restore-address/',
  'http://127.0.0.1:4323/test-oge-app/materials/i8/search-operations/',
  'http://127.0.0.1:4323/test-oge-app/materials/i8/venn-diagrams/',
  'http://127.0.0.1:4323/test-oge-app/materials/i8/count-search-results/',
  'http://127.0.0.1:4323/test-oge-app/stream/',
  'http://127.0.0.1:4323/test-oge-app/variants/',
  'http://127.0.0.1:4323/test-oge-app/variants/V01/',
  'http://127.0.0.1:4323/test-oge-app/variants/V01/?exam=1',
  'http://127.0.0.1:4323/test-oge-app/variants/V01/?training=1',
  'http://127.0.0.1:4323/test-oge-app/variants/random/?seed=lighthouse-variant',
  'http://127.0.0.1:4323/test-oge-app/variants/print/?id=V01',
  'http://127.0.0.1:4323/test-oge-app/variants/V01/result/',
  'http://127.0.0.1:4323/test-oge-app/variants/random/result/',
];

const shard = process.env.OGE_LH_SHARD;
if (shard !== undefined && shard !== '1' && shard !== '2')
  throw new Error(
    'OGE_LH_SHARD должен быть 1 или 2; без него проверяются все URL.',
  );

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run preview -- --host 127.0.0.1 --port 4323',
      startServerReadyPattern: 'Local',
      url:
        shard === undefined
          ? urls
          : urls.filter((_, index) => index % 2 === Number(shard) - 1),
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
