import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";
import { glyphAtlas, hasShowingOperator, parseContent, writeContent } from "./content";
import { fontObjectRefs, outlineFontFor, faceRequestFor, type OutlineFont } from "./font";
import { bundledTypefaces, type TypefaceLibrary } from "./typefaces";

export type LiveText = {
  readonly showing: readonly string[];
  readonly fontResources: readonly string[];
};

type ContentSite = {
  readonly label: string;
  readonly resources: PDFDict | undefined;
  read(): Uint8Array;
  replace(bytes: Uint8Array): void;
  addForm(name: string, ref: PDFRef): void;
};

function streamBytes(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  if ("getUnencodedContents" in stream && typeof stream.getUnencodedContents === "function") {
    return (stream as PDFStream & { getUnencodedContents: () => Uint8Array }).getUnencodedContents();
  }
  return stream.getContents();
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function dictEntries(dict: PDFDict): Record<string, ReturnType<PDFDict["get"]>> {
  const out: Record<string, ReturnType<PDFDict["get"]>> = {};
  for (const [key, value] of dict.entries()) {
    const name = key.asString().slice(1);
    if (name === "Length" || name === "Filter" || name === "DecodeParms") continue;
    out[name] = value;
  }
  return out;
}

function ensureXObjectDict(resources: PDFDict | undefined, context: PDFDocument["context"]): PDFDict | undefined {
  if (!resources) return undefined;
  const existing = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (existing) return existing;
  const created = context.obj({});
  resources.set(PDFName.of("XObject"), created);
  return created;
}

function siteFromStream(
  label: string,
  stream: PDFStream,
  ref: PDFRef | undefined,
  resources: PDFDict | undefined,
  context: PDFDocument["context"],
): ContentSite {
  return {
    label,
    resources,
    read: () => streamBytes(stream),
    replace(bytes) {
      if (!(ref instanceof PDFRef)) return;
      context.assign(ref, context.flateStream(bytes, dictEntries(stream.dict)));
    },
    addForm(name, formRef) {
      ensureXObjectDict(resources, context)?.set(PDFName.of(name), formRef);
    },
  };
}

function collectSites(doc: PDFDocument): ContentSite[] {
  const context = doc.context;
  const sites: ContentSite[] = [];
  const visited = new Set<string>();

  const visitFormResources = (resources: PDFDict | undefined) => {
    const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xobjects) return;
    for (const key of xobjects.keys()) {
      const ref = xobjects.get(key);
      const id = ref instanceof PDFRef ? ref.toString() : null;
      if (id && visited.has(id)) continue;
      if (id) visited.add(id);
      const form = xobjects.lookup(key);
      if (!(form instanceof PDFStream)) continue;
      if (form.dict.lookup(PDFName.of("Subtype")) !== PDFName.of("Form")) continue;
      const formResources = form.dict.lookupMaybe(PDFName.of("Resources"), PDFDict);
      visitFormResources(formResources);
      sites.push(
        siteFromStream(
          `form /${key.decodeText()}`,
          form,
          ref instanceof PDFRef ? ref : undefined,
          formResources,
          context,
        ),
      );
    }
  };

  const visitAppearance = (dict: PDFDict, label: string) => {
    for (const key of dict.keys()) {
      const value = dict.lookup(key);
      const ref = dict.get(key);
      if (value instanceof PDFStream) {
        const id = ref instanceof PDFRef ? ref.toString() : `${label}/${key.decodeText()}`;
        if (visited.has(id)) continue;
        visited.add(id);
        const resources = value.dict.lookupMaybe(PDFName.of("Resources"), PDFDict);
        visitFormResources(resources);
        sites.push(
          siteFromStream(
            `${label} /${key.decodeText()}`,
            value,
            ref instanceof PDFRef ? ref : undefined,
            resources,
            context,
          ),
        );
      } else if (value instanceof PDFDict) {
        visitAppearance(value, `${label} /${key.decodeText()}`);
      }
    }
  };

  doc.getPages().forEach((page, index) => {
    page.node.normalize();
    const resources = page.node.Resources();
    visitFormResources(resources);
    const annots = page.node.Annots();
    if (annots) {
      annots.asArray().forEach((item, annotIndex) => {
        const annot = page.node.context.lookup(item);
        if (!(annot instanceof PDFDict)) return;
        const ap = annot.lookupMaybe(PDFName.of("AP"), PDFDict);
        if (ap) visitAppearance(ap, `page ${index} annot ${annotIndex}`);
      });
    }
    const contents = page.node.Contents();
    if (!contents) return;
    sites.push({
      label: `page ${index}`,
      resources,
      read() {
        const parts = (contents instanceof PDFArray ? contents.asArray() : [contents])
          .map((item) => page.node.context.lookup(item))
          .filter((item): item is PDFStream => item instanceof PDFStream)
          .map(streamBytes);
        return concat(parts);
      },
      replace(bytes) {
        page.node.set(PDFName.of("Contents"), context.register(context.flateStream(bytes)));
      },
      addForm(name, formRef) {
        ensureXObjectDict(resources, context)?.set(PDFName.of(name), formRef);
      },
    });
  });
  return sites;
}

function collectFonts(sites: readonly ContentSite[]): PDFDict[] {
  const fonts: PDFDict[] = [];
  const seen = new Set<PDFDict>();
  for (const site of sites) {
    const dict = site.resources?.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (!dict) continue;
    for (const key of dict.keys()) {
      const font = dict.lookup(key);
      if (!(font instanceof PDFDict) || seen.has(font)) continue;
      seen.add(font);
      fonts.push(font);
    }
  }
  return fonts;
}

function resolveFont(
  resources: PDFDict | undefined,
  name: string,
  resolved: Map<PDFDict, OutlineFont>,
): OutlineFont | undefined {
  const font = resources?.lookupMaybe(PDFName.of("Font"), PDFDict)?.lookup(PDFName.of(name));
  return font instanceof PDFDict ? resolved.get(font) : undefined;
}

function materializeForms(
  doc: PDFDocument,
  atlas: ReturnType<typeof glyphAtlas>,
  registered: Map<string, PDFRef>,
): void {
  const context = doc.context;
  const encode = new TextEncoder();
  for (const [name, placed] of atlas.forms) {
    if (registered.has(name)) continue;
    const { form, paint } = placed;
    if (form.kind === "outline") {
      const op = encode.encode(`${paint}\n`);
      const content = new Uint8Array(form.ops.length + op.length);
      content.set(form.ops);
      content.set(op, form.ops.length);
      registered.set(
        name,
        context.register(
          context.flateStream(content, {
            Type: "XObject",
            Subtype: "Form",
            BBox: context.obj([...form.bbox]),
            Matrix: context.obj([1 / form.unitsPerEm, 0, 0, 1 / form.unitsPerEm, 0, 0]),
          }),
        ),
      );
      continue;
    }
    registered.set(
      name,
      context.register(
        context.flateStream(streamBytes(form.stream), {
          Type: "XObject",
          Subtype: "Form",
          BBox: context.obj([...form.bbox]),
          ...dictEntries(form.stream.dict),
        }),
      ),
    );
  }
}

function pruneFonts(resources: PDFDict | undefined, orphans: PDFRef[]): void {
  if (!resources) return;
  const fonts = resources.lookupMaybe(PDFName.of("Font"), PDFDict);
  if (fonts) {
    for (const key of fonts.keys()) {
      const ref = fonts.get(key);
      if (ref instanceof PDFRef) orphans.push(ref);
      const dict = fonts.lookup(key);
      if (dict instanceof PDFDict) orphans.push(...fontObjectRefs(dict));
    }
  }
  resources.delete(PDFName.of("Font"));
}

export async function outlineAllText(
  doc: PDFDocument,
  typefaces: TypefaceLibrary = bundledTypefaces,
): Promise<void> {
  const sites = collectSites(doc);
  const resolved = new Map<PDFDict, OutlineFont>();
  for (const dict of collectFonts(sites)) {
    resolved.set(dict, outlineFontFor(dict, await typefaces(faceRequestFor(dict))));
  }
  const atlas = glyphAtlas();
  const registered = new Map<string, PDFRef>();
  const orphans: PDFRef[] = [];
  for (const site of sites) {
    const source = site.read();
    if (source.length === 0) {
      pruneFonts(site.resources, orphans);
      continue;
    }
    const lowered = writeContent(
      parseContent(source),
      (name) => resolveFont(site.resources, name, resolved),
      atlas,
    );
    materializeForms(doc, atlas, registered);
    for (const name of lowered.places) {
      const ref = registered.get(name);
      if (ref) site.addForm(name, ref);
    }
    site.replace(lowered.bytes);
    pruneFonts(site.resources, orphans);
  }
  for (const ref of orphans) doc.context.delete(ref);
}

export function findLiveText(doc: PDFDocument): LiveText {
  const showing: string[] = [];
  const fontResources: string[] = [];
  for (const site of collectSites(doc)) {
    if (hasShowingOperator(site.read())) showing.push(site.label);
    const fonts = site.resources?.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (fonts && fonts.keys().length > 0) fontResources.push(site.label);
  }
  return { showing, fontResources };
}
