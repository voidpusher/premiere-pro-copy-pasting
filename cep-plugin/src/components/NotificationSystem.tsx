import React, { useEffect } from 'react';
import { AppNotification } from '../types';

interface Props {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}

const TYPE_ICONS: Record<AppNotification['type'], string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export const NotificationSystem: React.FC<Props> = ({ notifications, onDismiss }) => {
  useEffect(() => {
    notifications.forEach(n => {
      if (n.duration && n.duration > 0) {
        const timer = setTimeout(() => onDismiss(n.id), n.duration);
        return () => clearTimeout(timer);
      }
    });
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  return (
    <div className="notification-stack" role="region" aria-label="Notifications">
      {notifications.map(n => (
        <div
          key={n.id}
          className={`notification notification--${n.type}`}
          role="alert"
        >
          <div className="notification-icon">{TYPE_ICONS[n.type]}</div>
          <div className="notification-body">
            <div className="notification-title">{n.title}</div>
            <div className="notification-message">{n.message}</div>
            {n.action && (
              <button
                className="notification-action"
                onClick={() => {
                  n.action!.onClick();
                  onDismiss(n.id);
                }}
              >
                {n.action.label}
              </button>
            )}
          </div>
          <button
            className="notification-dismiss"
            onClick={() => onDismiss(n.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
