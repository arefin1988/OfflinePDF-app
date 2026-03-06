import { PDFDocument, rgb, StandardFonts, degrees, PDFName } from 'pdf-lib';

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
  const totalPages = pdf.getPageCount();
  const results: Uint8Array[] = [];
  
  // Handle multiple formats: "1-3, 5" or "1-3\n4-6"
  const parts = ranges.split(/[\n,]+/).map(r => r.trim()).filter(Boolean);
  for (const part of parts) {
    const newPdf = await PDFDocument.create();
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      const s = Math.max(1, start);
      const e = Math.min(totalPages, end);
      if (s > e) continue;
      const indices = Array.from({ length: e - s + 1 }, (_, i) => s + i - 1);
      const pages = await newPdf.copyPages(pdf, indices);
      pages.forEach(p => newPdf.addPage(p));
    } else {
      const index = Number(part) - 1;
      if (index >= 0 && index < totalPages) {
        const [page] = await newPdf.copyPages(pdf, [index]);
        newPdf.addPage(page);
      } else {
        continue;
      }
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
      // Ensure we use 0, 90, 180, 270
      const newRotation = ((currentRotation + rotationDegrees) % 360 + 360) % 360;
      page.setRotation(degrees(newRotation));
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

export interface WatermarkConfig {
  type: 'text' | 'logo';
  text?: string;
  fontSize?: number;
  color?: string; // hex
  opacity?: number;
  angle?: number;
  scope?: 'all' | 'odd' | 'even' | 'first' | 'last';
  logoBytes?: ArrayBuffer;
  logoMime?: string;
  sizeRatio?: number;
  pos?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255
  };
}

export async function addWatermark(file: File, configs: WatermarkConfig[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  const totalPages = pages.length;

  for (const config of configs) {
    const { 
      type, 
      text = 'WATERMARK', 
      fontSize = 60, 
      color = '#cc0000', 
      opacity = 0.3, 
      angle = 45, 
      scope = 'all',
      logoBytes,
      logoMime,
      sizeRatio = 0.25,
      pos = 'center'
    } = config;

    if (type === 'text') {
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const rgbColor = hexToRgb(color);
      
      pages.forEach((page, i) => {
        const n = i + 1;
        if (scope === 'odd' && n % 2 === 0) return;
        if (scope === 'even' && n % 2 === 1) return;
        if (scope === 'first' && i > 0) return;
        if (scope === 'last' && i < totalPages - 1) return;

        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        
        page.drawText(text, {
          x: width / 2 - textWidth / 2,
          y: height / 2 - fontSize / 2,
          size: fontSize,
          font,
          color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
          opacity: Math.min(1, opacity),
          rotate: degrees(angle),
        });
      });
    } else if (type === 'logo' && logoBytes) {
      let embeddedImg;
      try {
        if (logoMime === 'image/png') {
          embeddedImg = await pdf.embedPng(logoBytes);
        } else {
          embeddedImg = await pdf.embedJpg(logoBytes);
        }
      } catch (e) {
        console.error('Failed to embed logo:', e);
        continue;
      }

      pages.forEach((page, i) => {
        const n = i + 1;
        if (scope === 'odd' && n % 2 === 0) return;
        if (scope === 'even' && n % 2 === 1) return;
        if (scope === 'first' && i > 0) return;
        if (scope === 'last' && i < totalPages - 1) return;

        const { width, height } = page.getSize();
        const maxW = width * sizeRatio;
        const maxH = height * sizeRatio;
        const imgDims = embeddedImg.scale(Math.min(maxW / embeddedImg.width, maxH / embeddedImg.height));
        
        const pad = width * 0.04;
        let x = 0, y = 0;
        
        if (pos === 'center') {
          x = (width - imgDims.width) / 2;
          y = (height - imgDims.height) / 2;
        } else if (pos === 'top-left') {
          x = pad;
          y = height - imgDims.height - pad;
        } else if (pos === 'top-right') {
          x = width - imgDims.width - pad;
          y = height - imgDims.height - pad;
        } else if (pos === 'bottom-left') {
          x = pad;
          y = pad;
        } else if (pos === 'bottom-right') {
          x = width - imgDims.width - pad;
          y = pad;
        }

        page.drawImage(embeddedImg, {
          x,
          y,
          width: imgDims.width,
          height: imgDims.height,
          opacity: opacity,
        });
      });
    }
  }
  return await pdf.save();
}

export interface PageNumberOptions {
  position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  format: 'n' | 'page-n' | 'n-of-total' | 'page-n-of-total';
  startNumber: number;
  fontSize: number;
  margin: number;
  skipFirst: number;
  color: string;
}

export async function addPageNumbers(file: File, options: PageNumberOptions): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const totalPages = pages.length;
  const rgbColor = hexToRgb(options.color);
  
  pages.forEach((page, i) => {
    if (i < options.skipFirst) return;
    
    const pageNum = options.startNumber + (i - options.skipFirst);
    let label = `${pageNum}`;
    if (options.format === 'page-n') label = `Page ${pageNum}`;
    else if (options.format === 'n-of-total') label = `${pageNum} of ${totalPages}`;
    else if (options.format === 'page-n-of-total') label = `Page ${pageNum} of ${totalPages}`;

    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(label, options.fontSize);
    
    let x = 0, y = 0;
    const [vert, horiz] = options.position.split('-');
    
    if (horiz === 'left') x = options.margin;
    else if (horiz === 'right') x = width - options.margin - textWidth;
    else x = (width - textWidth) / 2;

    if (vert === 'top') y = height - options.margin - options.fontSize;
    else y = options.margin;

    page.drawText(label, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
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

export async function reorderPages(file: File, newIndices: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(pdf, newIndices);
  copiedPages.forEach(page => newPdf.addPage(page));
  return await newPdf.save();
}

export async function compressPDF(file: File, level: 'low' | 'medium' | 'high' = 'medium'): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  
  if (level === 'high' || level === 'medium') {
    try {
      const catalog = pdf.catalog;
      if (catalog.has(PDFName.of('Metadata'))) {
        catalog.delete(PDFName.of('Metadata'));
      }
    } catch (e) {
      console.warn('Failed to strip metadata:', e);
    }
  }

  return await pdf.save({ 
    useObjectStreams: true,
    addDefaultPage: false,
    objectsPerTick: 50
  });
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
