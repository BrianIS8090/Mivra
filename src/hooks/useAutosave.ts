import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { useToastStore } from '../stores/toastStore';
import * as tauri from '../utils/tauri';
import { getTranslations } from '../i18n';

// Пауза после последнего изменения контента, по истечении которой
// документ пишется на диск
const AUTOSAVE_DELAY = 2000;

// Автосохранение документа (F2): дебаунс 2с после последнего изменения.
// Сохраняет только когда: фича включена в настройках, документ грязный
// и файл уже назван (filePath != null) — неназванный не трогаем, чтобы
// не дёргать диалог «Сохранить как» на фоне печати.
// Должен монтироваться ровно один раз — в App.
export function useAutosave() {
  const content = useAppStore((s) => s.content);
  const isDirty = useAppStore((s) => s.isDirty);
  const filePath = useAppStore((s) => s.filePath);
  const autosave = useAppStore((s) => s.autosave);

  // «Ошибка уже показана»: без флага каждая неудачная попытка давала бы
  // новый тост. Сбрасывается ТОЛЬКО при смене контента (отдельный эффект
  // ниже) или при успешной записи — ререндеры хоста его не трогают.
  const errorShownRef = useRef(false);
  // Сериализация записей: в полёте не больше одной. Иначе при обратном
  // порядке завершения (C2 записался, потом C1) диск откатывается к
  // устаревшему контенту при уже сброшенном dirty — тихая потеря данных.
  const inFlightRef = useRef(false);
  // Таймер сработал, пока летела запись — после её завершения надо
  // перепроверить стор и, возможно, записать ещё раз.
  const pendingRef = useRef(false);

  const flush = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) {
      // Запись уже летит — просто помечаем, что нужен ещё проход.
      // Без busy-wait: продолжение случится в finally летящего вызова.
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      for (;;) {
        // Читаем стор напрямую, а не замыкание эффекта: за время дебаунса
        // и записи пользователь мог сохраниться вручную или продолжить печатать.
        const state = useAppStore.getState();
        // ВАЖНО: isDirty здесь НЕ гвард. Ручной Ctrl+S (useFile.save) живёт
        // вне этой сериализации и сбрасывает dirty безусловно: если наша
        // запись C1 завершится после ручной C2, диск откатится к C1 при
        // чистом флаге. Поэтому цикл крутится, пока контент стора расходится
        // с последним отправленным, — выход по совпадению контента (ниже)
        // или по остальным гвардам. Цена: если чужой save завершился
        // последним, возможна одна лишняя идемпотентная запись того же
        // контента — приемлемо.
        // Если автосейв ВЫКЛЮЧИЛИ в полёте — цикл остановится на этом
        // гварде; принятый риск: диск может остаться устаревшим, но тогда
        // и dirty не сброшен (расхождение), так что useExit спросит.
        if (!state.autosave || !state.filePath) return;
        pendingRef.current = false;
        const sentContent = state.content;
        try {
          await tauri.saveFile(state.filePath, sentContent);
        } catch (e) {
          console.error('[useAutosave] ошибка автосохранения:', e);
          // Без спама: тост один. Если во время упавшей записи был
          // выставлен pending — finally ниже запустит ровно один ретрай
          // (актуальный контент надо сохранить), тост при нём не повторится.
          // Дальше — только после успешной записи или нового изменения.
          if (!errorShownRef.current) {
            errorShownRef.current = true;
            useToastStore.getState().show(
              getTranslations(state.language).autosaveError,
              'error',
            );
          }
          return;
        }
        const fresh = useAppStore.getState();
        if (fresh.content === sentContent) {
          // Диск и стор совпали — документ чист
          if (fresh.isDirty) fresh.setDirty(false);
          errorShownRef.current = false;
          return;
        }
        // Контент изменился во время записи (печать или откат диска чужим
        // save): записанное уже устарело, dirty не трогаем и сразу пишем
        // актуальное (следующая итерация).
      }
    } finally {
      inFlightRef.current = false;
      // Пока летела запись, сработал ещё таймер — проверяем, разошёлся
      // ли стор с последней записью. Если записанное актуально, гвард
      // в начале цикла просто завершит вызов без лишней записи.
      if (pendingRef.current) {
        pendingRef.current = false;
        void flush();
      }
    }
  }, []);

  // Сброс «ошибка показана» при новом изменении контента — иначе после
  // первой ошибки пользователь больше никогда не увидел бы тост.
  // Эффект зависит ТОЛЬКО от content: ререндеры хоста и смена
  // isDirty/filePath/autosave флаг сбрасывать не должны.
  useEffect(() => {
    errorShownRef.current = false;
  }, [content]);

  useEffect(() => {
    if (!autosave || !isDirty || !filePath) return;
    const timeout = setTimeout(() => {
      void flush();
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(timeout);
    // flush стабилен (пустые deps useCallback): ререндеры хоста этот
    // эффект не перезапускают, таймер живёт положенные 2с.
  }, [content, isDirty, filePath, autosave, flush]);
}
