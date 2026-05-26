import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('markdown-toc plugin styles', () => {
  it('использует непрозрачный фон для модального окна содержания', () => {
    const css = readFileSync(resolve(process.cwd(), 'plugins/markdown-toc/style.css'), 'utf8');
    const dialogRule = css.match(/\.markdown-toc-dialog\s*\{[^}]*\}/)?.[0] ?? '';

    expect(dialogRule).toContain('background: var(--bg-primary);');
    expect(dialogRule).not.toContain('background: var(--bg-secondary);');
  });
});
