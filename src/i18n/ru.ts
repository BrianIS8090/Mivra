export const ru = {
  // Меню
  open: 'Открыть',
  save: 'Сохранить',
  saveAs: 'Сохранить как',
  print: 'Печать',
  help: 'Справка',
  
  // Тема
  themeLight: 'Светлая',
  themeDark: 'Тёмная',
  themeSystem: 'Системная',
  
  // Режим редактора
  visualMode: 'Визуальный',
  sourceMode: 'Исходный',
  
  // Статус-бар
  newFile: 'Новый файл',
  words: ['слово', 'слова', 'слов'] as [string, string, string],
  chars: ['символ', 'символа', 'символов'] as [string, string, string],
  
  // Редактор
  placeholder: 'Начните писать...',
  
  // Диалоги
  unsavedTitle: 'Несохранённые изменения',
  unsavedMessage: 'В документе есть несохранённые изменения. Сохранить их перед продолжением?',
  discard: 'Не сохранять',
  cancel: 'Отмена',

  // О программе
  about: 'О программе',
  version: 'Версия',
  description: 'Современный Markdown-редактор с визуальным и исходным режимами редактирования. Построен на Tauri 2 и Milkdown Crepe.',
  license: 'Лицензия',
  mitLicense: 'MIT License',
  author: 'Автор',
  contact: 'Контакт',
  close: 'Закрыть',
  
  // Подсказки
  openTooltip: 'Открыть (Ctrl+O)',
  saveTooltip: 'Сохранить (Ctrl+S)',
  saveAsTooltip: 'Сохранить как (Ctrl+Shift+S)',
  printTooltip: 'Печать (Ctrl+P)',
  reloadTooltip: 'Обновить документ с диска',
  themeTooltip: 'Переключить тему (Ctrl+Shift+T)',
  modeTooltip: 'Режим редактора (Ctrl+/)',
  fontTooltip: 'Шрифт',
  decreaseFontTooltip: 'Уменьшить шрифт (Ctrl+-)',
  increaseFontTooltip: 'Увеличить шрифт (Ctrl++)',
  pageWidthTooltip: 'Ширина страницы (px)',
  insertAsset: 'Вставить файл',
  insertAssetTooltip: 'Вставить ассет (Ctrl+Shift+A)',

  // Справка
  helpTitle: 'Справка',
  helpTabAbout: 'О программе',
  helpTabMarkdown: 'Markdown',
  helpTabShortcuts: 'Шорткаты',
  helpMarkdownIntro: 'Краткий справочник по синтаксису Markdown и расширениям.',
  helpMarkdownCards: [
    {
      title: 'Заголовки',
      example: '# Заголовок\n## Подзаголовок',
      description: 'Используйте решётки для уровней 1–6.',
    },
    {
      title: 'Выделение',
      example: '**Жирный**\n*Курсив*\n~~Зачёркнутый~~',
      description: 'Быстрое форматирование текста.',
    },
    {
      title: 'Код',
      example: '`код`\n```\nблок кода\n```',
      description: 'Инлайн и многострочный код.',
    },
    {
      title: 'Ссылки и изображения',
      example: '[Текст](https://example.com)\n![Alt](https://example.com/image.png)',
      description: 'Ссылки и картинки в тексте.',
    },
    {
      title: 'Списки',
      example: '- Пункт\n1. Пункт',
      description: 'Маркированные и нумерованные списки.',
    },
    {
      title: 'Цитаты',
      example: '> Цитата',
      description: 'Выделение блока текста.',
    },
    {
      title: 'Таблицы',
      example: '| Колонка | Колонка |\n| --- | --- |\n| 1 | 2 |',
      description: 'Таблицы в стиле GitHub.',
    },
    {
      title: 'Чекбоксы',
      example: '- [ ] Задача\n- [x] Готово',
      description: 'Списки задач.',
    },
    {
      title: 'Разделитель',
      example: '---',
      description: 'Горизонтальная линия.',
    },
  ],
  helpShortcutsIntro: 'Глобальные и редакторские сочетания клавиш.',
  helpShortcutsNote: 'Если есть выделение, шорткаты оборачивают его; иначе вставляют шаблон.',
  helpShortcutsGroups: [
    {
      title: 'Файл',
      items: [
        { keys: 'Ctrl+O', description: 'Открыть файл' },
        { keys: 'Ctrl+S', description: 'Сохранить файл' },
        { keys: 'Ctrl+Shift+S', description: 'Сохранить как' },
        { keys: 'Ctrl+P', description: 'Печать' },
      ],
    },
    {
      title: 'Вид и режим',
      items: [
        { keys: 'Ctrl+Shift+T', description: 'Переключить тему' },
        { keys: 'Ctrl+/', description: 'Переключить режим редактора' },
        { keys: 'Ctrl++ / Ctrl+=', description: 'Увеличить шрифт' },
        { keys: 'Ctrl+-', description: 'Уменьшить шрифт' },
      ],
    },
    {
      title: 'Markdown',
      items: [
        { keys: 'Ctrl+B', description: 'Жирный (**текст**)' },
        { keys: 'Ctrl+I', description: 'Курсив (*текст*)' },
        { keys: 'Ctrl+Shift+X', description: 'Зачёркнутый (~~текст~~)' },
        { keys: 'Ctrl+Shift+C', description: 'Инлайн-код (`код`)' },
        { keys: 'Ctrl+Alt+C', description: 'Блок кода (```...```)' },
        { keys: 'Ctrl+K', description: 'Ссылка ([текст](url))' },
        { keys: 'Ctrl+Shift+K', description: 'Изображение (![alt](url))' },
        { keys: 'Ctrl+Shift+A', description: 'Вставить файл из assets/' },
        { keys: 'Ctrl+Alt+T', description: 'Таблица' },
        { keys: 'Ctrl+Alt+X', description: 'Чекбокс (- [ ])' },
      ],
    },
  ],
};

export type Translations = typeof ru;
