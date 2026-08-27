"use client";

import { useState } from "react";
import { Modal } from "./Modal";

const PRESETS = ["Where are you?", "Please bring my phone.", "Come home now.", "Call me back."];

export function MessageComposer({
  targetLabel,
  onSend,
  onClose,
}: {
  targetLabel: string;
  onSend: (message: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");

  return (
    <Modal title={`Message ${targetLabel}`} onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setText(p)}
            className="rounded-full border border-border bg-bg px-3 py-1.5 text-xs text-text-muted transition hover:border-signal/50 hover:text-signal"
          >
            {p}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 280))}
        placeholder="Type a message…"
        rows={3}
        className="mt-3 w-full resize-none rounded-lg border border-border bg-bg p-3 text-sm placeholder:text-text-muted focus:border-signal/60 focus:outline-none"
      />
      <div className="mt-1 text-right font-mono text-[11px] text-text-muted">
        {text.length}/280
      </div>
      <button
        onClick={() => text.trim() && onSend(text.trim())}
        disabled={!text.trim()}
        className="mt-3 w-full rounded-lg bg-signal px-3 py-2.5 text-sm font-semibold text-bg transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Send
      </button>
    </Modal>
  );
}
