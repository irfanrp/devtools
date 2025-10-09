"use client";

import React from "react";
import JSZip from "jszip";
import { renderMainTf, renderVariablesTf, renderOutputsTf, renderTfvars, TemplateInputs, Provider } from "../../lib/terraformTemplates";
import RESOURCES from "../../lib/resourceLoader";
import { getResources } from "../../lib/resourceLoader";
import { REGIONS } from "../../lib/regions";
import CodeBlock from "../../components/CodeBlock";
import { useState } from "react";

export default function GeneratePage() {
  const [provider, setProvider] = useState<Provider>("aws");
  const [resourceType, setResourceType] = useState(RESOURCES.aws[0].value);
  const [resources, setResources] = useState(() => RESOURCES.aws.slice(0, 6));
  const [resourcesLoading, setResourcesLoading] = useState(false);
  // Default name mapping for all providers
  const getDefaultName = (prov: Provider, res: string) => {
    if (prov === 'aws') {
      switch (res) {
        case 's3_bucket': return 'example-bucket';
        case 'instance': return 'example-instance';
        case 'db_instance': return 'example-db';
        case 'lambda_function': return 'example-function';
        case 'cloudfront_distribution': return 'example-distribution';
        case 'vpc': return 'example-vpc';
        case 'subnet': return 'example-subnet';
        case 'internet_gateway': return 'example-igw';
        case 'route_table': return 'example-rt';
        case 'security_group': return 'example-sg';
        case 'iam_role': return 'example-role';
        case 'iam_policy': return 'example-policy';
        case 'iam_user': return 'example-user';
        case 'ecr_repository': return 'example-repo';
        case 'dynamodb_table': return 'example-table';
        case 'sqs_queue': return 'example-queue';
        case 'sns_topic': return 'example-topic';
        case 'cloudwatch_log_group': return 'example-log-group';
        case 'kms_key': return 'example-key';
        case 'ssm_parameter': return 'example-parameter';
        case 'route53_zone': return 'example-zone';
        case 'route53_record': return 'example-record';
        case 'lb': return 'example-lb';
        case 'nat_gateway': return 'example-nat';
        case 'eip': return 'example-eip';
        default: return 'example-resource';
      }
    } else if (prov === 'gcp') {
      switch (res) {
        case 'storage_bucket': return 'example-bucket';
        case 'compute_instance': return 'example-instance';
        case 'sql_database_instance': return 'example-db';
        case 'cloudfunctions_function': return 'example-function';
        case 'dns_managed_zone': return 'example-zone';
        case 'pubsub_topic': return 'example-topic';
        case 'pubsub_subscription': return 'example-subscription';
        case 'artifact_registry_repository': return 'example-repo';
        case 'compute_firewall': return 'example-firewall';
        case 'compute_network': return 'example-network';
        default: return 'example-resource';
      }
    } else if (prov === 'azure') {
      switch (res) {
        case 'storage_account': return 'examplestorageacct';
        case 'linux_virtual_machine': return 'example-vm';
        case 'sql_database': return 'example-db';
        case 'function_app': return 'example-function';
        case 'cdn_profile': return 'example-cdn';
        case 'resource_group': return 'example-rg';
        case 'virtual_network': return 'example-vnet';
        case 'subnet': return 'example-subnet';
        case 'public_ip': return 'example-pip';
        case 'network_security_group': return 'example-nsg';
        case 'key_vault': return 'example-kv';
        case 'container_registry': return 'exampleacr';
        default: return 'example-resource';
      }
    }
    return 'example-resource';
  };
  const [nameTouched, setNameTouched] = useState(false);
  const [name, setName] = useState(() => getDefaultName('aws', RESOURCES.aws[0].value));
  const [region, setRegion] = useState(REGIONS.aws[0]);
  const [tagsRaw, setTagsRaw] = useState("Environment=dev\nOwner=team");

  // Auto-update resource and region when provider changes
  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    const firstRes = RESOURCES[newProvider][0].value;
    setResourceType(firstRes); // Set to first resource of new provider
    setRegion(REGIONS[newProvider][0]); // Set to first region of new provider
    if (!nameTouched) {
      setName(getDefaultName(newProvider, firstRes));
    }
    // load full resources async (simulate no delay by default; can simulate slow)
    setResourcesLoading(true);
    getResources(newProvider).then((rs) => { setResources(rs); setResourcesLoading(false); });
  };
  // preview state removed (not needed)

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

  // Stack controls: single resource, vpc_basic (VPC+Subnet+SG) or custom
  const [stackMode, setStackMode] = useState<'single'|'vpc_basic'|'custom'>('single');
  const [customVPC, setCustomVPC] = useState(true);
  const [customSubnet, setCustomSubnet] = useState(true);
  const [customSG, setCustomSG] = useState(true);

  // Helper to assemble selected resourceTypes for stacks
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

  // Build combined outputs when stack mode is active
  const combinedMainTf = selectedResources.map((rt) => renderMainTf({ ...inputs, resourceType: rt })).join('\n\n');
  const combinedVariablesTf = selectedResources.map((rt) => renderVariablesTf({ ...inputs, resourceType: rt })).join('\n\n');
  const combinedOutputsTf = selectedResources.map((rt) => renderOutputsTf({ ...inputs, resourceType: rt })).join('\n\n');
  const combinedTfvars = selectedResources.map((rt) => renderTfvars({ ...inputs, resourceType: rt })).join('\n\n');

  const mainTf = stackMode === 'single' ? renderMainTf(inputs) : combinedMainTf;
  const variablesTf = stackMode === 'single' ? renderVariablesTf(inputs) : combinedVariablesTf;
  const outputsTf = stackMode === 'single' ? renderOutputsTf(inputs) : combinedOutputsTf;
  const tfvars = stackMode === 'single' ? renderTfvars(inputs) : combinedTfvars;

  const downloadZip = async () => {
    const zip = new JSZip();
    zip.file("main.tf", mainTf);
    zip.file("variables.tf", variablesTf);
  zip.file("outputs.tf", outputsTf);
  zip.file("terraform.tfvars", tfvars);
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "module"}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const [tab, setTab] = useState<'main'|'vars'|'outs'|'tfvars'>('main');

  return (
    <div className="min-h-screen p-6">
      <h1 className="text-xl font-semibold mb-3">Terraform Snippet Generator</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2 text-sm">
          <div>
            <label className="block mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as Provider)}
              className="w-full px-2 py-1 border rounded bg-white text-black"
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
                className="w-full px-2 py-1 border rounded bg-white text-black"
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
                className="w-full px-2 py-1 border rounded bg-white text-black"
              />
            </div>
            <div className="w-36">
              <label className="block mb-1">Region</label>
              <select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full px-2 py-1 border rounded bg-white text-black">
                {REGIONS[provider].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <details className="mt-1 border rounded bg-white text-black">
            <summary className="px-2 py-1 cursor-pointer">Advanced</summary>
            <div className="p-2">
              <label className="block mb-1">Tags (key=value per line)</label>
              <textarea value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} className="w-full px-2 py-1 border rounded h-20" />
            </div>
          </details>

          <div className="flex items-center gap-2 mt-2">
            <button onClick={downloadZip} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Download ZIP</button>
            <select value={stackMode} onChange={(e) => setStackMode(e.target.value as any)} className="px-2 py-1 border rounded text-sm">
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
                  <button onClick={() => setTab('main')} className={`px-3 py-1 rounded text-sm flex-shrink-0 ${tab==='main' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>main.tf</button>
                  <button onClick={() => setTab('vars')} className={`px-3 py-1 rounded text-sm flex-shrink-0 ${tab==='vars' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>variables.tf</button>
                  <button onClick={() => setTab('outs')} className={`px-3 py-1 rounded text-sm flex-shrink-0 ${tab==='outs' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>outputs.tf</button>
                  <button onClick={() => setTab('tfvars')} className={`px-3 py-1 rounded text-sm flex-shrink-0 ${tab==='tfvars' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>terraform.tfvars</button>
                </div>
              </div>
          </div>
          <div className="mt-3">
            <div>
              {tab === 'main' && <CodeBlock code={mainTf} language="hcl" title="main.tf" />}
              {tab === 'vars' && <CodeBlock code={variablesTf} language="hcl" title="variables.tf" />}
              {tab === 'outs' && <CodeBlock code={outputsTf} language="hcl" title="outputs.tf" />}
              {tab === 'tfvars' && <CodeBlock code={tfvars} language="hcl" title="terraform.tfvars" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
