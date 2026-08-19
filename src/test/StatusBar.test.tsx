import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StatusBar } from '../components/StatusBar/StatusBar';
import { useAppStore } from '../stores/appStore';

// Минимальный валидный S3Config для тестов индикатора
const s3Config = {
  endpoint: 'https://storage.yandexcloud.net',
  region: 'ru-central1',
  bucket: 'mivra-bucket',
  access_key_id: 'key-id',
  public_url_prefix: null,
  path_prefix: null,
};

describe('StatusBar', () => {
  beforeEach(() => {
    useAppStore.setState({
      filePath: null,
      content: '',
      editorMode: 'visual',
      language: 'ru',
      s3: null,
      s3Verified: false,
      autosave: false,
    });
  });

  it('должен показывать "Новый файл" когда нет пути', () => {
    render(<StatusBar />);
    expect(screen.getByText('Новый файл')).toBeInTheDocument();
  });

  it('должен показывать путь к файлу', () => {
    useAppStore.setState({ filePath: 'C:\\docs\\test.md' });
    render(<StatusBar />);
    expect(screen.getByText('C:\\docs\\test.md')).toBeInTheDocument();
  });

  it('должен считать слова и символы', () => {
    useAppStore.setState({ content: 'Привет мир тест' });
    render(<StatusBar />);
    expect(screen.getByText(/3 слова/)).toBeInTheDocument();
  });

  it('должен показывать 0 слов для пустого контента', () => {
    useAppStore.setState({ content: '' });
    render(<StatusBar />);
    expect(screen.getByText(/0 слов/)).toBeInTheDocument();
  });

  it('должен показывать режим редактора', () => {
    useAppStore.setState({ editorMode: 'source' });
    render(<StatusBar />);
    expect(screen.getByText('Исходный')).toBeInTheDocument();
  });

  it('показывает индикатор S3 ✓ с bucket в title, когда конфиг верифицирован', () => {
    useAppStore.setState({ s3: s3Config, s3Verified: true });
    render(<StatusBar />);

    const indicator = screen.getByText('S3 ✓');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('title', 'mivra-bucket');
  });

  it('скрывает индикатор S3, когда конфиг не верифицирован или отсутствует', () => {
    const { rerender } = render(<StatusBar />);
    expect(screen.queryByText('S3 ✓')).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState({ s3: s3Config, s3Verified: false });
    });
    rerender(<StatusBar />);
    expect(screen.queryByText('S3 ✓')).not.toBeInTheDocument();
  });

  it('показывает индикатор автосохранения только при включённом autosave', () => {
    const { rerender } = render(<StatusBar />);
    expect(screen.queryByText('Автосохранение ✓')).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState({ autosave: true });
    });
    rerender(<StatusBar />);
    expect(screen.getByText('Автосохранение ✓')).toBeInTheDocument();
  });
});
