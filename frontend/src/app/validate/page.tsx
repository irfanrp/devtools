"use client";

import { useState } from "react";
import CodeBlock from "../../components/CodeBlock";
import LineNumberedTextarea from '../../components/LineNumberedTextarea';
import { getApiUrls } from "../../lib/getApiUrls";
import YAML from 'js-yaml';
import ConfirmModal from '../../components/ConfirmModal';
import { moveNameIntoMetadata } from '../../lib/yamlTransforms';

type ValidationResult = {
  isValid: boolean;
  errors: Array<{
    line: number;
    column: number;
    message: string;
    severity: "error" | "warning";
  }>;
  fixes?: {
    formatted: string;
    changes: Array<{
      line: number;
      description: string;
    }>;
  };
};

type SchemaType = "kubernetes" | "helm" | "custom" | "none";

export default function ValidatePage() {
  const [input, setInput] = useState("");
  const [schema, setSchema] = useState<SchemaType>("none");
  const [schemaContent, setSchemaContent] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTransformModal, setShowTransformModal] = useState(false);
  const [transformPreview, setTransformPreview] = useState<string | null>(null);

  // derived safely-typed locals to avoid nullable access in JSX
  const errors = result?.errors ?? [];
  const fixesChanges = result?.fixes?.changes ?? [];
  const formattedOutput = result?.fixes?.formatted ?? null;
  const isValid = result?.isValid ?? false;
  const autoFixRefused = (result?.errors ?? []).some(e => /auto-?fix refused|auto-?fix disabled|auto-?fix/i.test(e.message || '')) ?? false;

  const validate = async () => {
    setLoading(true);
    try {
      // client-side sanity checks for common YAML structural mistakes
      try {
        const parsed = YAML.load(input) as any;
        
        // Reject documents that explicitly set metadata: null (common mistake)
        if (parsed && parsed.hasOwnProperty('metadata') && parsed.metadata === null) {
          const line = findLineForKey(input, 'metadata');
          setResult({ isValid: false, errors: [{ line: line ?? 0, column: 0, message: 'Invalid document: `metadata` is null. Resources must have metadata as a mapping (object).', severity: 'error' }] });
          setLoading(false);
          return;
        }

        // Reject when a top-level `name` exists but metadata.name is missing (common mistake)
        if (parsed && parsed.hasOwnProperty('name') && (!parsed.metadata || !parsed.metadata.hasOwnProperty('name'))) {
          const line = findLineForKey(input, 'name');
          setResult({ isValid: false, errors: [{ line: line ?? 0, column: 0, message: 'Invalid structure: `name` should be under `metadata.name`. Move the `name` into `metadata`.', severity: 'error' }] });
          setLoading(false);
          return;
        }
      } catch (e) {
        // if YAML parsing fails here, let the server handle detailed errors
      }

      const payload = {
        content: input,
        schema: schema === "none" ? undefined : schema,
        schemaContent: schema === "custom" ? schemaContent : undefined
      };

  const urls = getApiUrls();
      let resp: Response | null = null;
      let error: any = null;

      for (const baseUrl of urls) {
        try {
          resp = await fetch(`${baseUrl}/api/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (resp.ok) break;
          error = await resp.text();
        } catch (e) {
          error = e;
          continue;
        }
      }

      if (!resp?.ok) {
        const errorMessage = error instanceof Error ? error.message :
          typeof error === "string" ?
            (error.includes("<!DOCTYPE html>") ? "Could not connect to backend service" : error) :
            "Failed to reach backend service";
        throw new Error(errorMessage);
      }

      const resData = await resp.json();
      setResult(resData);
    } catch (err) {
      console.error("Validation failed:", err);
      setResult({
        isValid: false,
        errors: [{
          line: 0,
          column: 0,
          message: err instanceof Error ? err.message : "Validation failed",
          severity: "error"
        }]
      });
    } finally {
      setLoading(false);
    }
  };

  const autoFix = async () => {
    setLoading(true);
    try {
      // Run the same structural checks before attempting auto-fix
      try {
        const parsed = YAML.load(input) as any;
        
        // Refuse to fix documents with metadata: null
        if (parsed && parsed.hasOwnProperty('metadata') && parsed.metadata === null) {
          setResult({ 
            isValid: false, 
            errors: [{ 
              line: findLineForKey(input, 'metadata') ?? 0, 
              column: 0, 
              message: 'Auto-fix refused: `metadata` is null. This requires manual correction - change `metadata: null` to `metadata: {}` or add proper metadata fields.', 
              severity: 'error' 
            }] 
          });
          setLoading(false);
          return;
        }

        // Refuse to fix when a top-level `name` exists but metadata.name is missing
        if (parsed && parsed.hasOwnProperty('name') && (!parsed.metadata || !parsed.metadata.hasOwnProperty('name'))) {
          // Generate a preview of the safe transform
          const { transformed, changed } = moveNameIntoMetadata(input);
          if (changed) {
            setTransformPreview(transformed);
            setShowTransformModal(true);
            setLoading(false);
            // modal will handle apply/close
            return;
          }

          setResult({ 
            isValid: false, 
            errors: [{ 
              line: findLineForKey(input, 'name') ?? 0, 
              column: 0, 
              message: 'Auto-fix refused: `name` should be under `metadata.name`. Please move the name field manually into the metadata section.', 
              severity: 'error' 
            }] 
          });
          setLoading(false);
          return;
        }
      } catch (e) {
        // if YAML parsing fails here, continue with backend auto-fix attempt
      }

      const payload = { content: input };

  const urls = getApiUrls();
      let resp: Response | null = null;
      let error: any = null;

      for (const baseUrl of urls) {
        try {
          resp = await fetch(`${baseUrl}/api/fix`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (resp.ok) break;
          error = await resp.text();
        } catch (e) {
          error = e;
          continue;
        }
      }

      if (!resp?.ok) {
        // backend not available or returned error -> try client-side fallback
        try {
          const fixed = autoFixFallback(input);
          setInput(fixed);
          setResult(prev => ({
            ...(prev ?? { isValid: true, errors: [] }),
            fixes: { formatted: fixed, changes: [] }
          }));
          setLoading(false);
          return;
        } catch (fbErr) {
          const errorMessage = error instanceof Error ? error.message :
            typeof error === "string" ?
              (error.includes("<!DOCTYPE html>") ? "Could not connect to backend service" : error) :
              "Failed to reach backend service";
          throw new Error(errorMessage);
        }
      }

      const data = await resp.json();
      
      // If we got errors, show them but don't throw
      if (data.errors?.length > 0) {
        setResult({
          isValid: false,
          errors: data.errors,
          fixes: data.fixedContent ? {
            formatted: data.fixedContent,
            changes: data.changes || []
          } : undefined
        });
        return;
      }
      
      // No errors but also no fixed content = unexpected
      if (!data.fixedContent) {
        setResult({
          isValid: false,
          errors: [{
            line: 0,
            column: 0,
            message: "Server did not return fixed content. This may be due to invalid YAML syntax.",
            severity: "error"
          }]
        });
        return;
      }

      setInput(data.fixedContent);
      setResult({
        isValid: true,
        errors: [],
        fixes: {
          formatted: data.fixedContent,
          changes: data.changes || []
        }
      });
      // no auto-dismiss; result stays until user edits
    } catch (err) {
      console.error("Auto-fix failed:", err);
      alert(err instanceof Error ? err.message : "Failed to auto-fix YAML");
    } finally {
      setLoading(false);
    }
  };

  const applyTransformPreview = () => {
    if (!transformPreview) return;
    setInput(transformPreview);
    setShowTransformModal(false);
    setTransformPreview(null);
    // Re-run validate automatically after applying transform
    setTimeout(() => validate(), 100);
  };

  // simple client-side auto-fix fallback using js-yaml for YAML and JSON pretty-print
  function autoFixFallback(src: string) {
    // try JSON first
    try {
      const parsed = JSON.parse(src);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // not JSON, try YAML parse/dump to normalize indentation
    }

    try {
      const doc = YAML.load(src);
      // dump with 2-space indentation
      return YAML.dump(doc as any, { indent: 2, noRefs: true });
    } catch (e) {
      throw new Error('Auto-fix fallback failed: invalid YAML/JSON');
    }
  }

  // Try to extract a line number from an error message when the error.line is 0.
  // Backend sometimes returns a message like "auto-fix refused: line 8 contains..."
  function parseLineFromMessage(msg: string): number | null {
    if (!msg) return null;
    const m = msg.match(/line\s*(\d+)/i);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) return n;
    }
    return null;
  }

  // Find the 1-based line number where a top-level key appears (very simple heuristic)
  function findLineForKey(src: string, key: string): number | null {
    const lines = src.split(/\r?\n/);
    const re = new RegExp(`^\s*${key}\s*:`);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) return i + 1;
    }
    return null;
  }

  return (
    <div className="w-full py-6">
      <div className="container container-sm mx-auto px-4">
        <h1 className="text-xl font-semibold mb-6">YAML/JSON Validator</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-4">
            <div>
              <label className="validate-label">Schema</label>
              <select
                value={schema}
                onChange={(e) => setSchema(e.target.value as SchemaType)}
                className="w-full form-element custom-select"
              >
                <option value="none">No Schema</option>
                <option value="kubernetes">Kubernetes</option>
                <option value="helm">Helm Chart</option>
                <option value="custom">Custom Schema</option>
              </select>
            </div>

            {schema === "custom" && (
              <div>
                <label className="block mb-2">Custom Schema</label>
                <textarea
                  value={schemaContent}
                  onChange={(e) => setSchemaContent(e.target.value)}
                  placeholder="Paste your JSON schema here..."
                  className="w-full h-40 form-element font-mono text-sm"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={validate}
                disabled={loading || !input}
                className="btn-primary flex-1"
              >
                {loading ? "Validating..." : "Validate"}
              </button>
              <button
                onClick={autoFix}
                disabled={loading || !input}
                className="btn-secondary flex-1"
              >
                Auto-fix
              </button>
            </div>

            {/* Keep result pinned removed; results persist until user edits */}

            {result && (
              <div className={`p-3 rounded text-sm ${isValid ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                {isValid ? "✓ Valid YAML/JSON" : "✗ Invalid YAML/JSON"}
              </div>
            )}

            {errors.length > 0 && (
              <div className="space-y-2">
                    {errors.map((error, i) => {
                      // Determine which line to show: prefer explicit error.line, otherwise try parse from message
                      const parsed = error.line && error.line > 0 ? error.line : parseLineFromMessage(error.message ?? "");
                      return (
                        <div key={i} className="text-sm bg-red-500/10 text-red-600 p-3 rounded">
                          {parsed ? <div className="font-medium">Line {parsed}</div> : null}
                          <div>{error.message}</div>
                        </div>
                      );
                    })}
              </div>
            )}

            {fixesChanges.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-sm mb-1">Applied Fixes:</div>
                {fixesChanges.map((change, i) => (
                  <div key={i} className="text-sm bg-blue-500/10 text-blue-600 p-3 rounded">
                    <div>Line {change.line}: {change.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="card p-0">
              <div className="code-header flex items-center justify-between">
                <div className="text-sm font-medium muted">Input</div>
              </div>
              <div className="p-4">
                <LineNumberedTextarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setResult(null);
                  }}
                  placeholder="Paste your YAML or JSON here..."
                  rows={18}
                />

                {autoFixRefused && (
                  <div className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">Auto-fix cannot safely fix this document. Please fix the highlighted issues manually or use the suggested transform.</div>
                )}
              </div>
            </div>

            {formattedOutput && (
              <div className="mt-4">
                <CodeBlock
                  code={formattedOutput}
                  language="yaml"
                  title="Formatted Output"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}