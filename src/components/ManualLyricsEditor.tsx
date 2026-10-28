import React, { useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import { validateManualLyrics } from '../services/manualLyricsStore';

interface ManualLyricsEditorProps {
  /** The text the editor opens with (the saved manual text or empty). */
  initialText: string;
  /** True while a sync session holds the text (the editor is read-only then). */
  readOnly?: boolean;
  /** Shown instead of the editor when it is locked by a sync session. */
  lockedReason?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/**
 * The manual lyrics editor (spec 19, W2).
 *
 * The lyrics surface becomes a textarea here: the user types or pastes the
 * lyrics and saves them locally as the `Manual` provider. Validation enforces
 * the documented limits (300 lines / 30 000 characters).
 */
export const ManualLyricsEditor: React.FC<ManualLyricsEditorProps> = ({
  initialText,
  readOnly = false,
  lockedReason,
  onSave,
  onCancel,
}) => {
  const [text, setText] = useState(initialText);
  const validation = useMemo(() => validateManualLyrics(text), [text]);

  if (readOnly) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center select-none"
        data-testid="manual-editor-locked"
      >
        <p className="text-sm font-semibold text-slate-200">Sync in progress</p>
        <p className="text-xs text-slate-500">
          {lockedReason ?? 'The manual lyrics are locked while syncing.'}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 flex items-center gap-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
        >
          <X className="h-3.5 w-3.5" /> Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3" data-testid="manual-editor">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label="Manual lyrics"
        spellCheck={false}
        placeholder={'Type or paste the lyrics here.\nOne line per lyric row.'}
        className="min-h-0 flex-1 resize-none rounded-lg border border-white/10 bg-slate-950/70 p-3 font-mono text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
      />

      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[10px] text-slate-500">
          {validation.lineCount} lines · {validation.charCount} characters
        </span>
        {!validation.ok && validation.error && (
          <span className="text-[10px] text-amber-300" data-testid="manual-editor-error">
            {validation.error}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(text)}
            disabled={!validation.ok}
            data-testid="manual-editor-save"
            className="flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </div>
    </div>
  );
};
