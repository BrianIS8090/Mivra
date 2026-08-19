import { useEffect, useMemo, useRef, useState } from 'react';
import { useFile } from '../../hooks/useFile';
import { useSettings } from '../../hooks/useSettings';
import { useTheme } from '../../hooks/useTheme';
import { useAppStore } from '../../stores/appStore';
import { usePluginStore } from '../../plugins/pluginStore';
import { getTranslations } from '../../i18n';
import { HelpDialog } from '../Help/HelpDialog';
import { PluginManagerDialog } from '../PluginManager/PluginManagerDialog';
import { S3SettingsDialog } from '../S3Settings/S3SettingsDialog';
import './menuBar.css';

// Топ-меню; порядок в массиве используется навигацией Left/Right
type MenuId = 'file' | 'edit' | 'view' | 'plugins' | 'service' | 'help';
const MENU_ORDER: MenuId[] = ['file', 'edit', 'view', 'plugins', 'service', 'help'];

// Пункты с подменю
type SubmenuId = 'recent' | 'theme' | 'language';

// Максимум пунктов в подменю «Недавние»
const MAX_RECENT_ITEMS = 10;

// Имя файла из полного пути (разделитель и '/', и '\' — пути приходят с Windows)
function recentFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// Дедупликация recent-списка для рендера (перенесена из Toolbar):
// settings.json можно править руками, а на Windows один и тот же путь
// встречается с разным регистром и слэшами.
// Показываем первое вхождение в исходном написании.
function dedupeRecentFiles(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = path.replace(/\//g, '\\').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface MenuBarProps {
  // Открыть панель поиска (F1): обычную / с раскрытой строкой замены
  onFind: () => void;
  onReplace: () => void;
}

export function MenuBar({ onFind, onReplace }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<SubmenuId | null>(null);
  // Диалоги переехали из Toolbar — меню-бар их новый владелец
  const [showHelp, setShowHelp] = useState(false);
  const [showS3, setShowS3] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const { open, openPath, save, saveAs, reload, filePath } = useFile();
  const { language, autosave, changeLanguage, changeAutosave } = useSettings();
  const { theme, setTheme } = useTheme();
  const editorMode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);
  const recentFiles = useAppStore((s) => s.recentFiles);
  const pluginButtons = usePluginStore((s) => s.toolbarButtons);

  const t = getTranslations(language);

  const sortedPluginButtons = useMemo(
    () => pluginButtons.slice().sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    [pluginButtons],
  );
  // Дедупликация до обрезки: в подменю максимум MAX_RECENT_ITEMS уникальных путей
  const recentItems = useMemo(
    () => dedupeRecentFiles(recentFiles).slice(0, MAX_RECENT_ITEMS),
    [recentFiles],
  );

  const closeMenus = () => {
    setOpenMenu(null);
    setOpenSubmenu(null);
  };

  // Esc и клик вне закрывают меню — как у поповеров Toolbar.
  // Координация слоёв (F1): чужое обработанное событие не трогаем
  // (defaultPrevented), своё гасим preventDefault, чтобы верхние
  // слушатели (App на window) его проигнорировали.
  useEffect(() => {
    if (!openMenu) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
        setOpenSubmenu(null);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenMenu(null);
        setOpenSubmenu(null);
      }
    };

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  // Клавиатурная навигация: Down/Up — по пунктам открытого меню (включая
  // пункты раскрытого подменю), Left/Right — между топ-меню.
  // Enter отдельно не обрабатывается: у сфокусированной кнопки он нативно
  // вызывает click.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!openMenu) return;

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const idx = MENU_ORDER.indexOf(openMenu);
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = MENU_ORDER[(idx + step + MENU_ORDER.length) % MENU_ORDER.length];
      setOpenMenu(next);
      setOpenSubmenu(null);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = barRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"], [role="menuitemradio"]',
      );
      if (!items || items.length === 0) return;
      const list = Array.from(items);
      const currentIndex = list.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = currentIndex === -1
        ? (event.key === 'ArrowDown' ? 0 : list.length - 1)
        : (currentIndex + step + list.length) % list.length;
      list[nextIndex].focus();
    }
  };

  // Обычный пункт меню. Шорткат декоративен (aria-hidden), чтобы
  // accessible name пункта оставался чистым label'ом.
  const renderItem = (
    key: string,
    label: string,
    onSelect: () => void,
    options: { shortcut?: string; disabled?: boolean; title?: string } = {},
  ) => (
    <button
      key={key}
      type="button"
      className="menubar-item"
      role="menuitem"
      disabled={options.disabled}
      title={options.title}
      // Hover по обычному пункту сворачивает открытое подменю
      onMouseEnter={() => setOpenSubmenu(null)}
      onClick={() => {
        closeMenus();
        onSelect();
      }}
    >
      <span className="menubar-item-label">{label}</span>
      {options.shortcut && (
        <span className="menubar-item-shortcut" aria-hidden="true">{options.shortcut}</span>
      )}
    </button>
  );

  // Пункт-переключатель (чекбокс/радио) с ✓ слева
  const renderCheckItem = (
    key: string,
    label: string,
    checked: boolean,
    onSelect: () => void,
    role: 'menuitemcheckbox' | 'menuitemradio',
  ) => (
    <button
      key={key}
      type="button"
      className="menubar-item"
      role={role}
      aria-checked={checked}
      onClick={() => {
        closeMenus();
        onSelect();
      }}
    >
      <span className="menubar-item-check" aria-hidden="true">{checked ? '✓' : ''}</span>
      <span className="menubar-item-label">{label}</span>
    </button>
  );

  // Пункт с подменю: раскрывается по hover (как в десктопных меню) и по клику
  const renderSubmenu = (
    id: SubmenuId,
    label: string,
    title: string | undefined,
    children: React.ReactNode,
  ) => (
    <div
      key={id}
      className="menubar-item-parent"
      onMouseEnter={() => setOpenSubmenu(id)}
    >
      <button
        type="button"
        className="menubar-item"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={openSubmenu === id}
        title={title}
        onClick={() => setOpenSubmenu(openSubmenu === id ? null : id)}
      >
        <span className="menubar-item-label">{label}</span>
        <span className="menubar-item-arrow" aria-hidden="true">▸</span>
      </button>
      {openSubmenu === id && (
        <div className="menubar-popover menubar-subpopover" role="menu" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );

  const renderSeparator = (key: string) => (
    <div key={key} className="menubar-separator" role="separator" />
  );

  const renderMenuContent = (id: MenuId) => {
    switch (id) {
      case 'file':
        return [
          renderItem('open', t.open, () => { void open(); }, { shortcut: 'Ctrl+O', title: t.openTooltip }),
          renderSubmenu(
            'recent',
            t.recentFiles,
            t.recentFilesTooltip,
            recentItems.length > 0 ? (
              recentItems.map((path) => (
                <button
                  key={path}
                  type="button"
                  className="menubar-item"
                  role="menuitem"
                  title={path}
                  onClick={() => {
                    closeMenus();
                    void openPath(path);
                  }}
                >
                  <span className="menubar-item-label">{recentFileName(path)}</span>
                </button>
              ))
            ) : (
              <div className="menubar-item-empty">{t.recentFilesEmpty}</div>
            ),
          ),
          renderSeparator('sep-save'),
          renderItem('save', t.save, () => { void save(); }, { shortcut: 'Ctrl+S', title: t.saveTooltip }),
          renderItem('saveAs', t.saveAs, () => { void saveAs(); }, { shortcut: 'Ctrl+Shift+S', title: t.saveAsTooltip }),
          renderItem('reload', t.menuReload, () => { void reload(); }, { disabled: !filePath, title: t.reloadTooltip }),
          renderSeparator('sep-print'),
          renderItem('print', t.print, () => window.print(), { shortcut: 'Ctrl+P', title: t.printTooltip }),
        ];
      case 'edit':
        return [
          renderItem('find', t.menuFind, onFind, { shortcut: 'Ctrl+F' }),
          renderItem('replace', t.menuReplace, onReplace, { shortcut: 'Ctrl+H' }),
        ];
      case 'view':
        return [
          renderSubmenu(
            'theme',
            t.menuTheme,
            t.themeTooltip,
            ([
              { value: 'light', label: t.themeLight },
              { value: 'dark', label: t.themeDark },
              { value: 'system', label: t.themeSystem },
            ] as const).map((option) =>
              renderCheckItem(
                option.value,
                option.label,
                theme === option.value,
                () => setTheme(option.value),
                'menuitemradio',
              ),
            ),
          ),
          renderItem(
            'mode',
            t.menuEditorMode,
            () => setEditorMode(editorMode === 'visual' ? 'source' : 'visual'),
            { shortcut: 'Ctrl+/', title: t.modeTooltip },
          ),
        ];
      case 'plugins':
        return [
          ...(sortedPluginButtons.length > 0
            ? sortedPluginButtons.map((button) =>
              renderItem(
                `${button.pluginId}:${button.id}`,
                button.label,
                button.onClick,
                { title: button.title },
              ),
            )
            : [<div key="empty" className="menubar-item-empty">{t.pluginMenuEmpty}</div>]),
          renderSeparator('sep-manager'),
          renderItem('manager', t.pluginManagerTitle, () => setShowPlugins(true)),
        ];
      case 'service':
        return [
          renderItem('s3', t.s3DialogTitle, () => setShowS3(true)),
          renderCheckItem('autosave', t.autosave, autosave, () => changeAutosave(!autosave), 'menuitemcheckbox'),
          renderSubmenu(
            'language',
            t.menuLanguage,
            undefined,
            ([
              { value: 'ru', label: t.langRu },
              { value: 'en', label: t.langEn },
            ] as const).map((option) =>
              renderCheckItem(
                option.value,
                option.label,
                language === option.value,
                () => changeLanguage(option.value),
                'menuitemradio',
              ),
            ),
          ),
        ];
      case 'help':
        // «О программе» отдельным пунктом не делаем: HelpDialog не принимает
        // начальную вкладку, а файл диалога вне этого тикета
        return [
          renderItem('help', t.help, () => setShowHelp(true)),
        ];
    }
  };

  const topMenus: Array<{ id: MenuId; label: string }> = [
    { id: 'file', label: t.menuFile },
    { id: 'edit', label: t.menuEdit },
    { id: 'view', label: t.menuView },
    { id: 'plugins', label: t.plugins },
    { id: 'service', label: t.menuService },
    { id: 'help', label: t.help },
  ];

  return (
    <>
      <div className="menubar" ref={barRef} role="menubar" onKeyDown={handleKeyDown}>
        {topMenus.map(({ id, label }) => (
          <div className="menubar-entry" key={id}>
            <button
              type="button"
              className={`menubar-trigger${openMenu === id ? ' menubar-trigger-open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={openMenu === id}
              onClick={() => {
                if (openMenu === id) {
                  closeMenus();
                } else {
                  setOpenMenu(id);
                  setOpenSubmenu(null);
                }
              }}
              onMouseEnter={() => {
                // Как в десктопных приложениях: hover переключает меню,
                // только если какое-то меню уже открыто
                if (openMenu && openMenu !== id) {
                  setOpenMenu(id);
                  setOpenSubmenu(null);
                }
              }}
            >
              {label}
            </button>
            {openMenu === id && (
              <div className="menubar-popover" role="menu" aria-label={label}>
                {renderMenuContent(id)}
              </div>
            )}
          </div>
        ))}
      </div>

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showS3 && <S3SettingsDialog onClose={() => setShowS3(false)} />}
      {showPlugins && <PluginManagerDialog onClose={() => setShowPlugins(false)} />}
    </>
  );
}
