import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManualLyricsEditor } from './ManualLyricsEditor';
import { MAX_MANUAL_LINES } from '../services/manualLyricsStore';

describe('ManualLyricsEditor', () => {
  it('opens with the saved text', () => {
    render(
      <ManualLyricsEditor
        initialText="Saved line"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Manual lyrics')).toHaveValue('Saved line');
  });

  it('saves the typed text', () => {
    const onSave = vi.fn();
    render(
      <ManualLyricsEditor initialText="" onSave={onSave} onCancel={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText('Manual lyrics'), {
      target: { value: 'Typed line' },
    });
    fireEvent.click(screen.getByTestId('manual-editor-save'));

    expect(onSave).toHaveBeenCalledWith('Typed line');
  });

  it('refuses an empty save', () => {
    const onSave = vi.fn();
    render(
      <ManualLyricsEditor initialText="" onSave={onSave} onCancel={vi.fn()} />
    );

    expect(screen.getByTestId('manual-editor-save')).toBeDisabled();
    expect(screen.getByTestId('manual-editor-error')).toHaveTextContent(
      'Enter at least one lyric line.'
    );
    fireEvent.click(screen.getByTestId('manual-editor-save'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a save over the line limit', () => {
    const onSave = vi.fn();
    const tooMany = Array.from({ length: MAX_MANUAL_LINES + 1 }, (_, i) => `line ${i}`).join('\n');
    render(
      <ManualLyricsEditor initialText={tooMany} onSave={onSave} onCancel={vi.fn()} />
    );

    expect(screen.getByTestId('manual-editor-save')).toBeDisabled();
    expect(screen.getByTestId('manual-editor-error')).toHaveTextContent('Too many lines');
  });

  it('cancels without saving', () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <ManualLyricsEditor initialText="line" onSave={onSave} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('is read-only while a sync session holds the text', () => {
    const onSave = vi.fn();
    render(
      <ManualLyricsEditor
        initialText="line"
        readOnly
        lockedReason="The manual lyrics are locked while a sync session is running."
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('Manual lyrics')).not.toBeInTheDocument();
    expect(screen.getByTestId('manual-editor-locked')).toHaveTextContent(
      'locked while a sync session is running'
    );
  });
});
