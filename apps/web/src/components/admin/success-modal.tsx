'use client';

import React, { useEffect } from 'react';

export type SuccessPopupDetail = {
  label: string;
  value: string;
};

export type SuccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  badge?: string;
  title: string;
  subtitle?: string;
  details?: SuccessPopupDetail[];
  note?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
};

export function SuccessModal({
  isOpen,
  onClose,
  badge = 'SUCCESSFULLY CREATED',
  title,
  subtitle,
  details = [],
  note = 'Committed atomically to institution registry & audit trail',
  primaryAction,
  secondaryAction,
}: SuccessModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="dashboard-success-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="dashboard-success-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-modal-title"
      >
        <button
          type="button"
          className="dashboard-success-close"
          onClick={onClose}
          aria-label="Close confirmation popup"
        >
          ✕
        </button>

        <div className="dashboard-success-hero-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <span className="dashboard-success-eyebrow">
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#075e47',
              display: 'inline-block',
            }}
          />
          {badge}
        </span>

        <h3 id="success-modal-title" className="dashboard-success-title">
          {title}
        </h3>

        {subtitle && <p className="dashboard-success-subtitle">{subtitle}</p>}

        {details.length > 0 && (
          <div className="dashboard-success-card">
            {details.map((item, idx) => (
              <div key={idx} className="dashboard-success-row">
                <span className="dashboard-success-label">{item.label}</span>
                <span className="dashboard-success-value">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {note && (
          <div className="dashboard-success-note">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{note}</span>
          </div>
        )}

        <div className="dashboard-success-actions">
          {secondaryAction && (
            <button
              type="button"
              className="button secondary"
              style={{
                borderRadius: '9999px',
                padding: '9px 20px',
                fontWeight: 600,
                fontSize: '13.5px',
              }}
              onClick={() => {
                secondaryAction.onClick();
              }}
            >
              {secondaryAction.label}
            </button>
          )}

          <button
            type="button"
            className="button primary"
            style={{
              borderRadius: '9999px',
              padding: '10px 24px',
              fontWeight: 600,
              fontSize: '14px',
              boxShadow: '0 4px 14px rgba(6, 51, 49, 0.25)',
            }}
            onClick={() => {
              if (primaryAction?.onClick) {
                primaryAction.onClick();
              } else {
                onClose();
              }
            }}
          >
            {primaryAction?.label || 'Awesome, Done ✓'}
          </button>
        </div>
      </div>
    </>
  );
}
