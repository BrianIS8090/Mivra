import { describe, expect, it } from 'vitest';
import { resolveMarkdownImageBaseDir } from '../utils/paths';

describe('paths', () => {
  it('для markdown-картинок использует директорию файла, а не asset baseDir', () => {
    expect(
      resolveMarkdownImageBaseDir(
        'C:\\Users\\Brian\\Downloads\\13_Руди_коробки\\13_Руди_коробки.md',
        'C:\\Users\\Brian\\Downloads',
      ),
    ).toBe('C:\\Users\\Brian\\Downloads\\13_Руди_коробки');
  });

  it('для несохранённого файла оставляет fallback baseDir', () => {
    expect(resolveMarkdownImageBaseDir(null, 'C:\\Users\\Brian\\Downloads')).toBe(
      'C:\\Users\\Brian\\Downloads',
    );
  });
});
