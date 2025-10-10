"use client";

import React from "react";
import CodeBlock from "./CodeBlock";

type Props = {
  open: boolean;
  title?: string;
  before?: string;
  after?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmModal({ open, title = "Confirm change", before = "", after = "", confirmLabel = "Apply change", cancelLabel = "Cancel", onConfirm, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="bg-white dark:bg-[#071126] rounded-lg shadow-2xl w-[900px] max-w-[95%] z-70 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">{title}</h3>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-sm text-muted mb-2">Before</div>
            <div className="card p-3 h-60 overflow-auto"><pre className="text-xs whitespace-pre-wrap">{before}</pre></div>
          </div>
          <div>
            <div className="text-sm text-muted mb-2">After</div>
            <div className="card p-3 h-60 overflow-auto"><pre className="text-xs whitespace-pre-wrap">{after}</pre></div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary">{cancelLabel}</button>
          <button onClick={onConfirm} className="btn-primary">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
