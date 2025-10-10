"use client";

import React, { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  rows?: number;
};

export default function LineNumberedTextarea({ value, onChange, className = "", placeholder = "", rows = 20 }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  // Keep gutter scroll in sync with textarea
  useEffect(() => {
    const ta = textareaRef.current;
    const g = gutterRef.current;
    if (!ta || !g) return;
    const sync = () => { g.scrollTop = ta.scrollTop; };
    ta.addEventListener('scroll', sync);
    return () => ta.removeEventListener('scroll', sync);
  }, []);

  const lines = value ? value.split(/\r?\n/).length : 1;

  return (
    <div className={`line-textarea-wrapper flex border rounded-md overflow-hidden ${className}`}>
      <div ref={gutterRef} className="bg-[#f3f4f6] dark:bg-[#071126] text-muted px-3 py-2 text-sm select-none" style={{minWidth: 48, maxHeight: rows * 24, overflow: 'auto'}}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} style={{height: 22, lineHeight: '22px', textAlign: 'right', paddingRight: 8, color: 'rgba(107,112,128,0.9)'}}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1 p-4 resize-none font-mono text-sm bg-transparent"
        style={{border: 'none', outline: 'none', minHeight: rows * 24}}
      />
    </div>
  );
}
