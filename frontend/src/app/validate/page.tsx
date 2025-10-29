"use client";

import React, { useState } from "react";
import CodeBlock from "../../components/CodeBlock";
import LineNumberedTextarea from "../../components/LineNumberedTextarea";
import { getApiUrls } from "../../lib/getApiUrls";

const SCHEMA_OPTIONS = [
  { value: "none", label: "No Schema" },
  { value: "kubernetes", label: "Kubernetes" },
  { value: "helm", label: "Helm Chart" },
  { value: "json", label: "JSON Schema" },
  { value: "custom", label: "Custom Schema" },
];

const SCHEMA_TEMPLATES: Record<string, string> = {
  jsonSchema: `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "version": { "type": "string" }
  },
  "required": ["name"]
}`,
  kubernetes: `apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\nspec:\n  containers:\n    - name: app\n      image: nginx:latest`,
  helm: `# values.yaml\nreplicaCount: 1\nimage:\n  repository: nginx\n  tag: "stable"`,
};

type SchemaOption = "none" | "kubernetes" | "helm" | "json" | "custom";

export default function ValidatePage() {
  const [content, setContent] = useState("");
  const [schema, setSchema] = useState<SchemaOption>("none");
  // When using custom schema, separate the schema/rules from the resource input
  const [schemaContent, setSchemaContent] = useState("");
  const [useAI, setUseAI] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const isCustom = schema === "custom";

  const loadTemplate = (k: string) => {
    const t = (SCHEMA_TEMPLATES as any)[k];
    if (t) setContent(t);
  };

  const validate = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const urls = getApiUrls();
      const body = isCustom
        ? { content: content || "", filename: "input.yaml", schema: "custom", schemaContent: schemaContent, useAI }
        : { content, filename: "input.yaml", schema: schema === "none" ? "" : schema, useAI };

      let lastErr: any = null;
      let resp: Response | null = null;
      for (const base of urls) {
        try {
          resp = await fetch(`${base}/api/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (resp.ok) break;
          lastErr = await resp.text();
        } catch (e) {
          lastErr = e;
        }
      }
      if (!resp || !resp.ok) throw new Error(typeof lastErr === "string" ? lastErr : lastErr?.message ?? "request failed");
      const data = await resp.json();
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const autoFix = async () => {
    if (!content.trim() || isCustom) return;
    setLoading(true);
    try {
      const urls = getApiUrls();
      let lastErr: any = null;
      let resp: Response | null = null;
      for (const base of urls) {
        try {
          resp = await fetch(`${base}/api/fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, schema: schema === "none" ? "" : schema, useAI }) });
          if (resp.ok) break;
          lastErr = await resp.text();
        } catch (e) {
          lastErr = e;
        }
      }
      if (!resp || !resp.ok) throw new Error(typeof lastErr === "string" ? lastErr : lastErr?.message ?? "request failed");
      const data = await resp.json();
      if (data.fixedContent) setContent(data.fixedContent);
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold mb-3">YAML/JSON Validator</h1>
      <p className="text-sm text-muted-foreground mb-6">Validate and optionally auto-fix YAML/JSON. Supports Kubernetes, Helm and custom schema snippets.</p>

      <div className="space-y-4">
        <div className="border rounded p-4">
          <div className="mb-2 font-medium">Schema</div>
          <div className="mb-3">
            <label className="block text-sm mb-1">Validation Schema</label>
            <select value={schema} onChange={(e) => setSchema(e.target.value as SchemaOption)} className="w-full p-2 border rounded">
              {SCHEMA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {isCustom && (
            <div className="mb-3">
              <div className="text-sm mb-1">Quick templates</div>
              <div className="flex gap-2">
                <button onClick={() => { setSchemaContent(SCHEMA_TEMPLATES.jsonSchema); }} className="px-2 py-1 border rounded">JSON Schema</button>
                <button onClick={() => { setSchemaContent(SCHEMA_TEMPLATES.kubernetes); }} className="px-2 py-1 border rounded">Kubernetes</button>
                <button onClick={() => { setSchemaContent(SCHEMA_TEMPLATES.helm); }} className="px-2 py-1 border rounded">Helm</button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input id="use-ai" type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
            <label htmlFor="use-ai" className="text-sm">Use AI suggestions</label>
          </div>
        </div>

        {isCustom ? (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block mb-2 font-medium">Schema / Rules</label>
              <LineNumberedTextarea value={schemaContent} onChange={(e) => setSchemaContent(e.target.value)} placeholder={"Paste JSON Schema or rules here..."} rows={10} />
            </div>
            <div>
              <label className="block mb-2 font-medium">Resource Input</label>
              <LineNumberedTextarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={"Paste the YAML/JSON resource to validate here..."} rows={10} />
            </div>
          </div>
        ) : (
          <div>
            <label className="block mb-2 font-medium">Input</label>
            <LineNumberedTextarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={'Paste your YAML/JSON here...'} rows={18} />
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={validate} disabled={loading || (!isCustom && !content.trim()) || (isCustom && !schemaContent.trim())} className="flex-1 px-3 py-2 bg-blue-600 text-white rounded">{loading ? 'Validating...' : 'Validate'}</button>
          {!isCustom && (
            <button onClick={autoFix} disabled={loading || !content.trim()} className="flex-1 px-3 py-2 border rounded">{loading ? 'Fixing...' : 'Auto-fix'}</button>
          )}
        </div>

        {result && (
          <div className="space-y-3">
            <div className={`p-3 rounded text-sm ${result.isValid || result.success ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
              {result.isValid || result.success ? '✓ Validation passed' : '✗ Validation failed'}
              {result.error ? ` — ${result.error}` : ''}
            </div>

            {/* Show detailed errors from backend */}
            {Array.isArray(result.errors) && result.errors.length > 0 && (
              <div className="p-3 border border-red-200 rounded bg-red-50">
                <div className="font-medium mb-2 text-red-700">Validation Errors</div>
                <div className="space-y-2">
                  {result.errors.map((err: any, i: number) => (
                    <div key={i} className="text-sm">
                      {err.line && err.line > 0 && (
                        <div className="font-medium text-red-600">Line {err.line}:</div>
                      )}
                      <div className="text-red-700">{err.message || String(err)}</div>
                      {err.severity && (
                        <div className="text-xs text-red-500 mt-1">Severity: {err.severity}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Show suggested fixes */}
            {Array.isArray(result.suggestedFixes) && result.suggestedFixes.length > 0 && (
              <div className="p-3 border border-yellow-200 rounded bg-yellow-50">
                <div className="font-medium mb-2 text-yellow-700">Suggested Fixes</div>
                <div className="space-y-3">
                  {result.suggestedFixes.map((fix: any, i: number) => (
                    <div key={i} className="text-sm">
                      <div className="font-medium text-yellow-700">{fix.shortDescription}</div>
                      {fix.confidence && (
                        <div className="text-xs text-yellow-600 mb-2">Confidence: {fix.confidence}</div>
                      )}
                      {fix.fixedSnippet && (
                        <pre className="bg-white p-2 rounded text-xs overflow-auto border">{fix.fixedSnippet}</pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(result.fixes) && result.fixes.length > 0 && (
              <div className="p-3 border rounded">
                <div className="font-medium mb-2">Auto-fixes Applied</div>
                <ul className="list-disc pl-5 text-sm">{result.fixes.map((f: any, i: number) => <li key={i}>{String(f)}</li>)}</ul>
              </div>
            )}

            {result.suggestions && (
              <div className="p-3 border rounded">
                <div className="font-medium mb-2">AI Suggestions</div>
                <pre className="text-sm whitespace-pre-wrap">{String(result.suggestions)}</pre>
              </div>
            )}

            {result.fixedContent && (
              <div className="p-3 border rounded">
                <div className="font-medium mb-2">Fixed Content</div>
                <CodeBlock language="yaml" code={String(result.fixedContent)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}