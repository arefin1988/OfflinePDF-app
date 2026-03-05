import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

export async function mergePDFs(files: File[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  return await mergedPdf.save();
}

export async function splitPDF(file: File, ranges: string): Promise<Uint8Array[]> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const results: Uint8Array[] = [];
  
  // Simple range parsing: "1-3, 5, 7-10"
  const parts = ranges.split(',').map(r => r.trim());
  for (const part of parts) {
    const newPdf = await PDFDocument.create();
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i - 1);
      const pages = await newPdf.copyPages(pdf, indices);
      pages.forEach(p => newPdf.addPage(p));
    } else {
      const index = Number(part) - 1;
      const [page] = await newPdf.copyPages(pdf, [index]);
      newPdf.addPage(page);
    }
    results.push(await newPdf.save());
  }
  return results;
}

export async function rotatePages(file: File, rotations: Record<number, number>): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  
  Object.entries(rotations).forEach(([indexStr, rotationDegrees]) => {
    const index = Number(indexStr);
    if (index >= 0 && index < pages.length) {
      const page = pages[index];
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees((currentRotation + rotationDegrees) % 360));
    }
  });
  return await pdf.save();
}

export interface ImageToPDFOptions {
  pageSize?: 'A4' | 'Letter' | 'Fit';
  orientation?: 'portrait' | 'landscape' | 'auto';
  imageFit?: 'contain' | 'cover' | 'fill';
}

export async function imagesToPDF(images: File[], options: ImageToPDFOptions = {}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { pageSize = 'Fit', orientation = 'auto', imageFit = 'contain' } = options;

  for (const img of images) {
    const imgBytes = await img.arrayBuffer();
    let pdfImg;
    try {
      if (img.type === 'image/jpeg' || img.type === 'image/jpg') {
        pdfImg = await pdfDoc.embedJpg(imgBytes);
      } else if (img.type === 'image/png') {
        pdfImg = await pdfDoc.embedPng(imgBytes);
      } else {
        continue;
      }
    } catch (e) {
      console.error('Failed to embed image:', img.name, e);
      continue;
    }
    
    let pageWidth = pdfImg.width;
    let pageHeight = pdfImg.height;

    if (pageSize === 'A4') {
      pageWidth = 595.28;
      pageHeight = 841.89;
    } else if (pageSize === 'Letter') {
      pageWidth = 612;
      pageHeight = 792;
    }

    // Handle orientation
    if (orientation === 'landscape' && pageWidth < pageHeight) {
      [pageWidth, pageHeight] = [pageHeight, pageWidth];
    } else if (orientation === 'portrait' && pageWidth > pageHeight) {
      [pageWidth, pageHeight] = [pageHeight, pageWidth];
    } else if (orientation === 'auto') {
      if (pdfImg.width > pdfImg.height && pageWidth < pageHeight) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      } else if (pdfImg.width < pdfImg.height && pageWidth > pageHeight) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      }
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    
    let drawWidth = pdfImg.width;
    let drawHeight = pdfImg.height;
    let x = 0;
    let y = 0;

    if (imageFit === 'contain') {
      const ratio = Math.min(pageWidth / pdfImg.width, pageHeight / pdfImg.height);
      drawWidth = pdfImg.width * ratio;
      drawHeight = pdfImg.height * ratio;
      x = (pageWidth - drawWidth) / 2;
      y = (pageHeight - drawHeight) / 2;
    } else if (imageFit === 'cover') {
      const ratio = Math.max(pageWidth / pdfImg.width, pageHeight / pdfImg.height);
      drawWidth = pdfImg.width * ratio;
      drawHeight = pdfImg.height * ratio;
      x = (pageWidth - drawWidth) / 2;
      y = (pageHeight - drawHeight) / 2;
    } else {
      drawWidth = pageWidth;
      drawHeight = pageHeight;
    }

    page.drawImage(pdfImg, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });
  }
  return await pdfDoc.save();
}

export async function addWatermark(file: File, text: string): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  
  pages.forEach(page => {
    const { width, height } = page.getSize();
    page.drawText(text, {
      x: width / 4,
      y: height / 2,
      size: 50,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.3,
      rotate: degrees(45),
    });
  });
  return await pdf.save();
}

export async function addPageNumbers(file: File): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    page.drawText(`${i + 1} / ${pages.length}`, {
      x: width / 2 - 20,
      y: 20,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
  });
  return await pdf.save();
}

export async function deletePages(file: File, pagesToDelete: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  // Sort descending to avoid index shifting issues
  const sortedIndices = [...pagesToDelete].sort((a, b) => b - a);
  sortedIndices.forEach(index => {
    if (index >= 0 && index < pdf.getPageCount()) {
      pdf.removePage(index);
    }
  });
  return await pdf.save();
}

export async function extractPages(file: File, pagesToExtract: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(pdf, pagesToExtract);
  copiedPages.forEach(page => newPdf.addPage(page));
  return await newPdf.save();
}

export async function updateMetadata(file: File, metadata: { title?: string, author?: string, subject?: string, keywords?: string }): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  if (metadata.title) pdf.setTitle(metadata.title);
  if (metadata.author) pdf.setAuthor(metadata.author);
  if (metadata.subject) pdf.setSubject(metadata.subject);
  if (metadata.keywords) pdf.setKeywords(metadata.keywords.split(',').map(k => k.trim()));
  return await pdf.save();
}

export async function signPDF(file: File, signatureImageBase64: string, pageIndex: number, x: number, y: number, width: number, height: number): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const signatureImage = await pdf.embedPng(signatureImageBase64);
  const page = pdf.getPages()[pageIndex];
  page.drawImage(signatureImage, {
    x,
    y,
    width,
    height,
  });
  return await pdf.save();
}
