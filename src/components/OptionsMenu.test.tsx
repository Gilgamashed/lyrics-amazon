import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionsMenu } from './OptionsMenu';
import { DEFAULT_SETTINGS } from '../services/settingsStore';
import type { AppSettings } from '../types/lyrics';
import type { KaraokeAIConfig } from '../services/karaokeAIConfigStore';

const KARAOKE_AI: KaraokeAIConfig = {
  endpointUrl: 'https://api.example.com/v1',
  model: 'whisper-1',
  apiKey: '',
};

function renderMenu(overrides: Partial<AppSettings> = {}) {
  const onChange = vi.fn();
  const onResetHistory = vi.fn();
  const onKaraokeAIConfigChange = vi.fn();
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    window: { ...DEFAULT_SETTINGS.window },
    ...overrides,
  };
  const utils = render(
    <OptionsMenu
      settings={settings}
      onChange={onChange}
      onResetHistory={onResetHistory}
      karaokeAIConfig={KARAOKE_AI}
      onKaraokeAIConfigChange={onKaraokeAIConfigChange}
    />
  );
  fireEvent.click(screen.getByTitle('Options'));
  return { onChange, onResetHistory, onKaraokeAIConfigChange, settings, ...utils };
}

describe('OptionsMenu', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens and closes the dropdown', () => {
    renderMenu();
    expect(screen.getByText('Lyrics Layout')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Close'));
    expect(screen.queryByText('Lyrics Layout')).not.toBeInTheDocument();
  });

  it('selects a layout preset', () => {
    const { onChange } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Wide' }));
    expect(onChange).toHaveBeenCalledWith({ layoutPreset: 'wide' });
  });

  it('selects a backdrop theme', () => {
    const { onChange } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Minimal' }));
    expect(onChange).toHaveBeenCalledWith({ backgroundTheme: 'minimal' });
  });

  it('changes glass opacity and blur', () => {
    const { onChange } = renderMenu();
    fireEvent.change(screen.getByLabelText('Glass opacity'), { target: { value: '0.5' } });
    expect(onChange).toHaveBeenCalledWith({
      window: expect.objectContaining({ opacity: 0.5 }),
    });
    fireEvent.change(screen.getByLabelText('Backdrop blur'), { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith({
      window: expect.objectContaining({ blur: 8 }),
    });
  });

  it('changes lyric text size and palette', () => {
    const { onChange } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'XL' }));
    expect(onChange).toHaveBeenCalledWith({
      window: expect.objectContaining({ fontSize: 'xlarge' }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Cyan Cyber/ }));
    expect(onChange).toHaveBeenCalledWith({
      window: expect.objectContaining({ theme: 'cyan' }),
    });
  });

  it('adjusts and resets the default sync offset', () => {
    const { onChange } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: '+0.5s' }));
    expect(onChange).toHaveBeenCalledWith({ syncOffsetMs: 500 });
    fireEvent.click(screen.getByText('Reset'));
    expect(onChange).toHaveBeenCalledWith({ syncOffsetMs: 0 });
  });

  it('resets the most-listened history', () => {
    const { onResetHistory } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /Reset Most Listened/ }));
    expect(onResetHistory).toHaveBeenCalledOnce();
  });

  it('edits the Karaoke AI alignment endpoint, model and key', () => {
    const { onKaraokeAIConfigChange } = renderMenu();
    fireEvent.change(screen.getByLabelText('Karaoke AI endpoint'), {
      target: { value: 'https://api.openai.com/v1' },
    });
    expect(onKaraokeAIConfigChange).toHaveBeenCalledWith({
      endpointUrl: 'https://api.openai.com/v1',
    });
    fireEvent.change(screen.getByLabelText('Karaoke AI model'), {
      target: { value: 'whisper-large-v3' },
    });
    expect(onKaraokeAIConfigChange).toHaveBeenCalledWith({ model: 'whisper-large-v3' });
    fireEvent.change(screen.getByLabelText('Karaoke AI API key'), {
      target: { value: 'sk-x' },
    });
    expect(onKaraokeAIConfigChange).toHaveBeenCalledWith({ apiKey: 'sk-x' });
  });
});
