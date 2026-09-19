// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('keeps request code behind the identity repository, including dynamic imports', () => {
  const violations: string[] = [];
  const root = join(process.cwd(), 'app');
  const visitDirectory = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = relative(root, path).replaceAll('\\', '/');
      // Model/bootstrap/inspection and adapter implementations own Mongo access.
      if (name === 'server/db' || name === 'server/repositories/identity') continue;
      if (entry.isDirectory()) {
        visitDirectory(path);
        continue;
      }
      if (!/\.tsx?$/.test(name) || name === 'routeTree.gen.ts') continue;
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      const visitNode = (node: ts.Node) => {
        const module =
          ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
            ? node.moduleSpecifier
            : ts.isCallExpression(node) &&
                (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                  (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
              ? node.arguments[0]
              : undefined;
        if (
          module &&
          ts.isStringLiteral(module) &&
          /(?:^|\/)models\/User(?:\.ts)?$/.test(module.text)
        )
          violations.push(name);
        // Identity-only orchestration must not gate itself on another store's
        // connection. Mixed campaign/session handlers retain their domain checks.
        if (
          ['server/utils/oauth.ts', 'utils/require-actor.ts'].includes(name) &&
          module &&
          ts.isStringLiteral(module) &&
          /(?:^|\/)db\/connection(?:\.ts)?$/.test(module.text)
        )
          violations.push(name);
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'collection' &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0]) &&
          node.arguments[0].text === 'users'
        )
          violations.push(name);
        ts.forEachChild(node, visitNode);
      };
      visitNode(source);
    }
  };
  visitDirectory(root);
  expect(violations).toEqual([]);
});
