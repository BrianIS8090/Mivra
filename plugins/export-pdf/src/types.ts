export type PageSize = 'a4' | 'letter' | 'a5';
export type PageOrientation = 'portrait' | 'landscape';
export type TitlePageStyle = 'minimal' | 'modern' | 'academic';
export type TextAlign = 'left' | 'justify';
export type ExportPdfPresetId = 'modern' | 'academic' | 'tech' | 'elegant';
export type TableBorderStyle = 'grid' | 'rows' | 'minimal';
export type ImageAlign = 'left' | 'center';
export type PageNumberPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type PageNumberFormat = 'simple' | 'total' | 'short' | 'full';
export type MermaidTheme = 'light' | 'dark' | 'neutral';
export type ChecklistStyle = 'square' | 'round';

export type ExportPdfSettings = {
  preset: ExportPdfPresetId;
  page: {
    size: PageSize;
    orientation: PageOrientation;
    margins: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };
  titlePage: {
    enabled: boolean;
    title: string;
    author: string;
    date: string;
    style: TitlePageStyle;
  };
  header: {
    enabled: boolean;
    leftText: string;
    rightText: string;
    line: boolean;
  };
  footer: {
    enabled: boolean;
    leftText: string;
    rightText: string;
    line: boolean;
  };
  pageNumbers: {
    enabled: boolean;
    position: PageNumberPosition;
    format: PageNumberFormat;
    hideOnFirstPage: boolean;
  };
  typography: {
    bodyFont: string;
    headingFont: string;
    codeFont: string;
    fontSize: number;
    lineHeight: number;
    paragraphSpacing: number;
    textAlign: TextAlign;
    firstLineIndent: boolean;
    firstLineIndentMm: number;
  };
  markdown: {
    images: {
      enabled: boolean;
      maxWidthPercent: number;
      align: ImageAlign;
      borderRadius: number;
      captions: boolean;
    };
    tables: {
      borderStyle: TableBorderStyle;
      zebra: boolean;
      zebraColor: string;
      cellPadding: number;
      scalePercent: number;
    };
    codeBlocks: {
      syntaxHighlight: boolean;
      background: string;
      borderColor: string;
      borderRadius: number;
      fontSizePercent: number;
    };
    lists: {
      markerStyle: 'disc' | 'dash';
      spacing: number;
      checklistStyle: ChecklistStyle;
    };
    mermaid: {
      scaleToPage: boolean;
      theme: MermaidTheme;
    };
    blockquotes: {
      italic: boolean;
      barColor: string;
      background: string;
    };
  };
  pageBreaks: {
    beforeH1: boolean;
    avoidInsideBlocks: boolean;
  };
  colors: {
    text: string;
    heading: string;
    accent: string;
    background: string;
  };
};

export type RenderContext = {
  filePath: string | null;
};
