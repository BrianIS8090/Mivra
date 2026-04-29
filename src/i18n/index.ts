import { ru, type Translations, type PluralForms } from './ru';
import { en } from './en';

export type Language = 'ru' | 'en';

const translations: Record<Language, Translations> = { ru, en };

export function getTranslations(lang: Language): Translations {
  return translations[lang];
}

// Плюрализация через Intl.PluralRules — корректно работает для любого
// языка, без ручного mod10/mod100.
export function pluralize(n: number, lang: Language, forms: PluralForms): string {
  const cat = new Intl.PluralRules(lang).select(n);
  return forms[cat] ?? forms.other ?? '';
}

export { ru, en, type Translations, type PluralForms };
