import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionsMenu } from './OptionsMenu';
import { saveAILyrics, clearSavedAILyrics } from '../services/aiLyricsStore';
import { makeSong } from '../test/fixtures';
import { AI_CONFIG_OFF, AI_CONFIG_ON } from '../test/fixtures';
import type { LyricsData } from '../types/lyrics';

const withConfig = {
  ...AI_CONFIG_OFF,
  providerUrl: 'https://llm.example.com/v1',
  model: 'gpt-x',
  apiKey: 'sk-abc',
  enabled: true,
};

function renderMenu(overrides: Partial<Parameters<typeof OptionsMenu>[0]> = {}) {
  const onSave = vi.fn();
  render(
    <OptionsMenu aiConfig={AI_CONFIG_OFF} isBusy={false} onSave={onSave} {...overrides} />
  );
  return { onSave };
}

describe('OptionsMenu', () => {
  beforeEach(() => {
    clearSavedAILyrics();
    localStorage.clear();
  });

  it('opens and closes the dropdown', () => {
    renderMenu();
    fireEvent.click(screen.getByTitle('AI fallback options'));
    expect(screen.getByText('AI Fallback Options')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Close'));
    expect(screen.queryByText('AI Fallback Options')).not.toBeInTheDocument();
  });

  it('shows a configured indicator dot only when complete', () => {
    renderMenu();
    fireEvent.click(screen.getByTitle('AI fallback options'));
    // Draft matches the disabled config, so no dot is present in the dropdown.
    const offButton = screen.getAllByTitle('AI fallback options')[0];
    expect(offButton.querySelector('.bg-cyan-400')).toBeNull();

    renderMenu({ aiConfig: AI_CONFIG_ON });
    fireEvent.click(screen.getAllByTitle('AI fallback options').at(-1)!.closest('button')!);
    const configured = screen.getAllByTitle('AI fallback options').at(-1)!;
    expect(configured.querySelector('.bg-cyan-400')).not.toBeNull();
  });

  it('toggles the enable checkbox and edits the draft', async () => {
    const user = userEvent.setup();
    const { onSave } = renderMenu();
    fireEvent.click(screen.getByTitle('AI fallback options'));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.clear(screen.getByPlaceholderText('https://api.openai.com/v1'));
    await user.type(screen.getByPlaceholderText('https://api.openai.com/v1'), 'https://localhost:11434/v1');
    await user.clear(screen.getByPlaceholderText('gpt-4o-mini'));
    await user.type(screen.getByPlaceholderText('gpt-4o-mini'), 'llama3');
    await user.clear(screen.getByPlaceholderText('sk-...'));
    await user.type(screen.getByPlaceholderText('sk-...'), 'local-key');

    fireEvent.click(screen.getByText('Save & Retry'));
    expect(onSave).toHaveBeenCalledWith({
      providerUrl: 'https://localhost:11434/v1',
      model: 'llama3',
      apiKey: 'local-key',
      enabled: true,
    });
  });

  it('disables Save while busy and shows progress text', () => {
    renderMenu({ isBusy: true });
    fireEvent.click(screen.getByTitle('AI fallback options'));

    const save = screen.getByRole('button', { name: /Retrieving lyrics/ });
    expect(save).toBeDisabled();
  });

  it('keeps draft in sync with a changed aiConfig prop', () => {
    const { rerender } = render(
      <OptionsMenu aiConfig={AI_CONFIG_OFF} isBusy={false} onSave={() => {}} />
    );
    rerender(<OptionsMenu aiConfig={withConfig} isBusy={false} onSave={() => {}} />);
    fireEvent.click(screen.getByTitle('AI fallback options'));

    expect(screen.getByPlaceholderText('https://api.openai.com/v1')).toHaveValue(
      'https://llm.example.com/v1'
    );
  });

  it('counts and clears saved AI lyrics', () => {
    renderMenu();
    fireEvent.click(screen.getByTitle('AI fallback options'));

    const seed: LyricsData = {
      songId: 'x',
      title: 'X',
      artist: 'Y',
      album: '',
      albumArt: '',
      provider: 'AI Sync',
      syncedLyrics: [],
      plainLyrics: '',
      annotations: [],
      trivia: [],
    };
    saveAILyrics(makeSong({ title: 'X', artist: 'Y' }), seed);

    // Close and re-open so the effect re-reads storage.
    fireEvent.click(screen.getByTitle('AI fallback options'));
    fireEvent.click(screen.getByTitle('AI fallback options'));
    expect(screen.getByText(/Saved AI lyrics:/)).toBeInTheDocument();

    const clear = screen.getByRole('button', { name: /Clear/ });
    expect(clear).not.toBeDisabled();
    fireEvent.click(clear);
    expect(screen.getByRole('button', { name: /Clear/ })).toBeDisabled();
  });

  it('disables Clear when there are no saved lyrics', () => {
    renderMenu();
    fireEvent.click(screen.getByTitle('AI fallback options'));
    expect(screen.getByRole('button', { name: /Clear/ })).toBeDisabled();
  });
});