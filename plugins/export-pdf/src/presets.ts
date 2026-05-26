import type { ExportPdfSettings } from './types';

export const modernPreset: ExportPdfSettings = {
  preset: 'modern',
  page: {
    size: 'a4',
    orientation: 'portrait',
    margins: { top: 20, right: 18, bottom: 22, left: 18 },
  },
  titlePage: {
    enabled: true,
    title: '',
    author: '',
    date: '',
    style: 'modern',
  },
  header: {
    enabled: false,
    leftText: '',
    rightText: '',
    line: true,
  },
  footer: {
    enabled: true,
    leftText: '',
    rightText: '',
    line: true,
  },
  pageNumbers: {
    enabled: true,
    position: 'bottom-center',
    format: 'short',
    hideOnFirstPage: true,
  },
  typography: {
    bodyFont: 'Roboto',
    headingFont: 'Roboto',
    codeFont: 'Roboto',
    fontSize: 12,
    lineHeight: 1.35,
    paragraphSpacing: 8,
    textAlign: 'left',
    firstLineIndent: false,
    firstLineIndentMm: 6,
  },
  markdown: {
    images: {
      enabled: true,
      maxWidthPercent: 86,
      align: 'center',
      borderRadius: 0,
      captions: true,
    },
    tables: {
      borderStyle: 'grid',
      zebra: true,
      zebraColor: '#f3f4f6',
      cellPadding: 6,
      scalePercent: 100,
    },
    codeBlocks: {
      syntaxHighlight: false,
      background: '#f3f4f6',
      borderColor: '#d1d5db',
      borderRadius: 4,
      fontSizePercent: 88,
    },
    lists: {
      markerStyle: 'disc',
      spacing: 4,
      checklistStyle: 'square',
    },
    mermaid: {
      scaleToPage: true,
      theme: 'neutral',
    },
    blockquotes: {
      italic: false,
      barColor: '#2563eb',
      background: '#eff6ff',
    },
  },
  pageBreaks: {
    beforeH1: true,
    avoidInsideBlocks: true,
  },
  colors: {
    text: '#1f2937',
    heading: '#111827',
    accent: '#2563eb',
    background: '#ffffff',
  },
};

export const academicPreset: ExportPdfSettings = {
  ...modernPreset,
  preset: 'academic',
  page: {
    size: 'a4',
    orientation: 'portrait',
    margins: { top: 25, right: 25, bottom: 25, left: 30 },
  },
  titlePage: {
    ...modernPreset.titlePage,
    style: 'academic',
  },
  typography: {
    ...modernPreset.typography,
    bodyFont: 'Roboto',
    headingFont: 'Roboto',
    fontSize: 12,
    lineHeight: 1.5,
    paragraphSpacing: 8,
    textAlign: 'justify',
    firstLineIndent: true,
    firstLineIndentMm: 8,
  },
  markdown: {
    ...modernPreset.markdown,
    tables: {
      ...modernPreset.markdown.tables,
      borderStyle: 'grid',
      zebra: false,
    },
    blockquotes: {
      ...modernPreset.markdown.blockquotes,
      italic: true,
      barColor: '#444444',
      background: '#f7f7f7',
    },
  },
  colors: {
    text: '#111111',
    heading: '#111111',
    accent: '#444444',
    background: '#ffffff',
  },
};

export const techPreset: ExportPdfSettings = {
  ...modernPreset,
  preset: 'tech',
  titlePage: {
    ...modernPreset.titlePage,
    style: 'minimal',
  },
  typography: {
    ...modernPreset.typography,
    bodyFont: 'Roboto',
    headingFont: 'Roboto',
    codeFont: 'Roboto',
    fontSize: 11,
    lineHeight: 1.35,
    paragraphSpacing: 7,
    textAlign: 'left',
  },
  markdown: {
    ...modernPreset.markdown,
    codeBlocks: {
      ...modernPreset.markdown.codeBlocks,
      background: '#111827',
      borderColor: '#374151',
      fontSizePercent: 92,
    },
  },
  colors: {
    text: '#d1d5db',
    heading: '#ffffff',
    accent: '#22c55e',
    background: '#111827',
  },
};

export const elegantPreset: ExportPdfSettings = {
  ...modernPreset,
  preset: 'elegant',
  titlePage: {
    ...modernPreset.titlePage,
    style: 'minimal',
  },
  typography: {
    ...modernPreset.typography,
    bodyFont: 'Roboto',
    headingFont: 'Roboto',
    fontSize: 13,
    lineHeight: 1.45,
    paragraphSpacing: 10,
    textAlign: 'left',
  },
  colors: {
    text: '#2f2a25',
    heading: '#171412',
    accent: '#8b5e34',
    background: '#ffffff',
  },
};

export const exportPdfPresets = {
  modern: modernPreset,
  academic: academicPreset,
  tech: techPreset,
  elegant: elegantPreset,
};
