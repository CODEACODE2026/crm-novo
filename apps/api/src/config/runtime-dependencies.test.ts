import { builtinModules } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const apiRoot = resolve(__dirname, '../..');
const srcRoot = join(apiRoot, 'src');
const packageJson = JSON.parse(
  readFileSync(join(apiRoot, 'package.json'), 'utf8'),
) as PackageManifest;
const builtinNames = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);

describe('runtime dependency manifest contract', () => {
  it('declares every external runtime import used by API source files', () => {
    const declaredRuntimeDependencies = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
    ]);

    const missing = collectRuntimeImports(srcRoot)
      .filter((runtimeImport) => !isBuiltin(runtimeImport.specifier))
      .filter((runtimeImport) => !isRelative(runtimeImport.specifier))
      .filter(
        (runtimeImport) => !declaredRuntimeDependencies.has(packageName(runtimeImport.specifier)),
      )
      .map(
        (runtimeImport) =>
          `${relative(apiRoot, runtimeImport.file)} imports ${runtimeImport.specifier}`,
      );

    expect(missing).toEqual([]);
  });
});

function collectRuntimeImports(directory: string) {
  const imports: Array<{ file: string; specifier: string }> = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      imports.push(...collectRuntimeImports(path));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }

    imports.push(...runtimeImportsFromFile(path));
  }

  return imports;
}

function runtimeImportsFromFile(file: string) {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: Array<{ file: string; specifier: string }> = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      !node.importClause?.isTypeOnly &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({ file, specifier: node.moduleSpecifier.text });
    }

    if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({ file, specifier: node.moduleSpecifier.text });
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;

      if (specifier && ts.isStringLiteral(specifier)) {
        imports.push({ file, specifier: specifier.text });
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      const [specifier] = node.arguments;

      if (specifier && ts.isStringLiteral(specifier)) {
        imports.push({ file, specifier: specifier.text });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
}

function isBuiltin(specifier: string) {
  return builtinNames.has(specifier);
}

function isRelative(specifier: string) {
  return specifier.startsWith('.') || specifier.startsWith('/');
}

function packageName(specifier: string) {
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    return `${parts[0]}/${parts[1]}`;
  }

  return parts[0] ?? specifier;
}
