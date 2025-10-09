"use client";
import React from "react";

export default function ThemeToggle() {
  // start as null so SSR and client initial render match; determine theme on mount
  const [theme, setTheme] = React.useState<'light' | 'dark' | null>(null);

  // apply theme and persist
  React.useEffect(() => {
    try {
      // if theme is null, compute initial preference from storage or system
      let t: 'light' | 'dark' | null = theme;
      if (!t) {
        const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
        if (stored) t = stored;
        else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
        else t = 'light';
        setTheme(t);
      }

      if (t) {
        document.body.setAttribute('data-theme', t);
        localStorage.setItem('theme', t);
      }
    } catch (e) {}
  }, [theme]);

  // listen to system preference changes, but don't override user choice
  React.useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        try {
          const stored = localStorage.getItem('theme');
          if (!stored) setTheme(e.matches ? 'dark' : 'light');
        } catch (err) {}
      };
      try { mq.addEventListener('change', handler); } catch (e) { mq.addListener(handler); }
      return () => { try { mq.removeEventListener('change', handler); } catch (e) { mq.removeListener(handler); } };
    } catch (e) {
      return;
    }
  }, []);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <div className="theme-toggle">
      <button
        role="switch"
        aria-checked={theme === 'dark'}
        aria-label="Toggle color theme"
        className={`toggle-pill ${theme === 'dark' ? 'is-dark' : ''}`}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        <svg className="icon icon-sun" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path fill="currentColor" d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.79 1.8-1.79zM1 13h3v-2H1v2zm10-9h2V1h-2v3zm7.04 1.05l1.79-1.79-1.79-1.79-1.79 1.79 1.79 1.79zM17 13a5 5 0 11-10 0 5 5 0 0110 0zm2 0h3v-2h-3v2zM6.76 19.16l-1.79 1.79 1.79 1.79 1.79-1.79-1.79-1.79zM12 21h2v-3h-2v3zm8.83-3.17l-1.79-1.79-1.79 1.79 1.79 1.79 1.79-1.79z" />
        </svg>
        <svg className="icon icon-moon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path fill="currentColor" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
