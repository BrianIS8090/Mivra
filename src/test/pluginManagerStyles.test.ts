import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PluginManager styles', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/PluginManager/plugin-manager.css'), 'utf8');

  it('не допускает горизонтальный скролл списка плагинов', () => {
    expect(css).toContain('overflow-x: hidden;');
    expect(css).not.toContain('overflow: auto;');
  });

  it('перебивает базовое ограничение ширины общего диалога', () => {
    expect(css).toContain('.dialog.plugin-manager');
    expect(css).toContain('max-width: min(1040px, calc(100vw - 40px));');
  });

  it('перестраивает карточку плагина по ширине контейнера', () => {
    expect(css).toContain('@container (max-width: 720px)');
    expect(css).toContain('grid-template-columns: 1fr;');
    expect(css).not.toContain('grid-template-columns: minmax(360px, 1fr) 190px;');
  });

  it('даёт описанию переноситься вместо обрезки', () => {
    expect(css).toContain('overflow-wrap: anywhere;');
  });
});
