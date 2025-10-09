"use client";

import React from "react";
import JSZip from "jszip";
import { renderMainTf, renderVariablesTf, renderOutputsTf, renderTfvars, TemplateInputs, Provider } from "../../lib/terraformTemplates";
import RESOURCES from "../../lib/resourceLoader";
import { getResources } from "../../lib/resourceLoader";
import { REGIONS } from "../../lib/regions";
import CodeBlock from "../../components/CodeBlock";
import { useState, useEffect } from "react";

export default function GeneratePage() {
  const [provider, setProvider] = useState<Provider>("aws");
  const [resourceType, setResourceType] = useState(RESOURCES.aws[0].value);
  const [resources, setResources] = useState(() => RESOURCES.aws.slice(0, 6));
  const [resourcesLoading, setResourcesLoading] = useState(false);

  const getDefaultName = (prov: Provider, res: string) => {
    if (prov === "aws") {
      switch (res) {
        case "s3_bucket":
          return "example-bucket";
        case "instance":
          return "example-instance";
        case "db_instance":
          return "example-db";
        default:
          return "example-resource";
      }
    }
    return "example-resource";
  };

  const [nameTouched, setNameTouched] = useState(false);
  const [name, setName] = useState(() => getDefaultName("aws", RESOURCES.aws[0].value));
  const [region, setRegion] = useState(REGIONS.aws[0]);
  const [tagsRaw, setTagsRaw] = useState("Environment=dev\nOwner=team");

  useEffect(() => {
    setResources(RESOURCES[provider].slice(0, 6));
  }, []);

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    const firstRes = RESOURCES[newProvider][0].value;
    setResourceType(firstRes);
    setRegion(REGIONS[newProvider][0]);
    if (!nameTouched) setName(getDefaultName(newProvider, firstRes));

    setResourcesLoading(true);
    getResources(newProvider)
      .then((rs) => setResources(rs))
      .catch(() => setResources(RESOURCES[newProvider].slice(0, 6)))
      .finally(() => setResourcesLoading(false));
  };

  const parseTags = (raw: string) => {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const obj: Record<string, string> = {};
    for (const l of lines) {
      const [k, v] = l.split("=");
      if (k) obj[k.trim()] = (v || "").trim();
    }
    return obj;
  };

  const inputs: TemplateInputs = {
    provider,
    resourceType,
    name,
    region,
    tags: parseTags(tagsRaw),
    options: { versioning: true },
  };

  const [stackMode, setStackMode] = useState<'single'|'vpc_basic'|'custom'>('single');
  const [customVPC, setCustomVPC] = useState(true);
  const [customSubnet, setCustomSubnet] = useState(true);
  const [customSG, setCustomSG] = useState(true);

  const getStackResources = () => {
    if (stackMode === 'vpc_basic') return ['vpc_basic'];
    if (stackMode === 'custom') {
      const list: string[] = [];
      if (customVPC) list.push('vpc');
      if (customSubnet) list.push('subnet');
      if (customSG) list.push('security_group');
      return list;
    }
    return [resourceType];
  };

  const selectedResources = getStackResources();

  const combinedMainTf = selectedResources.map((rt) => renderMainTf({ ...inputs, resourceType: rt })).join('\n\n');
  const combinedVariablesTf = selectedResources.map((rt) => renderVariablesTf({ ...inputs, resourceType: rt })).join('\n\n');
  const combinedOutputsTf = selectedResources.map((rt) => renderOutputsTf({ ...inputs, resourceType: rt })).join('\n\n');
  const combinedTfvars = selectedResources.map((rt) => renderTfvars({ ...inputs, resourceType: rt })).join('\n\n');

  const mainTf = stackMode === 'single' ? renderMainTf(inputs) : combinedMainTf;
  const variablesTf = stackMode === 'single' ? renderVariablesTf(inputs) : combinedVariablesTf;
  const outputsTf = stackMode === 'single' ? renderOutputsTf(inputs) : combinedOutputsTf;
  const tfvars = stackMode === 'single' ? renderTfvars(inputs) : combinedTfvars;

  const downloadZip = async () => {
    const payload = {
      main: mainTf,
      variables: variablesTf,
      outputs: outputsTf,
      tfvars: tfvars,
      name: name || 'module',
    };

    try {
      const urls = ['http://localhost:8080', 'http://backend:8080'];
      let resp: Response | null = null;
      let error: any = null;

      for (const baseUrl of urls) {
        try {
          resp = await fetch(`${baseUrl}/api/format-zip`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/zip',
            },
            body: JSON.stringify(payload),
          });
          if (resp.ok) break;
          const text = await resp.text();
          error = text;
        } catch (e) {
          error = e;
          continue;
        }
      }

      if (!resp?.ok) {
        const errorMessage = error instanceof Error ? error.message :
          typeof error === 'string' ?
            (error.includes('<!DOCTYPE html>') ? 'Could not connect to backend service' : error) :
            'Failed to reach backend service';
        throw new Error(errorMessage);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'module'}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to connect to backend service');
    }
  };

  const [tab, setTab] = useState<'main'|'vars'|'outs'|'tfvars'>('main');

  return (
    <div className="w-full py-6">
      <div className="container container-sm mx-auto px-4">
        <h1 className="text-xl font-semibold mb-6">Terraform Snippet Generator</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-3 text-sm pb-12">
            <div>
              <label className="block mb-1">Provider</label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as Provider)}
                className="w-full form-element"
              >
                <option value="aws">AWS</option>
                <option value="gcp">GCP</option>
                <option value="azure">Azure</option>
              </select>
            </div>

            <div>
              <label className="block mb-1">Resource</label>
              {resourcesLoading ? (
                <div className="px-2 py-1">Loading…</div>
              ) : (
                <select
                  value={resourceType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setResourceType(val);
                    if (!nameTouched) setName(getDefaultName(provider, val));
                  }}
                  className="w-full form-element"
                >
                  {resources.map((resource) => (
                    <option key={resource.value} value={resource.value}>
                      {resource.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (!nameTouched) setNameTouched(true); }}
                  className="w-full form-element"
                />
              </div>
              <div className="w-36">
                <label className="block mb-1">Region</label>
                <select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full form-element">
                  {REGIONS[provider].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <details className="mt-1 panel">
              <summary className="px-2 py-1 cursor-pointer">Advanced</summary>
              <div className="p-2">
                <label className="block mb-1">Tags (key=value per line)</label>
                <textarea value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} className="w-full form-element h-20" />
              </div>
            </details>

            <div className="flex items-center gap-2 mt-4 mb-8">
              <button onClick={downloadZip} className="btn-primary">Download ZIP</button>
              <select value={stackMode} onChange={(e) => setStackMode(e.target.value as any)} className="px-2 py-1 border rounded text-sm form-element">
                <option value="single">Single Resource</option>
                <option value="vpc_basic">VPC Basic</option>
                <option value="custom">Custom Resource</option>
              </select>
            </div>

            {stackMode === 'custom' && (
              <div className="pl-2 pt-2">
                <label className="inline-flex items-center mr-3"><input type="checkbox" checked={customVPC} onChange={(e) => setCustomVPC(e.target.checked)} className="mr-2"/>VPC</label>
                <label className="inline-flex items-center mr-3"><input type="checkbox" checked={customSubnet} onChange={(e) => setCustomSubnet(e.target.checked)} className="mr-2"/>Subnet</label>
                <label className="inline-flex items-center"><input type="checkbox" checked={customSG} onChange={(e) => setCustomSG(e.target.checked)} className="mr-2"/>SG</label>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Preview</h2>
              <div className="mb-3">
                <div className="flex gap-2 overflow-x-auto whitespace-nowrap py-1">
                  <button onClick={() => setTab('main')} className={`px-3 py-1 rounded text-sm flex-shrink-0 ${tab==='main' ? 'bg-blue-600 text-white' : 'bg-transparent border border-transparent text-muted'}`}>main.tf</button>
                  <button onClick={() => setTab('vars')} className={`px-3 py-1 rounded text-sm flex-shrink-0 ${tab==='vars' ? 'bg-blue-600 text-white' : 'bg-transparent border border-transparent text-muted'}`}>variables.tf</button>
                  <button onClick={() => setTab('outs')} className={`px-3 py-1 rounded text-sm flex-shrink-0 ${tab==='outs' ? 'bg-blue-600 text-white' : 'bg-transparent border border-transparent text-muted'}`}>outputs.tf</button>
                  <button onClick={() => setTab('tfvars')} className={`px-3 py-1 rounded text-sm flex-shrink-0 ${tab==='tfvars' ? 'bg-blue-600 text-white' : 'bg-transparent border border-transparent text-muted'}`}>terraform.tfvars</button>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <div className="card p-0">
                {tab === 'main' && <CodeBlock code={mainTf} language="hcl" title="main.tf" />}
                {tab === 'vars' && <CodeBlock code={variablesTf} language="hcl" title="variables.tf" />}
                {tab === 'outs' && <CodeBlock code={outputsTf} language="hcl" title="outputs.tf" />}
                {tab === 'tfvars' && <CodeBlock code={tfvars} language="hcl" title="terraform.tfvars" />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
