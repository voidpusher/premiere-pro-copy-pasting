import React from 'react';
import { ImportPhase } from '../hooks/useImport';

interface Props {
  onPaste: () => void;
  phase: ImportPhase;
  disabled?: boolean;
}

const PHASE_LABELS: Record<ImportPhase, string> = {
  idle: 'Paste Clipboard',
  processing: 'Reading...',
  previewing: 'Paste Clipboard',
  importing: 'Importing...',
  done: 'Imported!',
  error: 'Try Again',
};

export const PasteButton: React.FC<Props> = ({ onPaste, phase, disabled }) => {
  const isLoading = phase === 'processing' || phase === 'importing';
  const isDone = phase === 'done';

  return (
    <button
      className={`paste-btn ${isLoading ? 'loading' : ''} ${isDone ? 'done' : ''}`}
      onClick={onPaste}
      disabled={disabled || isLoading}
      title="Read current clipboard content and import to Premiere (Ctrl+Shift+V)"
    >
      {isLoading && <span className="spinner" />}
      {isDone && <span className="check-icon">✓</span>}
      {!isLoading && !isDone && (
        <svg viewBox="0 0 24 24" fill="none" className="paste-icon">
          <path
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="2" />
          <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      <span className="btn-label">{PHASE_LABELS[phase]}</span>
      <kbd className="shortcut-hint">Ctrl+Shift+V</kbd>
    </button>
  );
};
