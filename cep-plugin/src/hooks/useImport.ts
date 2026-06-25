import { useState, useCallback } from 'react';
import { ClipboardContent, ImportResult, AppNotification } from '../types';
import { assetProcessor, ProcessedAsset } from '../services/AssetProcessor';
import { importService } from '../services/ImportService';
import { shortId } from '../utils/hashHelpers';

export type ImportPhase = 'idle' | 'processing' | 'previewing' | 'importing' | 'done' | 'error';

export interface UseImportReturn {
  phase: ImportPhase;
  processedAsset: ProcessedAsset | null;
  lastResult: ImportResult | null;
  notifications: AppNotification[];
  importNow: (content: ClipboardContent) => Promise<void>;
  startImport: (content: ClipboardContent) => Promise<void>;
  confirmImport: () => Promise<void>;
  cancelImport: () => void;
  dismissNotification: (id: string) => void;
  reimport: () => Promise<void>;
}

export function useImport(): UseImportReturn {
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [processedAsset, setProcessedAsset] = useState<ProcessedAsset | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pendingContent, setPendingContent] = useState<ClipboardContent | null>(null);

  const addNotification = useCallback(
    (
      type: AppNotification['type'],
      title: string,
      message: string,
      action?: AppNotification['action']
    ) => {
      const n: AppNotification = {
        id: shortId(),
        type,
        title,
        message,
        timestamp: Date.now(),
        duration: type === 'error' ? 6000 : 3000,
        action,
      };
      setNotifications(prev => [n, ...prev].slice(0, 5));
    },
    []
  );

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Single-shot: process → import without intermediate React state reads.
  // Avoids the stale-closure bug that breaks the two-step startImport+confirmImport flow.
  const importNow = useCallback(async (content: ClipboardContent) => {
    if (phase === 'processing' || phase === 'importing') return;
    setPhase('processing');
    try {
      const asset = await assetProcessor.process(content);
      setProcessedAsset(asset);
      setPhase('importing');
      const result = await importService.importAsset(asset, true);
      setLastResult(result);
      if (result.success) {
        addNotification('success', 'Imported', `"${result.fileName}" added to ${result.folder}`);
        setPhase('done');
        setTimeout(() => setPhase('idle'), 1500);
      } else {
        addNotification('error', 'Import Failed', result.error ?? 'Unknown error');
        setPhase('error');
        setTimeout(() => setPhase('idle'), 1000);
      }
    } catch (err: any) {
      addNotification('error', 'Import Failed', err?.message ?? 'Unknown error');
      setPhase('error');
      setTimeout(() => setPhase('idle'), 1000);
    }
  }, [phase, addNotification]);

  const startImport = useCallback(
    async (content: ClipboardContent) => {
      if (phase === 'processing' || phase === 'importing') return;

      setPhase('processing');
      setPendingContent(content);

      try {
        const asset = await assetProcessor.process(content);
        setProcessedAsset(asset);
        setPhase('previewing');
      } catch (err: any) {
        setPhase('error');
        addNotification('error', 'Processing Failed', err?.message ?? 'Could not process clipboard content');
        setTimeout(() => setPhase('idle'), 1000);
      }
    },
    [phase, addNotification]
  );

  const confirmImport = useCallback(async () => {
    if (!processedAsset) return;

    setPhase('importing');
    try {
      const result = await importService.importAsset(processedAsset);
      setLastResult(result);

      if (result.success) {
        if (result.isDuplicate) {
          addNotification(
            'warning',
            'Duplicate Detected',
            `"${result.fileName}" is already in your project.`,
            {
              label: 'Import Again',
              onClick: () => reimport(),
            }
          );
        } else {
          addNotification(
            'success',
            'Import Complete',
            `"${result.fileName}" added to ${result.folder} folder`
          );
        }
        setPhase('done');
        setTimeout(() => setPhase('idle'), 1500);
      } else {
        addNotification('error', 'Import Failed', result.error ?? 'Unknown error');
        setPhase('error');
        setTimeout(() => setPhase('idle'), 1000);
      }
    } catch (err: any) {
      addNotification('error', 'Import Failed', err?.message ?? 'Unknown error');
      setPhase('error');
      setTimeout(() => setPhase('idle'), 1000);
    }
  }, [processedAsset, addNotification]);

  const cancelImport = useCallback(() => {
    setProcessedAsset(null);
    setPendingContent(null);
    setPhase('idle');
  }, []);

  const reimport = useCallback(async () => {
    if (!processedAsset) return;
    setPhase('importing');
    const result = await importService.reimportAsset(processedAsset);
    setLastResult(result);
    if (result.success) {
      addNotification('success', 'Re-imported', `"${result.fileName}" added again`);
      setPhase('done');
      setTimeout(() => setPhase('idle'), 1500);
    } else {
      addNotification('error', 'Import Failed', result.error ?? 'Unknown error');
      setPhase('idle');
    }
  }, [processedAsset, addNotification]);

  return {
    phase,
    processedAsset,
    lastResult,
    notifications,
    importNow,
    startImport,
    confirmImport,
    cancelImport,
    dismissNotification,
    reimport,
  };
}
