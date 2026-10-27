import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Bug, ChevronDown, ChevronRight, Copy, Pause, Play, Trash2, X } from 'lucide-react';
import {
  DEBUG_LEVELS,
  DEBUG_SCOPES,
  DebugEvent,
  DebugLevel,
  DebugScope,
  clearDebugEvents,
  copyDiagnosticsReport,
  getDebugEvents,
  subscribeDebug,
} from '../services/debugConsole';

interface DebugTerminalProps {
  open: boolean;
  onClose: () => void;
}

const LEVEL_STYLES: Record<DebugLevel, string> = {
  debug: 'bg-slate-700/70 text-slate-300',
  info: 'bg-cyan-500/15 text-cyan-300',
  warn: 'bg-amber-500/15 text-amber-300',
  error: 'bg-rose-500/15 text-rose-300',
};

/** Only the newest entries are rendered; the buffer itself keeps 2000. */
const MAX_RENDERED_ROWS = 400;

function formatTime(at: number): string {
  const date = new Date(at);
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3
  )}`;
}

function formatData(data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  try {
    return JSON.stringify(data);
  } catch {
    return '[unserializable]';
  }
}

/**
 * The Debug Terminal overlay (spec 17, W1).
 *
 * Renders the diagnostics ring buffer with level/scope/text filters, lets the
 * user clear it, and exports the whole session as a JSON report for bug
 * reports. Opened with Ctrl+Shift+D or from the Options menu.
 */
export const DebugTerminal: React.FC<DebugTerminalProps> = ({ open, onClose }) => {
  const events = useSyncExternalStore(subscribeDebug, getDebugEvents, getDebugEvents);
  const [levels, setLevels] = useState<DebugLevel[]>([]);
  const [scope, setScope] = useState<DebugScope | ''>('');
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((entry) => {
      if (levels.length > 0 && !levels.includes(entry.level)) return false;
      if (scope && entry.scope !== scope) return false;
      if (!needle) return true;
      const haystack = `${entry.scope} ${entry.event} ${formatData(entry.data)}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [events, levels, scope, query]);

  const visible = useMemo(
    () => filtered.slice(Math.max(0, filtered.length - MAX_RENDERED_ROWS)),
    [filtered]
  );

  useEffect(() => {
    if (!follow || !open) return;
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [visible, follow, open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!open) return null;

  const toggleLevel = (level: DebugLevel) => {
    setLevels((prev) =>
      prev.includes(level) ? prev.filter((item) => item !== level) : [...prev, level]
    );
  };

  const handleCopy = async () => {
    await copyDiagnosticsReport();
    setCopied(true);
  };

  const handleClear = () => {
    clearDebugEvents();
    setExpandedId(null);
  };

  const renderRow = (entry: DebugEvent) => {
    const expanded = expandedId === entry.id;
    const summary = formatData(entry.data);
    return (
      <li key={entry.id} className="border-b border-slate-800/70 last:border-b-0">
        <button
          type="button"
          onClick={() => setExpandedId(expanded ? null : entry.id)}
          className="flex w-full items-start gap-2 px-2 py-1 text-left hover:bg-slate-800/50"
        >
          <span className="mt-0.5 shrink-0 text-slate-500">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-slate-500 tabular-nums">
            {formatTime(entry.at)}
          </span>
          <span
            className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${LEVEL_STYLES[entry.level]}`}
          >
            {entry.level}
          </span>
          <span className="shrink-0 text-[10px] font-semibold text-cyan-300">{entry.scope}</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">
            {entry.event}
            {!expanded && summary && (
              <span className="ml-1 text-slate-500">{summary.slice(0, 120)}</span>
            )}
          </span>
        </button>
        {expanded && (
          <pre className="mx-2 mb-2 overflow-x-auto rounded bg-slate-950/80 p-2 text-[10px] leading-relaxed text-slate-300 whitespace-pre-wrap break-all">
            {summary || '{}'}
          </pre>
        )}
      </li>
    );
  };

  return (
    <div
      data-testid="debug-terminal"
      className="fixed bottom-3 right-3 z-[80] flex h-[min(460px,70vh)] w-[min(620px,92vw)] flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/95 font-mono text-slate-200 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <Bug className="h-4 w-4 text-cyan-400" />
        <span className="text-xs font-bold text-white">Debug Terminal</span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
          {events.length} events
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFollow((prev) => !prev)}
            title={follow ? 'Pause auto-scroll' : 'Resume auto-scroll'}
            className={`rounded p-1 ${follow ? 'text-cyan-400' : 'text-slate-500'} hover:bg-slate-800`}
          >
            {follow ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            title="Copy diagnostics report"
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy report'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            title="Clear events"
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
        {DEBUG_LEVELS.map((level) => {
          const active = levels.includes(level);
          return (
            <button
              key={level}
              type="button"
              onClick={() => toggleLevel(level)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                active ? LEVEL_STYLES[level] : 'bg-slate-800/60 text-slate-500 hover:text-slate-300'
              }`}
            >
              {level}
            </button>
          );
        })}
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value as DebugScope | '')}
          aria-label="Filter by scope"
          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300"
        >
          <option value="">all scopes</option>
          {DEBUG_SCOPES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="filter events"
          aria-label="Filter events"
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
        />
      </div>

      <div ref={listRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-slate-500">
            No events recorded yet. Play a track and watch the detection, lookup and provider
            decisions appear here.
          </p>
        ) : (
          <ul>{visible.map(renderRow)}</ul>
        )}
      </div>
    </div>
  );
};
