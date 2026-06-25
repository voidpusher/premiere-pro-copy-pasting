import React, { useState } from 'react';
import { RecentImport } from '../types';
import { storageService } from '../services/StorageService';

interface Props {
  imports: RecentImport[];
  onClear: () => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

const FOLDER_COLORS: Record<string, string> = {
  Images: '#4f86f7',
  Screenshots: '#7c6af7',
  Downloads: '#27ae60',
};

export const RecentImports: React.FC<Props> = ({ imports, onClear }) => {
  const [expanded, setExpanded] = useState(true);

  if (imports.length === 0) return null;

  return (
    <div className="recent-section">
      <div className="recent-header" onClick={() => setExpanded(e => !e)}>
        <span className="recent-title">Recent Imports</span>
        <div className="recent-header-right">
          <span className="recent-count">{imports.length}</span>
          <button
            className="recent-clear-btn"
            onClick={(e) => {
              e.stopPropagation();
              storageService.clearRecentImports();
              onClear();
            }}
            title="Clear history"
          >
            Clear
          </button>
          <svg
            className={`chevron ${expanded ? 'chevron--up' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="recent-list">
          {imports.map(item => (
            <div key={item.id} className="recent-item">
              <div className="recent-thumb">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.fileName} />
                ) : (
                  <div className="recent-thumb-placeholder">
                    {item.type === 'screenshot' ? '📸' : item.type === 'url' ? '🔗' : '🖼'}
                  </div>
                )}
              </div>
              <div className="recent-info">
                <span
                  className="recent-filename"
                  title={item.fileName}
                >
                  {item.fileName.length > 24
                    ? item.fileName.slice(0, 22) + '…'
                    : item.fileName}
                </span>
                <div className="recent-meta">
                  <span
                    className="recent-folder"
                    style={{ color: FOLDER_COLORS[item.folder] ?? '#aaa' }}
                  >
                    {item.folder}
                  </span>
                  <span className="recent-time">{timeAgo(item.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
