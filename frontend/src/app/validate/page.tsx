"use client";

import { useState } from "react";
import CodeBlock from "../../components/CodeBlock";
import YAML from 'js-yaml';

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

  // derived safely-typed locals to avoid nullable access in JSX
  const errors = result?.errors ?? [];
  const fixesChanges = result?.fixes?.changes ?? [];
  const formattedOutput = result?.fixes?.formatted ?? null;
  const isValid = result?.isValid ?? false;

  const validate = async () => {
    setLoading(true);
    try {
      const payload = {
        content: input,
        schema: schema === "none" ? undefined : schema,
        schemaContent: schema === "custom" ? schemaContent : undefined
      };

      const urls = ["http://localhost:8080", "http://backend:8080"];
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
      const payload = { content: input };

      const urls = ["http://localhost:8080", "http://backend:8080"];
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

  return (
    <div className="w-full py-6">
      <div className="container container-sm mx-auto px-4">
        <h1 className="text-xl font-semibold mb-6">YAML/JSON Validator</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-4">
            <div>
              <label className="block mb-2">Schema</label>
              <select
                value={schema}
                onChange={(e) => setSchema(e.target.value as SchemaType)}
                className="w-full form-element"
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
                className="btn-primary flex-1"
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
                {errors.map((error, i) => (
                  <div key={i} className="text-sm bg-red-500/10 text-red-600 p-3 rounded">
                    <div className="font-medium">Line {error.line}</div>
                    <div>{error.message}</div>
                  </div>
                ))}
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
                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // clear previous validation results when the user edits
                    setResult(null);
                  }}
                  placeholder="Paste your YAML or JSON here..."
                  className="w-full h-[400px] form-element font-mono text-sm"
                />
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