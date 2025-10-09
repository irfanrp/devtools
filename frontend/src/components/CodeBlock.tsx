"use client";
import React from "react";
import Highlight, { defaultProps } from "prism-react-renderer";
import theme from "prism-react-renderer/themes/duotoneLight";

export default function CodeBlock({ code = "", language = "hcl", title = "" }: { code?: string; language?: string; title?: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    // Could add a small tooltip or toast later
  };

  return (
    <div className="card relative">
      <div className="code-header flex items-center justify-between">
        <div className="text-sm font-medium muted">{title}</div>
        <div className="flex gap-2">
          <button onClick={copy} className="text-sm px-2 py-0.5 btn-primary">Copy</button>
        </div>
      </div>
      <div className="p-2 max-h-[360px] overflow-auto bg-transparent text-sm">
        {/* eslint-disable @typescript-eslint/no-explicit-any */}
        <Highlight {...(defaultProps as any)} code={code as any} theme={theme as any} language={language as any}>
          {(props: any) => {
            const { className, style, tokens, getLineProps, getTokenProps } = props as any;
            return (
              <pre className={`${className} code-with-lines`} style={{ ...style, background: 'transparent' }}>
                {tokens.map((line: any, i: number) => {
                  const lineProps = getLineProps({ line, key: i });
                  const { key: _, ...linePropsWithoutKey } = lineProps;
                  return (
                    <div key={i} {...linePropsWithoutKey} className="code-line flex items-start">
                      <span className="line-number" aria-hidden>{i + 1}</span>
                      <span className="line-content">
                        {line.map((token: any, tokenIndex: number) => {
                          const tokenProps = getTokenProps({ token, key: tokenIndex });
                          const { key: __, ...tokenPropsWithoutKey } = tokenProps;
                          return (
                            <span key={tokenIndex} {...tokenPropsWithoutKey} />
                          );
                        })}
                      </span>
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
