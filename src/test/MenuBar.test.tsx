import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuBar, computeSubmenuPlacement, shouldFlipSubmenu } from '../components/MenuBar/MenuBar';
import { useFile } from '../hooks/useFile';
import { useAppStore } from '../stores/appStore';
import { usePluginStore } from '../plugins/pluginStore';

// Файловые действия меню-бара подменяем моками — проверяем именно вызовы,
// а не их реализацию (реализация useFile покрыта своими тестами).
vi.mock('../hooks/useFile', () => ({
  useFile: vi.fn(),
}));

// Диалоги подменяем лёгкими заглушками: меню-бар владеет только их открытием.
vi.mock('../components/S3Settings/S3SettingsDialog', () => ({
  S3SettingsDialog: () => <div data-testid="s3-settings-dialog" />,
}));
vi.mock('../components/Help/HelpDialog', () => ({
  HelpDialog: () => <div data-testid="help-dialog" />,
}));
vi.mock('../components/PluginManager/PluginManagerDialog', () => ({
  PluginManagerDialog: () => <div data-testid="plugin-manager-dialog" />,
}));

const mockedUseFile = vi.mocked(useFile);

describe('MenuBar', () => {
  const openMock = vi.fn();
  const saveMock = vi.fn();
  const saveAsMock = vi.fn();
  const reloadMock = vi.fn();
  const openPathMock = vi.fn();
  const printMock = vi.fn();
  const onFind = vi.fn();
  const onReplace = vi.fn();

  // Настройка мока useFile; filePath подставляется по тесту
  // (от него зависит disabled у пункта «Обновить с диска»).
  const mockUseFile = (filePath: string | null = null) => {
    mockedUseFile.mockReturnValue({
      filePath,
      content: '',
      isDirty: false,
      open: openMock,
      openPath: openPathMock,
      save: saveMock,
      saveAs: saveAsMock,
      reload: reloadMock,
      insertAsset: vi.fn(),
      setContent: vi.fn(),
    });
  };

  const renderMenuBar = () =>
    render(<MenuBar onFind={onFind} onReplace={onReplace} />);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    window.print = printMock;
    mockUseFile();
    useAppStore.setState({
      filePath: null,
      content: '',
      isDirty: false,
      theme: 'system',
      language: 'ru',
      editorMode: 'visual',
      recentFiles: [],
      autosave: false,
      s3: null,
      s3Verified: false,
      enabledPlugins: ['export-pdf'],
    });
    usePluginStore.setState({
      toolbarButtons: [],
      dialogs: [],
      openDialogs: [],
    });
  });

  it('рендерит menubar с шестью топ-пунктами, меню открывается по клику', () => {
    renderMenuBar();

    expect(screen.getByRole('menubar')).toBeInTheDocument();
    for (const name of ['Файл', 'Правка', 'Вид', 'Плагины', 'Сервис', 'Справка']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));

    const menu = screen.getByRole('menu', { name: 'Файл' });
    expect(within(menu).getByRole('menuitem', { name: 'Открыть' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Файл' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('повторный клик по топ-пункту закрывает меню', () => {
    renderMenuBar();

    const trigger = screen.getByRole('button', { name: 'Файл' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Файл' })).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('Esc закрывает меню и гасит событие (координация слоёв F1)', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
    expect(screen.getByRole('menu', { name: 'Файл' })).toBeInTheDocument();

    // Слушатель добавлен ПОСЛЕ открытия меню — выполнится после слушателя
    // меню-бара и увидит уже погашенное событие.
    let wasPrevented: boolean | null = null;
    document.addEventListener('keydown', (e) => {
      wasPrevented = e.defaultPrevented;
    });
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(wasPrevented).toBe(true);
  });

  it('Esc, уже обработанный другим слоем, меню не закрывает', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    // Имитация слоя выше (SearchPanel и т.п.): событие уже погашено до document.
    event.preventDefault();
    document.body.dispatchEvent(event);

    expect(screen.getByRole('menu', { name: 'Файл' })).toBeInTheDocument();
  });

  it('меню закрывается по клику вне меню-бара', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
    expect(screen.getByRole('menu', { name: 'Файл' })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('при открытом меню hover по соседнему топ-пункту переключает меню', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
    expect(screen.getByRole('menu', { name: 'Файл' })).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Вид' }));

    expect(screen.queryByRole('menu', { name: 'Файл' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu', { name: 'Вид' })).toBeInTheDocument();
  });

  it('hover по топ-пункту при закрытых меню ничего не открывает', () => {
    renderMenuBar();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Вид' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Файл → Открыть вызывает open() и закрывает меню', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Открыть' }));

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Файл → Сохранить вызывает save()', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Сохранить' }));

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Файл → Сохранить как вызывает saveAs()', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Сохранить как' }));

    expect(saveAsMock).toHaveBeenCalledTimes(1);
  });

  it('Файл → Печать вызывает window.print()', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Печать' }));

    expect(printMock).toHaveBeenCalledTimes(1);
  });

  it('Файл → Обновить с диска неактивен без открытого файла', () => {
    mockUseFile(null);
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));

    const item = screen.getByRole('menuitem', { name: 'Обновить с диска' });
    expect(item).toBeDisabled();
    fireEvent.click(item);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('Файл → Обновить с диска вызывает reload() при открытом файле', () => {
    mockUseFile('C:\\docs\\a.md');
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));

    const item = screen.getByRole('menuitem', { name: 'Обновить с диска' });
    expect(item).toBeEnabled();
    fireEvent.click(item);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('Правка → Найти вызывает onFind, Заменить — onReplace', () => {
    renderMenuBar();

    fireEvent.click(screen.getByRole('button', { name: 'Правка' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Найти…' }));
    expect(onFind).toHaveBeenCalledTimes(1);
    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Правка' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Заменить…' }));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onFind).toHaveBeenCalledTimes(1);
  });

  it('Вид → Тема: подменю с тремя темами, ✓ на активной, выбор меняет стор', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Вид' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Тема' }));

    const submenu = screen.getByRole('menu', { name: 'Тема' });
    const light = within(submenu).getByRole('menuitemradio', { name: 'Светлая' });
    const dark = within(submenu).getByRole('menuitemradio', { name: 'Тёмная' });
    const system = within(submenu).getByRole('menuitemradio', { name: 'Системная' });

    expect(light).toHaveAttribute('aria-checked', 'false');
    expect(dark).toHaveAttribute('aria-checked', 'false');
    expect(system).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(dark);
    expect(useAppStore.getState().theme).toBe('dark');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Вид → Режим редактора переключает editorMode', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Вид' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Режим редактора' }));

    expect(useAppStore.getState().editorMode).toBe('source');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Плагины: кнопки плагинов из pluginStore вызывают свои onClick', () => {
    const exportPdfClick = vi.fn();
    const testPluginClick = vi.fn();
    usePluginStore.setState({
      toolbarButtons: [
        {
          id: 'open-export-pdf',
          pluginId: 'export-pdf',
          label: 'Export PDF',
          title: 'Экспортировать документ в PDF',
          order: 10,
          onClick: exportPdfClick,
        },
        {
          id: 'open-test-plugin',
          pluginId: 'test-plugin',
          label: 'Test Plugin',
          title: 'Открыть Test Plugin',
          order: 20,
          onClick: testPluginClick,
        },
      ],
    });

    renderMenuBar();

    expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Плагины' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export PDF' }));

    expect(exportPdfClick).toHaveBeenCalledTimes(1);
    expect(testPluginClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Плагины: пустой список — заглушка, Менеджер плагинов открывает диалог', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Плагины' }));

    expect(screen.getByText('Нет активных плагинов')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Менеджер плагинов' }));
    expect(screen.getByTestId('plugin-manager-dialog')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Сервис → Настройки S3 открывает диалог настроек', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Сервис' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Настройки S3' }));

    expect(screen.getByTestId('s3-settings-dialog')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Сервис → Автосохранение: чекбокс-пункт переключает autosave в сторе', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Сервис' }));

    const item = screen.getByRole('menuitemcheckbox', { name: 'Автосохранение' });
    expect(item).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(item);
    expect(useAppStore.getState().autosave).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Сервис → Язык: подменю Русский/English с ✓ на активном', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Сервис' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Язык' }));

    const submenu = screen.getByRole('menu', { name: 'Язык' });
    expect(within(submenu).getByRole('menuitemradio', { name: 'Русский' }))
      .toHaveAttribute('aria-checked', 'true');
    expect(within(submenu).getByRole('menuitemradio', { name: 'English' }))
      .toHaveAttribute('aria-checked', 'false');

    fireEvent.click(within(submenu).getByRole('menuitemradio', { name: 'English' }));
    expect(useAppStore.getState().language).toBe('en');
  });

  it('Справка → Справка открывает HelpDialog', () => {
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Справка' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Справка' }));

    expect(screen.getByTestId('help-dialog')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Файл → Недавние: пункты из recentFiles, клик вызывает openPath', () => {
    useAppStore.setState({ recentFiles: ['C:\\docs\\alpha.md', 'C:\\docs\\beta.md'] });
    renderMenuBar();

    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Недавние' }));

    const submenu = screen.getByRole('menu', { name: 'Недавние' });
    const alpha = within(submenu).getByRole('menuitem', { name: 'alpha.md' });
    expect(alpha).toHaveAttribute('title', 'C:\\docs\\alpha.md');
    expect(within(submenu).getByRole('menuitem', { name: 'beta.md' })).toBeInTheDocument();

    fireEvent.click(alpha);
    expect(openPathMock).toHaveBeenCalledWith('C:\\docs\\alpha.md');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('клавиатура: Down/Up двигают фокус по пунктам, Right переключает топ-меню', () => {
    renderMenuBar();
    const fileTrigger = screen.getByRole('button', { name: 'Файл' });
    fireEvent.click(fileTrigger);

    fireEvent.keyDown(fileTrigger, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Открыть');

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Недавние');

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveTextContent('Открыть');

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(screen.queryByRole('menu', { name: 'Файл' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu', { name: 'Правка' })).toBeInTheDocument();
  });

  it('jsdom: без реального layout подменю не флипуется (rect нулевые)', () => {
    useAppStore.setState({ recentFiles: ['C:\\docs\\alpha.md'] });
    renderMenuBar();
    fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Недавние' }));

    const submenu = screen.getByRole('menu', { name: 'Недавние' });
    expect(submenu).toHaveClass('menubar-subpopover');
    expect(submenu).not.toHaveClass('menubar-subpopover-flipped');
    expect(submenu.style.transform).toBe('');
  });
});

describe('shouldFlipSubmenu', () => {
  it('false, когда подменю помещается в окно (включая впритык)', () => {
    expect(shouldFlipSubmenu(500, 800)).toBe(false);
    expect(shouldFlipSubmenu(800, 800)).toBe(false);
  });

  it('true, когда правый край подменю за краем окна', () => {
    expect(shouldFlipSubmenu(801, 800)).toBe(true);
    expect(shouldFlipSubmenu(475, 390)).toBe(true);
  });
});

describe('computeSubmenuPlacement', () => {
  // Раскладка узкого окна 390px: поповер ~240px у левого края,
  // родительский пункт x≈9, подменю шириной 240
  it('помещается справа — без флипа и без клампа', () => {
    expect(computeSubmenuPlacement(9, 475, 240, 1440)).toEqual({ flipped: false, clampOffset: 0 });
  });

  it('не помещается справа, но помещается влево — флип без клампа', () => {
    // parentLeft=300: flippedLeft = 300 + 4 - 240 = 64 >= 0
    expect(computeSubmenuPlacement(300, 700, 240, 640)).toEqual({ flipped: true, clampOffset: 0 });
  });

  it('не помещается ни справа, ни слева — флип с клампом к краю окна', () => {
    // parentLeft=9: flippedLeft = 9 + 4 - 240 = -227 → кламп вправо до 4px от края
    expect(computeSubmenuPlacement(9, 475, 240, 390)).toEqual({ flipped: true, clampOffset: 231 });
  });

  it('флип впритык слева (flippedLeft === 0) — без клампа', () => {
    // parentLeft=236: flippedLeft = 236 + 4 - 240 = 0
    expect(computeSubmenuPlacement(236, 700, 240, 500)).toEqual({ flipped: true, clampOffset: 0 });
  });
});
