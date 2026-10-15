
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { transform } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const files = [
  'app-state.js',
  'app-ui.js',
  'serial.js',
  'commands.js',
  'logs.js',
  'opfs-log.js',
  'settings.js',
  'quick-command.js',
  'app.js'
];

const fileWorker = 'opfs-log-worker.js';

await mkdir(dist, { recursive: true });

// JS 파일을 지정한 순서대로 읽기
const sources = await Promise.all(
  files.map(file => readFile(path.join(root, file), 'utf8'))
);

// 순서를 유지하며 통합
const source = sources.join('\n;\n');

// Minify
const result = await transform(source, {
  minify: true,
  target: 'es2022',
  legalComments: 'none'
});

await writeFile(path.join(dist, 'app.min.js'), result.code);

// -- Worker
// Worker Minify
const workerSource = await readFile(
  path.join(root, fileWorker),
  'utf8'
);

const workerResult = await transform(workerSource, {
  minify: true,
  target: 'es2022',
  legalComments: 'none'
});

await writeFile(
  path.join(dist, fileWorker),
  workerResult.code
);

// -- index.html
const html = await readFile(path.join(root, 'index.html'), 'utf8');

const distHtml = html.replace(
  /<!-- Script Area Start -->[\s\S]*?<!-- Script Area End -->/,
  `<!-- Script Area Start -->
    <script src="app.min.js"></script>
    <!-- Script Area End -->`
);

if (distHtml === html) {
  throw new Error('index.html에서 Script Area를 찾지 못했습니다.');
}

await writeFile(path.join(dist, 'index.html'), distHtml);

// -- css
await copyFile(
  path.join(root, 'style.css'),
  path.join(dist, 'style.css')
);

console.log('Build complete:', dist);
