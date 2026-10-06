const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const output = execFileSync(
  'npm',
  ['pack', '--dry-run', '--ignore-scripts', '--json'],
  {
    cwd: require('node:path').resolve(__dirname, '..'),
    encoding: 'utf8',
  },
);
const [packed] = JSON.parse(output.slice(output.indexOf('[')));
const paths = packed.files.map(file => file.path);
const modules = ['index', 'model', 'blocks', 'useHtmlDocument', 'NativeHtml', 'NativeHtmlList'];
const expected = new Set(['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md']);
for (const name of modules) {
  expected.add(`lib/${name}.js`);
  expected.add(`lib/${name}.d.ts`);
  expected.add(`src/${name}.${name.startsWith('NativeHtml') ? 'tsx' : 'ts'}`);
}
assert.deepEqual(new Set(paths), expected, 'Unexpected or missing package files');
for (const entry of [pkg.main, pkg.types, pkg['react-native']]) assert(expected.has(entry));
assert.equal(pkg.name, '@kasiri182/react-native-html');
assert.equal(pkg.license, 'MIT');
assert(!pkg.private);
console.log(`Package allowlist passed: ${paths.length} files, ${packed.size} packed bytes.`);
