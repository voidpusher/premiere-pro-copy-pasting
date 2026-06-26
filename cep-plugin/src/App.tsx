import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PasteButton } from './components/PasteButton';
import { AssetPreview } from './components/AssetPreview';
import { NotificationSystem } from './components/NotificationSystem';
import { RecentImports } from './components/RecentImports';
import { SettingsPanel } from './components/SettingsPanel';
import { useClipboard } from './hooks/useClipboard';
import { useImport } from './hooks/useImport';
import { useLicense } from './hooks/useLicense';
import { LicenseGate } from './components/LicenseGate';
import { storageService } from './services/StorageService';
import { importService } from './services/ImportService';
import { ConnectionStatus, RecentImport } from './types';
import './styles/App.css';

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Ready',
  disconnected: 'Stopped',
  connecting: 'Starting…',
  error: 'Monitor error — restart Premiere',
};

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: '#27ae60',
  disconnected: '#e74c3c',
  connecting: '#f39c12',
  error: '#e74c3c',
};

export const App: React.FC = () => {
  const { clipboardContent, connectionStatus, requestClipboard, clearClipboard } = useClipboard();
  const {
    phase,
    processedAsset,
    notifications,
    importNow,
    startImport,
    confirmImport,
    cancelImport,
    dismissNotification,
  } = useImport();

  const license = useLicense();

  const [showSettings, setShowSettings] = useState(false);
  const [recentImports, setRecentImports] = useState<RecentImport[]>(() =>
    storageService.getRecentImports()
  );

  const settings = storageService.getSettings();

  // Pre-enable Premiere's QE DOM once at startup so auto-creating a video track
  // later doesn't trigger a timeline zoom/refresh during a paste.
  useEffect(() => {
    importService.initHost();
  }, []);

  // Refresh recent imports when phase transitions to done
  useEffect(() => {
    if (phase === 'done') {
      setRecentImports(storageService.getRecentImports());
    }
  }, [phase]);

  const handleConfirm = useCallback(async () => {
    await confirmImport();
    clearClipboard();
  }, [confirmImport, clearClipboard]);

  const handlePaste = useCallback(async () => {
    // If the user already went through the preview flow, confirm it
    if (phase === 'previewing') {
      await handleConfirm();
      return;
    }
    if (phase === 'processing' || phase === 'importing') return;

    if (!clipboardContent || clipboardContent.type === 'unknown') {
      // Ask helper for current clipboard; banner will appear when it responds
      requestClipboard();
      return;
    }

    await importNow(clipboardContent);
  }, [clipboardContent, phase, requestClipboard, importNow, handleConfirm]);

  // Auto-trigger import when clipboard changes (if enabled)
  useEffect(() => {
    if (!clipboardContent || clipboardContent.type === 'unknown') return;
    if (settings.autoDetectClipboard && settings.autoImportOnPaste) {
      importNow(clipboardContent);
    }
  }, [clipboardContent]);

  // Global keyboard shortcut: Ctrl+Shift+V → paste
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        handlePaste();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handlePaste]);

  // ─── License gate ────────────────────────────────────────────────────────────
  // Placed after all hooks so the hook order stays stable across renders.
  if (license.status === 'checking') {
    return (
      <div className="license-splash">
        <div className="license-spinner" />
        <span>Checking license…</span>
      </div>
    );
  }
  if (license.status !== 'licensed') {
    return (
      <LicenseGate
        busy={license.busy}
        startLogin={license.startLogin}
        verifyCode={license.verifyCode}
        startPolling={license.startPolling}
        stopPolling={license.stopPolling}
      />
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <svg viewBox="0 0 28 28" fill="none" className="logo-icon">
            <rect x="4" y="4" width="20" height="20" rx="4" fill="#4f86f7" opacity="0.15" />
            <path
              d="M9 14h10M14 9v10"
              stroke="#4f86f7"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="app-title">Instant Paste</span>
          <span className="app-version">1.0</span>
        </div>
        <div className="header-actions">
          <div
            className="connection-dot"
            style={{ background: STATUS_COLORS[connectionStatus] }}
            title={STATUS_LABELS[connectionStatus]}
          />
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="app-main">
        {/* Paste Button */}
        <div className="paste-section">
          <PasteButton onPaste={handlePaste} phase={phase} />
          {connectionStatus === 'error' && (
            <p className="helper-hint">
              Clipboard monitor failed to start. Try closing and reopening the panel.
            </p>
          )}
        </div>

        {/* Clipboard detection indicator */}
        {clipboardContent && clipboardContent.type !== 'unknown' && phase === 'idle' && (
          <div className="clipboard-ready-banner">
            <span className="pulse-dot" />
            <span>
              {clipboardContent.type === 'url'
                ? 'Image URL detected in clipboard'
                : clipboardContent.type === 'screenshot'
                ? 'Screenshot detected in clipboard'
                : 'Image detected in clipboard'}
            </span>
            <button
              className="btn btn--xs btn--primary"
              onClick={handlePaste}
            >
              Import
            </button>
          </div>
        )}

        {/* Asset Preview */}
        <AssetPreview
          clipboardContent={clipboardContent}
          processedAsset={processedAsset}
          phase={phase}
          onConfirm={handleConfirm}
          onCancel={cancelImport}
        />

        {/* Recent Imports */}
        <RecentImports
          imports={recentImports}
          onClear={() => setRecentImports([])}
        />
      </main>

      {/* Notification Toast Stack */}
      <NotificationSystem
        notifications={notifications}
        onDismiss={dismissNotification}
      />

      {/* Settings Panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
};
