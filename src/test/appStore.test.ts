import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../stores/appStore';

describe('appStore', () => {
  beforeEach(() => {
    // Сброс store перед каждым тестом
    useAppStore.setState({
      filePath: null,
      content: '',
      isDirty: false,
      fontFamily: 'Segoe UI Variable',
      fontSize: 15,
      theme: 'system',
      language: 'ru',
      editorMode: 'visual',
      recentFiles: [],
      pageWidth: 816,
      s3: null,
      s3Verified: false,
      enabledPlugins: ['export-pdf'],
      removedBundledPlugins: [],
    });
  });

  it('должен иметь значения по умолчанию', () => {
    const state = useAppStore.getState();
    expect(state.filePath).toBeNull();
    expect(state.content).toBe('');
    expect(state.isDirty).toBe(false);
    expect(state.fontFamily).toBe('Segoe UI Variable');
    expect(state.fontSize).toBe(15);
    expect(state.theme).toBe('system');
    expect(state.language).toBe('ru');
    expect(state.editorMode).toBe('visual');
    expect(state.recentFiles).toEqual([]);
    expect(state.enabledPlugins).toEqual(['export-pdf']);
    expect(state.removedBundledPlugins).toEqual([]);
  });

  it('setContent — должен обновлять контент и ставить isDirty', () => {
    useAppStore.getState().setContent('# Привет');
    const state = useAppStore.getState();
    expect(state.content).toBe('# Привет');
    expect(state.isDirty).toBe(true);
  });

  it('setFilePath — должен обновлять путь к файлу', () => {
    useAppStore.getState().setFilePath('C:\\test\\file.md');
    expect(useAppStore.getState().filePath).toBe('C:\\test\\file.md');
  });

  it('setDirty — должен управлять флагом изменений', () => {
    useAppStore.getState().setDirty(true);
    expect(useAppStore.getState().isDirty).toBe(true);
    useAppStore.getState().setDirty(false);
    expect(useAppStore.getState().isDirty).toBe(false);
  });

  it('setFontFamily — должен обновлять шрифт', () => {
    useAppStore.getState().setFontFamily('Cascadia Code');
    expect(useAppStore.getState().fontFamily).toBe('Cascadia Code');
  });

  it('setFontSize — должен обновлять размер шрифта', () => {
    useAppStore.getState().setFontSize(20);
    expect(useAppStore.getState().fontSize).toBe(20);
  });

  it('setTheme — должен переключать тему', () => {
    useAppStore.getState().setTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
    useAppStore.getState().setTheme('light');
    expect(useAppStore.getState().theme).toBe('light');
  });

  it('setLanguage — должен переключать язык', () => {
    useAppStore.getState().setLanguage('en');
    expect(useAppStore.getState().language).toBe('en');
    useAppStore.getState().setLanguage('ru');
    expect(useAppStore.getState().language).toBe('ru');
  });

  it('setEditorMode — должен переключать режим редактора', () => {
    useAppStore.getState().setEditorMode('source');
    expect(useAppStore.getState().editorMode).toBe('source');
    useAppStore.getState().setEditorMode('visual');
    expect(useAppStore.getState().editorMode).toBe('visual');
  });

  it('setRecentFiles — должен обновлять список недавних файлов', () => {
    const files = ['file1.md', 'file2.md'];
    useAppStore.getState().setRecentFiles(files);
    expect(useAppStore.getState().recentFiles).toEqual(files);
  });

  it('setEnabledPlugins — должен обновлять список включённых плагинов без дублей', () => {
    useAppStore.getState().setEnabledPlugins(['export-pdf', 'export-pdf']);
    expect(useAppStore.getState().enabledPlugins).toEqual(['export-pdf']);
  });

  it('setPluginEnabled — должен включать и выключать плагин без дублей', () => {
    const store = useAppStore.getState();
    store.setEnabledPlugins([]);
    store.setBundledPluginRemoved('export-pdf', true);
    store.setPluginEnabled('export-pdf', true);
    store.setPluginEnabled('export-pdf', true);
    expect(useAppStore.getState().enabledPlugins).toEqual(['export-pdf']);
    expect(useAppStore.getState().removedBundledPlugins).toEqual([]);
    store.setPluginEnabled('export-pdf', false);
    expect(useAppStore.getState().enabledPlugins).toEqual([]);
  });

  it('setBundledPluginRemoved — должен запоминать удалённые bundled-плагины без дублей', () => {
    const store = useAppStore.getState();
    store.setBundledPluginRemoved('export-pdf', true);
    store.setBundledPluginRemoved('export-pdf', true);
    expect(useAppStore.getState().removedBundledPlugins).toEqual(['export-pdf']);
    store.setBundledPluginRemoved('export-pdf', false);
    expect(useAppStore.getState().removedBundledPlugins).toEqual([]);
  });

  it('мигрирует старый document-designer в export-pdf', () => {
    useAppStore.getState().setEnabledPlugins(['document-designer', 'export-pdf']);
    expect(useAppStore.getState().enabledPlugins).toEqual(['export-pdf']);
  });

  it('updateSettings — должен обновлять настройки из объекта Settings', () => {
    useAppStore.getState().updateSettings({
      font_family: 'Georgia',
      font_size: 18,
      theme: 'dark',
      language: 'en',
      recent_files: ['test.md'],
      enabled_plugins: ['export-pdf'],
      removed_bundled_plugins: ['document-designer'],
    });
    const state = useAppStore.getState();
    expect(state.fontFamily).toBe('Georgia');
    expect(state.fontSize).toBe(18);
    expect(state.theme).toBe('dark');
    expect(state.language).toBe('en');
    expect(state.recentFiles).toEqual(['test.md']);
    expect(state.enabledPlugins).toEqual(['export-pdf']);
    expect(state.removedBundledPlugins).toEqual(['export-pdf']);
  });

  it('updateSettings — частичное обновление не затирает остальные поля', () => {
    useAppStore.getState().setFontFamily('Consolas');
    useAppStore.getState().setLanguage('en');
    useAppStore.getState().updateSettings({
      font_family: undefined as unknown as string,
      font_size: 22,
      theme: 'light',
      language: undefined as unknown as 'ru',
      recent_files: [],
    });
    const state = useAppStore.getState();
    expect(state.fontFamily).toBe('Consolas');
    expect(state.language).toBe('en');
    expect(state.fontSize).toBe(22);
  });
});
