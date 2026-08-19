import { describe, expect, it } from 'vitest';
import {
  findMatches,
  findNearestIndex,
  nextMatchIndex,
  prevMatchIndex,
  replaceAllMatchesInText,
  replaceMatchInText,
} from '../components/Editor/editorSearch';

describe('findMatches', () => {
  it('находит все вхождения без учёта регистра', () => {
    expect(findMatches('Foo foo FOO', 'foo', false)).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 11 },
    ]);
  });

  it('с учётом регистра отбрасывает несовпадающие по кейсу варианты', () => {
    expect(findMatches('Foo foo FOO', 'foo', true)).toEqual([{ from: 4, to: 7 }]);
  });

  it('пустой запрос не даёт совпадений', () => {
    expect(findMatches('foo', '', false)).toEqual([]);
  });

  it('возвращает пустой массив, когда совпадений нет', () => {
    expect(findMatches('bar baz', 'foo', false)).toEqual([]);
  });

  it('трактует запрос литерально, без regex-семантики', () => {
    expect(findMatches('a.c a*c', 'a.c', false)).toEqual([{ from: 0, to: 3 }]);
    expect(findMatches('aaa', 'a.c', false)).toEqual([]);
  });

  it('не считает пересекающиеся вхождения', () => {
    expect(findMatches('aaaa', 'aa', false)).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ]);
    expect(findMatches('aaa', 'aa', false)).toEqual([{ from: 0, to: 2 }]);
  });

  it('работает с кириллицей и смешанным регистром', () => {
    expect(findMatches('Привет, ПРИВЕТ', 'привет', false)).toEqual([
      { from: 0, to: 6 },
      { from: 8, to: 14 },
    ]);
  });
});

describe('nextMatchIndex / prevMatchIndex', () => {
  it('двигаются вперёд и назад с wrap-around', () => {
    expect(nextMatchIndex(3, 0)).toBe(1);
    expect(nextMatchIndex(3, 2)).toBe(0);
    expect(prevMatchIndex(3, 0)).toBe(2);
    expect(prevMatchIndex(3, 2)).toBe(1);
  });

  it('без текущего индекса стартуют с края списка', () => {
    expect(nextMatchIndex(3, -1)).toBe(0);
    expect(prevMatchIndex(3, -1)).toBe(2);
  });

  it('при пустом списке возвращают -1', () => {
    expect(nextMatchIndex(0, 0)).toBe(-1);
    expect(prevMatchIndex(0, -1)).toBe(-1);
  });
});

describe('findNearestIndex', () => {
  const matches = [
    { from: 2, to: 4 },
    { from: 10, to: 12 },
    { from: 20, to: 22 },
  ];

  it('выбирает первое совпадение не раньше позиции', () => {
    expect(findNearestIndex(matches, 0)).toBe(0);
    expect(findNearestIndex(matches, 5)).toBe(1);
    expect(findNearestIndex(matches, 10)).toBe(1);
  });

  it('после последнего совпадения уходит на первое (wrap-around)', () => {
    expect(findNearestIndex(matches, 25)).toBe(0);
  });

  it('при пустом списке возвращает -1', () => {
    expect(findNearestIndex([], 0)).toBe(-1);
  });
});

describe('replaceMatchInText', () => {
  it('заменяет одно совпадение', () => {
    expect(replaceMatchInText('foo bar foo', { from: 0, to: 3 }, 'baz')).toBe('baz bar foo');
  });

  it('пустая замена удаляет совпадение', () => {
    expect(replaceMatchInText('foo bar', { from: 0, to: 4 }, '')).toBe('bar');
  });
});

describe('replaceAllMatchesInText', () => {
  it('заменяет все совпадения за один проход', () => {
    const matches = findMatches('foo bar foo', 'foo', false);
    expect(replaceAllMatchesInText('foo bar foo', matches, 'baz')).toBe('baz bar baz');
  });

  it('корректна при замене на более длинный текст', () => {
    const matches = findMatches('aa aa', 'aa', false);
    expect(replaceAllMatchesInText('aa aa', matches, 'bbbb')).toBe('bbbb bbbb');
  });

  it('не зацикливается, когда замена содержит запрос', () => {
    const matches = findMatches('a a', 'a', false);
    expect(replaceAllMatchesInText('a a', matches, 'aa')).toBe('aa aa');
  });

  it('пустой список совпадений оставляет текст без изменений', () => {
    expect(replaceAllMatchesInText('foo', [], 'bar')).toBe('foo');
  });
});
