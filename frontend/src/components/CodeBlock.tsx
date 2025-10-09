"use client";
import React from "react";
import Highlight, { defaultProps } from "prism-react-renderer";
import theme from "prism-react-renderer/themes/nightOwl";

export default function CodeBlock({ code = "", language = "hcl", title = "" }: { code?: string; language?: string; title?: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    // small visual feedback could be added
  };

  return (
    <div className="relative rounded border border-gray-600 bg-[#011627]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-600 bg-[#0d1421]">
        <div className="text-sm font-medium text-gray-200">{title}</div>
        <div className="flex gap-2">
          <button onClick={copy} className="text-sm px-2 py-1 bg-slate-600 text-gray-200 rounded hover:bg-slate-500">Copy</button>
        </div>
      </div>
      <div className="p-3 max-h-[420px] overflow-auto bg-[#011627] text-sm">
        {/* eslint-disable @typescript-eslint/no-explicit-any */}
        <Highlight {...(defaultProps as any)} code={code as any} theme={theme as any} language={language as any}>
          {(props: any) => {
            const { className, style, tokens, getLineProps, getTokenProps } = props as any;
            return (
              <pre className={className} style={{ ...style, background: 'transparent' }}>
                {tokens.map((line: any, i: number) => {
                  const lineProps = getLineProps({ line, key: i });
                  const { key: _, ...linePropsWithoutKey } = lineProps;
                  return (
                    <div key={i} {...linePropsWithoutKey}>
                      {line.map((token: any, tokenIndex: number) => {
                        const tokenProps = getTokenProps({ token, key: tokenIndex });
                        const { key: __, ...tokenPropsWithoutKey } = tokenProps;
                        return (
                          <span key={tokenIndex} {...tokenPropsWithoutKey} />
                        );
                      })}
                    </div>
                  );
                })}
              </pre>
            );
          }}
        </Highlight>
      </div>
    </div>
  );
}
