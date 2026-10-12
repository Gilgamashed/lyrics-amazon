import React, { useEffect, useRef, useState } from 'react';
import { AIConfig } from '../types/lyrics';
import { getSavedAILyricsStats, clearSavedAILyrics } from '../services/aiLyricsStore';
import { Bot, KeyRound, Trash2, Check, X, Sparkles, AlertTriangle } from 'lucide-react';

interface OptionsMenuProps {
  aiConfig: AIConfig;
  isBusy?: boolean;
  onSave: (config: AIConfig) => void;
}

export const OptionsMenu: React.FC<OptionsMenuProps> = ({ aiConfig, isBusy, onSave }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<AIConfig>(aiConfig);
  const [savedCount, setSavedCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    if (!isOpen) return;
    setSavedCount(getSavedAILyricsStats().count);

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isConfigured = Boolean(
    draft.enabled && draft.providerUrl.trim() && draft.model.trim() && draft.apiKey.trim()
  );

  const handleClearSaved = () => {
    clearSavedAILyrics();
    setSavedCount(0);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        title="AI fallback options"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
          isConfigured
            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
            : 'bg-slate-800 border-slate-700/60 text-slate-300 hover:text-white'
        }`}
      >
        <Bot className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">AI Options</span>
        {isConfigured && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl p-3.5 z-50">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> AI Fallback Options
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <label className="flex items-center justify-between mb-3 cursor-pointer">
            <span className="text-xs text-slate-300">Enable AI fallback</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="accent-cyan-400 w-4 h-4 rounded"
            />
          </label>

          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Provider URL</label>
              <input
                type="text"
                value={draft.providerUrl}
                onChange={(e) => setDraft((prev) => ({ ...prev, providerUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
                className="w-full bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/70"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Model</label>
              <input
                type="text"
                value={draft.model}
                onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
                placeholder="gpt-4o-mini"
                className="w-full bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/70"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                <KeyRound className="w-3 h-3" /> API Key
              </label>
              <input
                type="password"
                autoComplete="off"
                value={draft.apiKey}
                onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/70"
              />
            </div>
          </div>

          <p className="mt-2 text-[10px] text-slate-500 leading-relaxed flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-400/80" />
            Your key is kept in memory for this session only — it is never saved to disk or sent
            anywhere except your chosen provider.
          </p>

          <button
            onClick={() => onSave(draft)}
            disabled={isBusy}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 rounded-lg text-xs font-bold transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            {isBusy ? 'Retrieving lyrics…' : 'Save & Retry'}
          </button>

          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Saved AI lyrics: <span className="text-slate-200 font-mono">{savedCount}</span>
            </span>
            <button
              onClick={handleClearSaved}
              disabled={savedCount === 0}
              className="flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200 disabled:text-slate-600 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
