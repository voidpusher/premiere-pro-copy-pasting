import React, { useState } from 'react';
import { ClipboardContent } from '../types';
import { ProcessedAsset } from '../services/AssetProcessor';
import { ImportPhase } from '../hooks/useImport';

interface Props {
  clipboardContent: ClipboardContent | null;
  processedAsset: ProcessedAsset | null;
  phase: ImportPhase;
  onConfirm: () => void;
  onCancel: () => void;
}

export const AssetPreview: React.FC<Props> = ({
  clipboardContent,
  processedAsset,
  phase,
  onConfirm,
  onCancel,
}) => {
  const [imageError, setImageError] = useState(false);

  if (!clipboardContent && !processedAsset) {
    return (
      <div className="preview-empty">
        <div className="preview-empty-icon">
          <svg viewBox="0 0 48 48" fill="none">
            <rect x="8" y="8" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
            <path d="M24 18v12M18 24h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <p className="preview-empty-text">Copy an image or URL,<br />then click Paste</p>
      </div>
    );
  }

  const showImage = processedAsset?.thumbnail && !imageError;
  const isProcessing = phase === 'processing';
  const isPreviewing = phase === 'previewing';
  const isImporting = phase === 'importing';

  const typeLabel =
    processedAsset?.folder === 'Screenshots'
      ? 'Screenshot'
      : processedAsset?.folder === 'Downloads'
      ? 'URL Download'
      : 'Browser Image';

  const targetFolder = processedAsset?.folder ?? '—';

  return (
    <div className="preview-container">
      <div className="preview-header">
        <span className="preview-label">Clipboard Preview</span>
        {processedAsset && (
          <span className={`preview-badge preview-badge--${processedAsset.folder.toLowerCase()}`}>
            {typeLabel}
          </span>
        )}
      </div>

      <div className="preview-image-wrap">
        {isProcessing && (
          <div className="preview-loading">
            <div className="loading-spinner" />
            <span>Reading clipboard…</span>
          </div>
        )}

        {!isProcessing && showImage && (
          <img
            src={processedAsset!.thumbnail}
            alt="Preview"
            className="preview-image"
            onError={() => setImageError(true)}
          />
        )}

        {!isProcessing && !showImage && clipboardContent?.url && (
          <div className="preview-url-card">
            <svg viewBox="0 0 24 24" fill="none" className="url-icon">
              <path
                d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              />
              <path
                d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              />
            </svg>
            <span className="url-text" title={clipboardContent.url}>
              {clipboardContent.url.length > 60
                ? clipboardContent.url.slice(0, 57) + '...'
                : clipboardContent.url}
            </span>
          </div>
        )}

        {!isProcessing && imageError && (
          <div className="preview-error-state">
            <span>⚠ Preview unavailable</span>
          </div>
        )}

        {isImporting && (
          <div className="preview-overlay">
            <div className="loading-spinner loading-spinner--lg" />
            <span>Importing to Premiere…</span>
          </div>
        )}
      </div>

      {processedAsset && (
        <div className="preview-meta">
          <div className="meta-row">
            <span className="meta-key">Format</span>
            <span className="meta-value">{processedAsset.mimeType.split('/')[1].toUpperCase()}</span>
          </div>
          <div className="meta-row">
            <span className="meta-key">Destination</span>
            <span className="meta-value">
              Imported Assets / <strong>{targetFolder}</strong>
            </span>
          </div>
        </div>
      )}

      {isPreviewing && processedAsset && (
        <div className="preview-actions">
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={onConfirm}>
            Import to Premiere
          </button>
        </div>
      )}
    </div>
  );
};
