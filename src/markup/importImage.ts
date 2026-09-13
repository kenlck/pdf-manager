import { PDFDocument } from "pdf-lib";

export async function importOverlayImage(bytes: Uint8Array): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const doc = await PDFDocument.create();
  if (bytes[0] === 0x89) {
    const image = await doc.embedPng(bytes);
    return { bytes, width: image.width, height: image.height };
  }
  // Decode JPEGs in the browser to bake in camera EXIF orientation. PDF image
  // embedding otherwise ignores it, producing a different saved orientation.
  await doc.embedJpg(bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not decode image.");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not decode image.")), "image/png"));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
