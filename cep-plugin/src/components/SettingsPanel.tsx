import React, { useState } from 'react';
import { PluginSettings, DEFAULT_SETTINGS } from '../types';
import { storageService } from '../services/StorageService';

interface Props {
  onClose: () => void;
}

export const SettingsPanel: React.FC<Props> = ({ onClose }) => {
  const [settings, setSettings] = useState<PluginSettings>(storageService.getSettings);

  const update = <K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    storageService.saveSettings(next);
  };

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-body">
          <div className="setting-row">
            <div className="setting-label">
              <span>Auto-detect clipboard changes</span>
              <p className="setting-desc">Monitor clipboard automatically every 120ms</p>
            </div>
            <Toggle
              checked={settings.autoDetectClipboard}
              onChange={v => update('autoDetectClipboard', v)}
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span>Show preview before import</span>
              <p className="setting-desc">Confirm before adding asset to Premiere</p>
            </div>
            <Toggle
              checked={settings.showPreviewBeforeImport}
              onChange={v => update('showPreviewBeforeImport', v)}
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span>Auto-import on paste</span>
              <p className="setting-desc">Skip preview and import immediately</p>
            </div>
            <Toggle
              checked={settings.autoImportOnPaste}
              onChange={v => update('autoImportOnPaste', v)}
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span>Max recent imports</span>
            </div>
            <select
              className="setting-select"
              value={settings.maxRecentImports}
              onChange={e => update('maxRecentImports', Number(e.target.value))}
            >
              {[10, 20, 30, 50].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-footer">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              storageService.resetSettings();
              setSettings({ ...DEFAULT_SETTINGS });
            }}
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
};

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <button
    role="switch"
    aria-checked={checked}
    className={`toggle ${checked ? 'toggle--on' : ''}`}
    onClick={() => onChange(!checked)}
  />
);
