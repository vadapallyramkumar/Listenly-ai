import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfExtract = {
  text: string;
  pageCount: number;
};

export async function extractPdfText(data: ArrayBuffer): Promise<PdfExtract> {
  const loadingTask = getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const words: string[] = [];
      for (const item of content.items) {
        if ("str" in item && item.str.trim()) {
          words.push(item.str);
        }
      }
      const line = words.join(" ").replace(/\s+/g, " ").trim();
      if (line) pages.push(line);
    }
    return { text: pages.join("\n\n").trim(), pageCount: pdf.numPages };
  } finally {
    await loadingTask.destroy();
  }
}
