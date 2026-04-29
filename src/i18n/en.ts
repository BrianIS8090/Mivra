import type { Translations } from './ru';

export const en: Translations = {
  // Menu
  open: 'Open',
  save: 'Save',
  saveAs: 'Save As',
  print: 'Print',
  help: 'Help',
  
  // Theme
  themeLight: 'Light',
  themeDark: 'Dark',
  themeSystem: 'System',
  
  // Editor mode
  visualMode: 'Visual',
  sourceMode: 'Source',
  
  // Window title bar
  untitled: 'Untitled',
  minimize: 'Minimize',
  maximize: 'Maximize',

  // Status bar
  newFile: 'New File',
  words: { one: 'word', other: 'words' },
  chars: { one: 'char', other: 'chars' },
  
  // Editor
  placeholder: 'Start writing...',
  
  // Dialogs
  unsavedTitle: 'Unsaved changes',
  unsavedMessage: 'The document has unsaved changes. Save them before continuing?',
  discard: "Don't save",
  cancel: 'Cancel',

  // About
  about: 'About',
  version: 'Version',
  description: 'Modern Markdown editor with visual and source editing modes. Built on Tauri 2 and Milkdown Crepe.',
  license: 'License',
  mitLicense: 'MIT License',
  author: 'Author',
  contact: 'Contact',
  close: 'Close',
  
  // Tooltips
  openTooltip: 'Open (Ctrl+O)',
  saveTooltip: 'Save (Ctrl+S)',
  saveAsTooltip: 'Save As (Ctrl+Shift+S)',
  printTooltip: 'Print (Ctrl+P)',
  reloadTooltip: 'Reload document from disk',
  themeTooltip: 'Toggle theme (Ctrl+Shift+T)',
  modeTooltip: 'Editor mode (Ctrl+/)',
  fontTooltip: 'Font',
  decreaseFontTooltip: 'Decrease font (Ctrl+-)',
  increaseFontTooltip: 'Increase font (Ctrl++)',
  pageWidthTooltip: 'Page width (px)',
  insertAsset: 'Insert file',
  insertAssetTooltip: 'Insert asset (Ctrl+Shift+A)',

  // Help
  helpTitle: 'Help',
  helpTabAbout: 'About',
  helpTabMarkdown: 'Markdown',
  helpTabShortcuts: 'Shortcuts',
  helpMarkdownIntro: 'Quick reference for Markdown syntax and extensions.',
  helpMarkdownCards: [
    {
      title: 'Headings',
      example: '# Heading\n## Subheading',
      description: 'Use # for levels 1–6.',
    },
    {
      title: 'Emphasis',
      example: '**Bold**\n*Italic*\n~~Strikethrough~~',
      description: 'Quick text emphasis.',
    },
    {
      title: 'Code',
      example: '`code`\n```\ncode block\n```',
      description: 'Inline and fenced code.',
    },
    {
      title: 'Links & Images',
      example: '[Text](https://example.com)\n![Alt](https://example.com/image.png)',
      description: 'Links and images in text.',
    },
    {
      title: 'Lists',
      example: '- Item\n1. Item',
      description: 'Bulleted and numbered lists.',
    },
    {
      title: 'Quotes',
      example: '> Quote',
      description: 'Block quotes.',
    },
    {
      title: 'Tables',
      example: '| Column | Column |\n| --- | --- |\n| 1 | 2 |',
      description: 'GitHub-style tables.',
    },
    {
      title: 'Checkboxes',
      example: '- [ ] Task\n- [x] Done',
      description: 'Task lists.',
    },
    {
      title: 'Divider',
      example: '---',
      description: 'Horizontal rule.',
    },
  ],
  helpShortcutsIntro: 'Global and editor shortcuts.',
  helpShortcutsNote: 'With selection, shortcuts wrap text; otherwise a template is inserted.',
  helpShortcutsGroups: [
    {
      title: 'File',
      items: [
        { keys: 'Ctrl+O', description: 'Open file' },
        { keys: 'Ctrl+S', description: 'Save file' },
        { keys: 'Ctrl+Shift+S', description: 'Save as' },
        { keys: 'Ctrl+P', description: 'Print' },
      ],
    },
    {
      title: 'View & Mode',
      items: [
        { keys: 'Ctrl+Shift+T', description: 'Toggle theme' },
        { keys: 'Ctrl+/', description: 'Toggle editor mode' },
        { keys: 'Ctrl++ / Ctrl+=', description: 'Increase font size' },
        { keys: 'Ctrl+-', description: 'Decrease font size' },
      ],
    },
    {
      title: 'Markdown',
      items: [
        { keys: 'Ctrl+B', description: 'Bold (**text**)' },
        { keys: 'Ctrl+I', description: 'Italic (*text*)' },
        { keys: 'Ctrl+Shift+X', description: 'Strikethrough (~~text~~)' },
        { keys: 'Ctrl+Shift+C', description: 'Inline code (`code`)' },
        { keys: 'Ctrl+Alt+C', description: 'Code block (```...```)' },
        { keys: 'Ctrl+K', description: 'Link ([text](url))' },
        { keys: 'Ctrl+Shift+K', description: 'Image (![alt](url))' },
        { keys: 'Ctrl+Shift+A', description: 'Insert file from assets/' },
        { keys: 'Ctrl+Alt+T', description: 'Table' },
        { keys: 'Ctrl+Alt+X', description: 'Checkbox (- [ ])' },
      ],
    },
  ],
};
