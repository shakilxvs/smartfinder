"use client";

import { Modal } from "./Modal";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-text-muted">{body}</p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
            danger
              ? "bg-danger text-bg hover:brightness-110"
              : "bg-signal text-bg hover:brightness-110"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
