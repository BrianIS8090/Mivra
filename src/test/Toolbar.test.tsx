import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { useAppStore } from '../stores/appStore';

describe('Toolbar', () => {
  beforeEach(() => {
    useAppStore.setState({
      fontFamily: 'Segoe UI Variable',
      fontSize: 15,
      language: 'ru',
      pageWidth: 816,
      editorMode: 'visual',
      autosave: false,
    });
  });

  it('показывает меню шрифтов поверх интерфейса и выбирает шрифт', async () => {
    render(<Toolbar />);

    const trigger = screen.getByRole('button', { name: 'Segoe UI Variable' });
    fireEvent.click(trigger);

    const menu = screen.getByRole('listbox', { name: 'Шрифт' });
    expect(menu).toHaveClass('toolbar-font-select-menu');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Georgia' }));

    await waitFor(() => {
      expect(useAppStore.getState().fontFamily).toBe('Georgia');
    });
    await screen.findByRole('button', { name: 'Georgia' });
    expect(screen.queryByRole('listbox', { name: 'Шрифт' })).not.toBeInTheDocument();
  });

  it('оставляет только контролы редактуры: шрифт, размер, ширина, режим, автосохранение', () => {
    render(<Toolbar />);

    // Шрифт
    expect(screen.getByRole('button', { name: 'Segoe UI Variable' })).toBeInTheDocument();
    // Размер шрифта
    expect(screen.getByRole('button', { name: '−' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    // Ширина страницы
    expect(screen.getByTitle('Ширина страницы (px)')).toBeInTheDocument();
    // Переключатель режима
    expect(screen.getByRole('button', { name: 'Визуальный' })).toBeInTheDocument();
    // Тоггл автосохранения
    expect(screen.getByRole('button', { name: 'Автосохранение' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('не рендерит кнопки, перенесённые в меню-бар', () => {
    render(<Toolbar />);

    const removedButtons = [
      'Открыть',
      'Недавние',
      'Сохранить',
      'Сохранить как',
      'Печать',
      '↻',
      'Системная',
      'Плагины',
      'S3',
      'Справка',
      'RU',
    ];
    for (const name of removedButtons) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    // Диалоги теперь принадлежат меню-бару, а не тулбару
    expect(screen.queryByTestId('s3-settings-dialog')).not.toBeInTheDocument();
  });

  it('переключает режим редактора', () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByRole('button', { name: 'Визуальный' }));
    expect(useAppStore.getState().editorMode).toBe('source');

    fireEvent.click(screen.getByRole('button', { name: 'Исходный' }));
    expect(useAppStore.getState().editorMode).toBe('visual');
  });

  it('переключает автосохранение', () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByRole('button', { name: 'Автосохранение' }));
    expect(useAppStore.getState().autosave).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Автосохранение' }));
    expect(useAppStore.getState().autosave).toBe(false);
  });
});
