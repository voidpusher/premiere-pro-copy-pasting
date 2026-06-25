import { useState, useEffect, useCallback, useRef } from 'react';
import { ClipboardContent, ConnectionStatus } from '../types';
import { clipboardService } from '../services/ClipboardService';

export interface UseClipboardReturn {
  clipboardContent: ClipboardContent | null;
  connectionStatus: ConnectionStatus;
  requestClipboard: () => void;
  clearClipboard: () => void;
}

export function useClipboard(): UseClipboardReturn {
  const [clipboardContent, setClipboardContent] = useState<ClipboardContent | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    clipboardService.getStatus()
  );
  const lastTimestampRef = useRef<number>(0);

  useEffect(() => {
    const unsubClip = clipboardService.onClipboardChange((content) => {
      // Ignore stale events
      if (content.timestamp <= lastTimestampRef.current) return;
      lastTimestampRef.current = content.timestamp;
      setClipboardContent(content);
    });

    const unsubStatus = clipboardService.onStatusChange((status) => {
      setConnectionStatus(status);
    });

    return () => {
      unsubClip();
      unsubStatus();
    };
  }, []);

  const requestClipboard = useCallback(() => {
    clipboardService.requestClipboard();
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboardContent(null);
    lastTimestampRef.current = 0;
  }, []);

  return { clipboardContent, connectionStatus, requestClipboard, clearClipboard };
}
