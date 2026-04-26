import * as pdfjsLib from 'pdfjs-dist';

// Use Vite's worker import to get a reliable worker URL
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    const items = textContent.items as any[];
    
    // Group items by their Y coordinate (with a small threshold for slight variations)
    const rows: { [key: number]: any[] } = {};
    const threshold = 3; // Slightly larger threshold for better row grouping
    
    for (const item of items) {
      const y = item.transform[5];
      let foundRow = false;
      for (const rowY of Object.keys(rows).map(Number)) {
        if (Math.abs(rowY - y) <= threshold) {
          rows[rowY].push(item);
          foundRow = true;
          break;
        }
      }
      if (!foundRow) {
        rows[y] = [item];
      }
    }
    
    const sortedY = Object.keys(rows).map(Number).sort((a, b) => b - a);
    let pageText = '';
    for (const y of sortedY) {
      const rowItems = rows[y].sort((a, b) => a.transform[4] - b.transform[4]);
      // Use tabs to separate columns, which helps the model understand table structure
      pageText += rowItems.map(item => item.str.trim()).filter(s => s !== '').join('\t') + '\n';
    }
    
    fullText += `[Page ${i}]\n${pageText}\n\n`;
  }

  return fullText;
}

export async function extractTextFromTXT(file: File): Promise<string> {
  return await file.text();
}
