import dejavuSansBoldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';
import dejavuSansBoldItalicsUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-BoldOblique.ttf?url';
import dejavuSansItalicsUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Oblique.ttf?url';
import dejavuSansNormalUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import dejavuSansMonoBoldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansMono-Bold.ttf?url';
import dejavuSansMonoBoldItalicsUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansMono-BoldOblique.ttf?url';
import dejavuSansMonoItalicsUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansMono-Oblique.ttf?url';
import dejavuSansMonoNormalUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansMono.ttf?url';
import dejavuSerifBoldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf?url';
import dejavuSerifBoldItalicsUrl from 'dejavu-fonts-ttf/ttf/DejaVuSerif-BoldItalic.ttf?url';
import dejavuSerifItalicsUrl from 'dejavu-fonts-ttf/ttf/DejaVuSerif-Italic.ttf?url';
import dejavuSerifNormalUrl from 'dejavu-fonts-ttf/ttf/DejaVuSerif.ttf?url';

export type PdfMakeFontFiles = {
  normal: string;
  bold: string;
  italics: string;
  bolditalics: string;
};

type PdfFontAssets = {
  files: PdfMakeFontFiles;
  urls: Record<keyof PdfMakeFontFiles, string>;
};

export const PDF_DEFAULT_FONT = 'Roboto';
export const PDF_CODE_FONT = 'MivraCode';

export const PDF_FONT_OPTIONS = [
  { value: PDF_DEFAULT_FONT, label: 'Roboto' },
  { value: 'DejaVu Sans', label: 'DejaVu Sans' },
  { value: 'DejaVu Serif', label: 'DejaVu Serif' },
  { value: 'DejaVu Sans Mono', label: 'DejaVu Sans Mono' },
] as const;

export const PDF_EMBEDDED_FONTS: Record<string, PdfFontAssets> = {
  'DejaVu Sans': {
    files: {
      normal: 'DejaVuSans.ttf',
      bold: 'DejaVuSans-Bold.ttf',
      italics: 'DejaVuSans-Oblique.ttf',
      bolditalics: 'DejaVuSans-BoldOblique.ttf',
    },
    urls: {
      normal: dejavuSansNormalUrl,
      bold: dejavuSansBoldUrl,
      italics: dejavuSansItalicsUrl,
      bolditalics: dejavuSansBoldItalicsUrl,
    },
  },
  'DejaVu Serif': {
    files: {
      normal: 'DejaVuSerif.ttf',
      bold: 'DejaVuSerif-Bold.ttf',
      italics: 'DejaVuSerif-Italic.ttf',
      bolditalics: 'DejaVuSerif-BoldItalic.ttf',
    },
    urls: {
      normal: dejavuSerifNormalUrl,
      bold: dejavuSerifBoldUrl,
      italics: dejavuSerifItalicsUrl,
      bolditalics: dejavuSerifBoldItalicsUrl,
    },
  },
  'DejaVu Sans Mono': {
    files: {
      normal: 'DejaVuSansMono.ttf',
      bold: 'DejaVuSansMono-Bold.ttf',
      italics: 'DejaVuSansMono-Oblique.ttf',
      bolditalics: 'DejaVuSansMono-BoldOblique.ttf',
    },
    urls: {
      normal: dejavuSansMonoNormalUrl,
      bold: dejavuSansMonoBoldUrl,
      italics: dejavuSansMonoItalicsUrl,
      bolditalics: dejavuSansMonoBoldItalicsUrl,
    },
  },
  [PDF_CODE_FONT]: {
    files: {
      normal: 'DejaVuSansMono.ttf',
      bold: 'DejaVuSansMono-Bold.ttf',
      italics: 'DejaVuSansMono-Oblique.ttf',
      bolditalics: 'DejaVuSansMono-BoldOblique.ttf',
    },
    urls: {
      normal: dejavuSansMonoNormalUrl,
      bold: dejavuSansMonoBoldUrl,
      italics: dejavuSansMonoItalicsUrl,
      bolditalics: dejavuSansMonoBoldItalicsUrl,
    },
  },
};
