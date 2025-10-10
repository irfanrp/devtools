import YAML from 'js-yaml';

export function moveNameIntoMetadata(src: string): { transformed: string; changed: boolean; reason?: string } {
  try {
    const doc = YAML.load(src) as any;
    if (!doc || typeof doc !== 'object') return { transformed: src, changed: false };

    // If metadata exists and is null -> create object
    if (Object.prototype.hasOwnProperty.call(doc, 'metadata') && doc.metadata === null) {
      doc.metadata = {};
    }

    if (Object.prototype.hasOwnProperty.call(doc, 'name') && (!doc.metadata || !Object.prototype.hasOwnProperty.call(doc.metadata, 'name'))) {
      // move name into metadata
      const v = doc.name;
      if (!doc.metadata || typeof doc.metadata !== 'object') doc.metadata = {};
      doc.metadata.name = v;
      delete doc.name;
      const out = YAML.dump(doc as any, { indent: 2, noRefs: true });
      return { transformed: out, changed: true };
    }

    return { transformed: src, changed: false };
  } catch (e: any) {
    return { transformed: src, changed: false, reason: e?.message };
  }
}
