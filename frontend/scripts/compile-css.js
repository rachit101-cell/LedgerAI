const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const frontendRoot = path.resolve(__dirname, '..');
const req = createRequire(path.join(frontendRoot, 'package.json'));

const { compile } = req('@tailwindcss/node');
const { Scanner } = req('@tailwindcss/oxide');

async function buildCSS() {
  const inputCssPath = path.join(frontendRoot, 'app', 'globals.template.css');
  if (!fs.existsSync(inputCssPath)) {
    // If template doesn't exist yet, save current globals.css as template
    const currentCss = fs.readFileSync(path.join(frontendRoot, 'app', 'globals.css'), 'utf-8');
    fs.writeFileSync(inputCssPath, currentCss, 'utf-8');
  }

  const rawCss = fs.readFileSync(inputCssPath, 'utf-8');
  
  console.log('[compile-css] Compiling Tailwind CSS v4 AST...');
  const compiler = await compile(rawCss, {
    base: frontendRoot,
    from: inputCssPath,
    onDependency: () => {}
  });

  console.log('[compile-css] Scanning source files for class candidates...');
  const scanner = new Scanner({
    sources: [
      { base: frontendRoot, pattern: 'app/**/*.{ts,tsx}', negated: false },
      { base: frontendRoot, pattern: 'components/**/*.{ts,tsx}', negated: false },
      { base: frontendRoot, pattern: 'lib/**/*.{ts,tsx}', negated: false }
    ]
  });

  const candidates = Array.from(scanner.scan());
  console.log(`[compile-css] Scanned ${candidates.length} unique candidates.`);

  const generatedCss = compiler.build(candidates);

  const outputPath = path.join(frontendRoot, 'app', 'globals.css');
  fs.writeFileSync(outputPath, generatedCss, 'utf-8');
  console.log(`[compile-css] Successfully wrote ${generatedCss.length} bytes to app/globals.css!`);
}

buildCSS().catch((err) => {
  console.error('[compile-css] Error compiling CSS:', err);
  process.exit(1);
});

