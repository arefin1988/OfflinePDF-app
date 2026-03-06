/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Merge, 
  Scissors, 
  Lock, 
  Unlock, 
  RotateCw, 
  Image as ImageIcon, 
  Type, 
  Hash, 
  Trash2, 
  Download, 
  Plus, 
  ChevronLeft,
  Settings,
  Info,
  ShieldCheck,
  Zap,
  LayoutGrid,
  FilePlus,
  PenTool,
  FileSearch
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { set, get, keys, del } from 'idb-keyval';
import JSZip from 'jszip';
import * as pdfLogic from './lib/pdf';
import * as pdfjsLib from 'pdfjs-dist';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

type Tab = 'tools' | 'files' | 'settings' | 'premium';

interface StoredFile {
  id: string;
  name: string;
  size: number;
  date: number;
  blob: Blob;
}

function SignatureCanvas({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="space-y-4">
      <div className="border border-zinc-200 rounded-xl bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          className="w-full h-48 touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={clear} className="flex-1 py-2 bg-zinc-100 rounded-lg text-sm font-bold">Clear</button>
        <button onClick={save} className="flex-1 py-2 bg-zinc-900 text-white rounded-lg text-sm font-bold">Use Signature</button>
      </div>
    </div>
  );
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ToolId = 
  | 'merge' 
  | 'split' 
  | 'lock' 
  | 'unlock' 
  | 'rotate' 
  | 'images-to-pdf' 
  | 'watermark' 
  | 'numbers' 
  | 'delete' 
  | 'extract' 
  | 'metadata' 
  | 'viewer'
  | 'sign'
  | 'fill';

interface Tool {
  id: ToolId;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const TOOLS: Tool[] = [
  { id: 'merge', name: 'Merge PDF', description: 'Combine multiple PDFs into one', icon: Merge, color: 'bg-blue-500' },
  { id: 'split', name: 'Split PDF', description: 'Extract pages or split into multiple files', icon: Scissors, color: 'bg-red-500' },
  { id: 'images-to-pdf', name: 'Images to PDF', description: 'Convert JPG/PNG to PDF document', icon: ImageIcon, color: 'bg-emerald-500' },
  { id: 'rotate', name: 'Rotate PDF', description: 'Rotate pages of your PDF', icon: RotateCw, color: 'bg-amber-500' },
  { id: 'watermark', name: 'Watermark', description: 'Add text watermark to all pages', icon: Type, color: 'bg-purple-500' },
  { id: 'numbers', name: 'Page Numbers', description: 'Add page numbers to your document', icon: Hash, color: 'bg-indigo-500' },
  { id: 'lock', name: 'Lock PDF', description: 'Protect PDF with a password', icon: Lock, color: 'bg-zinc-800' },
  { id: 'unlock', name: 'Unlock PDF', description: 'Remove password protection', icon: Unlock, color: 'bg-zinc-400' },
  { id: 'delete', name: 'Delete Pages', description: 'Remove specific pages from PDF', icon: Trash2, color: 'bg-rose-600' },
  { id: 'extract', name: 'Extract Pages', description: 'Save specific pages as new PDF', icon: Download, color: 'bg-violet-500' },
  { id: 'sign', name: 'Sign PDF', description: 'Add your signature to document', icon: PenTool, color: 'bg-sky-500' },
  { id: 'fill', name: 'Fill Form', description: 'Fill out PDF form fields', icon: FilePlus, color: 'bg-lime-500' },
  { id: 'metadata', name: 'Edit Metadata', description: 'Change Title, Author, etc.', icon: Settings, color: 'bg-orange-500' },
  { id: 'viewer', name: 'PDF Viewer', description: 'Read and view your PDF files', icon: FileSearch, color: 'bg-teal-500' },
];

function PDFPageGrid({ 
  file, 
  onRotatePage, 
  rotations = {}, 
  selectedPages = [], 
  onTogglePage,
  columns = 3
}: { 
  file: File, 
  onRotatePage?: (index: number) => void, 
  rotations?: Record<number, number>,
  selectedPages?: number[],
  onTogglePage?: (index: number) => void,
  columns?: number
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    let isMounted = true;
    const loadPages = async () => {
      setLoading(true);
      try {
        const bytes = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(bytes).promise;
        const pageUrls: string[] = [];
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          pageUrls.push(canvas.toDataURL());
        }
        
        if (isMounted) {
          setPages(pageUrls);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error rendering PDF pages:', err);
        if (isMounted) setLoading(false);
      }
    };

    loadPages();
    return () => { isMounted = false; };
  }, [file]);

  if (loading) {
    return (
      <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-4" : "grid-cols-3")}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="aspect-[3/4] bg-zinc-100 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-3", columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-4" : "grid-cols-3")}>
      {pages.map((url, i) => {
        const isSelected = selectedPages.includes(i);
        return (
          <div key={i} className="relative group">
            <div 
              onClick={() => onTogglePage?.(i)}
              className={cn(
                "aspect-[3/4] bg-white border rounded-lg overflow-hidden shadow-sm relative cursor-pointer transition-all duration-200",
                isSelected ? "border-red-500 ring-2 ring-red-500/20 scale-[0.98]" : "border-zinc-200 hover:border-zinc-300"
              )}
            >
              <img 
                src={url} 
                alt={`Page ${i + 1}`} 
                className="w-full h-full object-contain transition-transform duration-300"
                style={{ transform: `rotate(${rotations[i] || 0}deg)` }}
              />
              <div className={cn(
                "absolute bottom-1 right-1 text-[8px] px-1 rounded font-mono transition-colors",
                isSelected ? "bg-red-500 text-white" : "bg-black/50 text-white"
              )}>
                {i + 1}
              </div>
              {isSelected && (
                <div className="absolute top-1 left-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm">
                  <ShieldCheck size={10} />
                </div>
              )}
            </div>
            {onRotatePage && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRotatePage(i);
                }}
                className="absolute -top-1 -right-1 w-6 h-6 bg-white border border-zinc-200 rounded-full flex items-center justify-center shadow-sm text-zinc-600 hover:text-red-500 transition-colors z-10"
              >
                <RotateCw size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [currentTab, setCurrentTab] = useState<Tab>('tools');
  const [isPremium, setIsPremium] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [toolParams, setToolParams] = useState<any>({});
  
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PWA Install Logic
  React.useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  // Load files from IndexedDB
  React.useEffect(() => {
    loadStoredFiles();
  }, []);

  const loadStoredFiles = async () => {
    const allKeys = await keys();
    const filesList: StoredFile[] = [];
    for (const key of allKeys) {
      if (typeof key === 'string' && key.startsWith('pdf_')) {
        const file = await get(key);
        if (file) filesList.push(file);
      }
    }
    setStoredFiles(filesList.sort((a, b) => b.date - a.date));
  };

  const saveFileToStorage = async (blob: Blob, name: string) => {
    const id = `pdf_${Date.now()}`;
    const newFile: StoredFile = {
      id,
      name: name || `Document_${new Date().toLocaleDateString()}.pdf`,
      size: blob.size,
      date: Date.now(),
      blob
    };
    await set(id, newFile);
    await loadStoredFiles();
  };

  const deleteStoredFile = async (id: string) => {
    await del(id);
    await loadStoredFiles();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files) as File[];
      
      // If we are in merge or images-to-pdf, we append files
      if (activeTool === 'merge' || activeTool === 'images-to-pdf') {
        setFiles(prev => [...prev, ...newFiles]);
      } else {
        setFiles(newFiles);
      }
      
      setResultUrl(null);
      // Initial preview of the first file (if it's a PDF)
      if (newFiles.length > 0 && activeTool !== 'merge' && activeTool !== 'images-to-pdf') {
        const firstFile = newFiles[0];
        if (firstFile.type === 'application/pdf') {
          const url = URL.createObjectURL(firstFile);
          setLivePreviewUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      }
    }
  };

  const reset = () => {
    setActiveTool(null);
    setFiles([]);
    setResultUrl(null);
    setLivePreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setIsProcessing(false);
    setToolParams({});
  };

  // Live Preview Logic
  React.useEffect(() => {
    if (files.length === 0 || !activeTool) return;

    // For viewer, just show the file immediately
    const firstFile = files[0] as File | undefined;
    if (activeTool === 'viewer' && firstFile?.type === 'application/pdf') {
      const url = URL.createObjectURL(firstFile);
      setLivePreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      return;
    }

    const timer = setTimeout(async () => {
      setIsGeneratingPreview(true);
      try {
        let result: Uint8Array | null = null;
        
        switch (activeTool) {
          case 'merge':
            if (files.length > 1) result = await pdfLogic.mergePDFs(files);
            break;
          case 'images-to-pdf':
            if (files.length > 0) {
              result = await pdfLogic.imagesToPDF(files, {
                pageSize: toolParams.pageSize,
                orientation: toolParams.orientation,
                imageFit: toolParams.imageFit,
              });
            }
            break;
          case 'rotate':
            if (toolParams.rotations) {
              result = await pdfLogic.rotatePages(files[0], toolParams.rotations);
            } else {
              // Default to 90 for all if no specific rotations
              const bytes = await files[0].arrayBuffer();
              const pdf = await pdfjsLib.getDocument(bytes).promise;
              const rotations: Record<number, number> = {};
              for (let i = 0; i < pdf.numPages; i++) rotations[i] = Number(toolParams.rotation || 90);
              result = await pdfLogic.rotatePages(files[0], rotations);
            }
            break;
          case 'watermark':
            if (toolParams.watermarkText) {
              result = await pdfLogic.addWatermark(files[0], toolParams.watermarkText);
            }
            break;
          case 'numbers':
            result = await pdfLogic.addPageNumbers(files[0]);
            break;
          case 'metadata':
            result = await pdfLogic.updateMetadata(files[0], {
              title: toolParams.title,
              author: toolParams.author,
            });
            break;
          case 'sign':
            if (toolParams.signature) {
              result = await pdfLogic.signPDF(files[0], toolParams.signature, 0, 50, 50, 150, 75);
            }
            break;
          // Add other tools as needed for live preview
        }

        if (result) {
          const blob = new Blob([result], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setLivePreviewUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      } catch (err) {
        console.error('Preview generation failed:', err);
      } finally {
        setIsGeneratingPreview(false);
      }
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timer);
  }, [files, toolParams, activeTool]);

  const processPDF = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    try {
      let result: Uint8Array | Uint8Array[] | null = null;
      let outputName = 'processed.pdf';
      let isZip = false;
      
      switch (activeTool) {
        case 'merge':
          if (files.length < 2) {
            alert('Please select at least 2 files to merge.');
            setIsProcessing(false);
            return;
          }
          result = await pdfLogic.mergePDFs(files);
          outputName = 'merged.pdf';
          break;
        case 'split':
          const splitMode = toolParams.splitMode || 'range';
          let ranges = toolParams.range || '1';
          
          if (splitMode === 'every') {
            // Get page count first
            const bytes = await files[0].arrayBuffer();
            const pdf = await pdfjsLib.getDocument(bytes).promise;
            ranges = Array.from({ length: pdf.numPages }, (_, i) => (i + 1).toString()).join(',');
          }
          
          const splitResults = await pdfLogic.splitPDF(files[0], ranges);
          if (splitResults.length > 1) {
            const zip = new JSZip();
            splitResults.forEach((res, i) => {
              zip.file(`part_${i + 1}.pdf`, res);
            });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipUrl = URL.createObjectURL(zipBlob);
            setResultUrl(zipUrl);
            isZip = true;
            outputName = 'split_files.zip';
            await saveFileToStorage(zipBlob, outputName);
          } else {
            result = splitResults[0];
            outputName = 'split_part.pdf';
          }
          break;
        case 'images-to-pdf':
          result = await pdfLogic.imagesToPDF(files, {
            pageSize: toolParams.pageSize,
            orientation: toolParams.orientation,
            imageFit: toolParams.imageFit,
          });
          outputName = 'converted.pdf';
          break;
        case 'rotate':
          const rotations = toolParams.rotations || {};
          if (Object.keys(rotations).length > 0) {
            result = await pdfLogic.rotatePages(files[0], rotations);
          } else {
            // Bulk rotate all pages
            const bytes = await files[0].arrayBuffer();
            const pdf = await pdfjsLib.getDocument(bytes).promise;
            const bulkRotations: Record<number, number> = {};
            for (let i = 0; i < pdf.numPages; i++) bulkRotations[i] = Number(toolParams.rotation || 90);
            result = await pdfLogic.rotatePages(files[0], bulkRotations);
          }
          outputName = 'rotated.pdf';
          break;
        case 'watermark':
          result = await pdfLogic.addWatermark(files[0], toolParams.watermarkText || 'OFFLINE PDF');
          outputName = 'watermarked.pdf';
          break;
        case 'numbers':
          result = await pdfLogic.addPageNumbers(files[0]);
          outputName = 'numbered.pdf';
          break;
        case 'delete':
          const pagesToDelete = (toolParams.pagesToDelete || '').split(',').map((p: string) => Number(p.trim()) - 1);
          result = await pdfLogic.deletePages(files[0], pagesToDelete);
          outputName = 'pages_deleted.pdf';
          break;
        case 'extract':
          const pagesToExtract = (toolParams.pagesToExtract || '').split(',').map((p: string) => Number(p.trim()) - 1);
          result = await pdfLogic.extractPages(files[0], pagesToExtract);
          outputName = 'extracted.pdf';
          break;
        case 'metadata':
          result = await pdfLogic.updateMetadata(files[0], {
            title: toolParams.title,
            author: toolParams.author,
          });
          outputName = 'metadata_updated.pdf';
          break;
        case 'sign':
          if (!toolParams.signature) {
            alert('Please draw your signature first!');
            setIsProcessing(false);
            return;
          }
          result = await pdfLogic.signPDF(files[0], toolParams.signature, 0, 50, 50, 150, 75);
          outputName = 'signed.pdf';
          break;
        case 'viewer':
          const viewerBlob = new Blob([await files[0].arrayBuffer()], { type: 'application/pdf' });
          setResultUrl(URL.createObjectURL(viewerBlob));
          setIsProcessing(false);
          return;
        default:
          alert('This feature is coming soon!');
          setIsProcessing(false);
          return;
      }

      if (result instanceof Uint8Array) {
        const blob = new Blob([result], { type: 'application/pdf' });
        setResultUrl(URL.createObjectURL(blob));
        // Auto-save to "Files" tab
        await saveFileToStorage(blob, outputName);
      }
    } catch (err) {
      console.error(err);
      alert('Error processing PDF. Please try another file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderToolParams = () => {
    switch (activeTool) {
      case 'merge':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-400 uppercase">Merge Order</label>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-bold text-red-600 flex items-center gap-1"
              >
                <Plus size={14} /> Add More
              </button>
            </div>
            <div className="space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white border border-zinc-100 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 bg-zinc-100 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-500">{i + 1}</span>
                    <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
                  </div>
                  <button 
                    onClick={() => setFiles(files.filter((_, index) => index !== i))}
                    className="p-1 text-zinc-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            {files.length < 2 && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2 text-amber-700">
                <Info size={16} />
                <p className="text-xs font-medium">Select at least 2 files to merge.</p>
              </div>
            )}
          </div>
        );
      case 'split':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase">Split Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'every', label: 'Every Page' },
                  { id: 'range', label: 'Page Range' },
                  { id: 'custom', label: 'Custom' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setToolParams({ ...toolParams, splitMode: mode.id })}
                    className={cn(
                      "py-2 px-1 rounded-lg text-[10px] font-bold border transition-all",
                      (toolParams.splitMode || 'range') === mode.id 
                        ? "bg-red-600 border-red-600 text-white" 
                        : "bg-white border-zinc-200 text-zinc-600"
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            
            {(toolParams.splitMode || 'range') !== 'every' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">
                  {toolParams.splitMode === 'custom' ? 'Custom Ranges (e.g. 1-2, 5-8)' : 'Page Range (e.g. 1-3)'}
                </label>
                <input 
                  type="text" 
                  placeholder="1-2" 
                  className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm"
                  value={toolParams.range || ''}
                  onChange={(e) => setToolParams({ ...toolParams, range: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-400 uppercase">Select Pages</label>
                <span className="text-[10px] text-zinc-400">Click pages to select</span>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 bg-zinc-100 rounded-xl">
                <PDFPageGrid 
                  file={files[0]} 
                  selectedPages={toolParams.selectedPages || []}
                  onTogglePage={(index) => {
                    const selected = [...(toolParams.selectedPages || [])];
                    const idx = selected.indexOf(index);
                    if (idx > -1) selected.splice(idx, 1);
                    else selected.push(index);
                    
                    // Update range input based on selection
                    const sorted = [...selected].sort((a, b) => a - b);
                    const rangeStr = sorted.map(i => i + 1).join(', ');
                    setToolParams({ ...toolParams, selectedPages: selected, range: rangeStr });
                  }}
                />
              </div>
            </div>
          </div>
        );
      case 'images-to-pdf':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-400 uppercase">Images</label>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-bold text-red-600 flex items-center gap-1"
              >
                <Plus size={14} /> Add More
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Page Size</label>
                <select 
                  className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs"
                  value={toolParams.pageSize || 'Fit'}
                  onChange={(e) => setToolParams({ ...toolParams, pageSize: e.target.value })}
                >
                  <option value="Fit">Fit Image</option>
                  <option value="A4">A4</option>
                  <option value="Letter">US Letter</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Orientation</label>
                <select 
                  className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs"
                  value={toolParams.orientation || 'auto'}
                  onChange={(e) => setToolParams({ ...toolParams, orientation: e.target.value })}
                >
                  <option value="auto">Auto</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Image Fit</label>
              <div className="grid grid-cols-3 gap-2">
                {['contain', 'cover', 'fill'].map(fit => (
                  <button
                    key={fit}
                    onClick={() => setToolParams({ ...toolParams, imageFit: fit })}
                    className={cn(
                      "py-2 rounded-lg text-[10px] font-bold border capitalize transition-all",
                      (toolParams.imageFit || 'contain') === fit 
                        ? "bg-red-600 border-red-600 text-white" 
                        : "bg-white border-zinc-200 text-zinc-600"
                    )}
                  >
                    {fit}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'rotate':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-400 uppercase">Rotate Pages</label>
              <button 
                onClick={() => {
                  const newRotations = { ...(toolParams.rotations || {}) };
                  // Rotate all pages by 90
                  files[0].arrayBuffer().then(async bytes => {
                    const pdf = await pdfjsLib.getDocument(bytes).promise;
                    for (let i = 0; i < pdf.numPages; i++) {
                      newRotations[i] = ((newRotations[i] || 0) + 90) % 360;
                    }
                    setToolParams({ ...toolParams, rotations: newRotations });
                  });
                }}
                className="text-xs font-bold text-red-600 flex items-center gap-1"
              >
                <RotateCw size={14} /> Rotate All
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 bg-zinc-100 rounded-xl">
              <PDFPageGrid 
                file={files[0]} 
                rotations={toolParams.rotations || {}}
                onRotatePage={(index) => {
                  const newRotations = { ...(toolParams.rotations || {}) };
                  newRotations[index] = ((newRotations[index] || 0) + 90) % 360;
                  setToolParams({ ...toolParams, rotations: newRotations });
                }}
              />
            </div>
          </div>
        );
      case 'watermark':
        return (
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase">Watermark Text</label>
            <input 
              type="text" 
              placeholder="CONFIDENTIAL" 
              className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm"
              value={toolParams.watermarkText || ''}
              onChange={(e) => setToolParams({ ...toolParams, watermarkText: e.target.value })}
            />
          </div>
        );
      case 'delete':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase">Pages to Delete</label>
              <input 
                type="text" 
                placeholder="2, 4" 
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm"
                value={toolParams.pagesToDelete || ''}
                onChange={(e) => setToolParams({ ...toolParams, pagesToDelete: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-400 uppercase">Select Pages to Remove</label>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 bg-zinc-100 rounded-xl">
                <PDFPageGrid 
                  file={files[0]} 
                  columns={4}
                  selectedPages={toolParams.selectedPages || []}
                  onTogglePage={(index) => {
                    const selected = [...(toolParams.selectedPages || [])];
                    const idx = selected.indexOf(index);
                    if (idx > -1) selected.splice(idx, 1);
                    else selected.push(index);
                    
                    const sorted = [...selected].sort((a, b) => a - b);
                    const rangeStr = sorted.map(i => i + 1).join(', ');
                    setToolParams({ ...toolParams, selectedPages: selected, pagesToDelete: rangeStr });
                  }}
                />
              </div>
            </div>
          </div>
        );
      case 'extract':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase">Pages to Extract</label>
              <input 
                type="text" 
                placeholder="1, 3, 5" 
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm"
                value={toolParams.pagesToExtract || ''}
                onChange={(e) => setToolParams({ ...toolParams, pagesToExtract: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-400 uppercase">Select Pages to Extract</label>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 bg-zinc-100 rounded-xl">
                <PDFPageGrid 
                  file={files[0]} 
                  columns={4}
                  selectedPages={toolParams.selectedPages || []}
                  onTogglePage={(index) => {
                    const selected = [...(toolParams.selectedPages || [])];
                    const idx = selected.indexOf(index);
                    if (idx > -1) selected.splice(idx, 1);
                    else selected.push(index);
                    
                    const sorted = [...selected].sort((a, b) => a - b);
                    const rangeStr = sorted.map(i => i + 1).join(', ');
                    setToolParams({ ...toolParams, selectedPages: selected, pagesToExtract: rangeStr });
                  }}
                />
              </div>
            </div>
          </div>
        );
      case 'metadata':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase">Title</label>
              <input 
                type="text" 
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm"
                value={toolParams.title || ''}
                onChange={(e) => setToolParams({ ...toolParams, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase">Author</label>
              <input 
                type="text" 
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm"
                value={toolParams.author || ''}
                onChange={(e) => setToolParams({ ...toolParams, author: e.target.value })}
              />
            </div>
          </div>
        );
      case 'lock':
      case 'unlock':
        return (
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-center space-y-2">
            <Lock size={24} className="text-amber-500 mx-auto" />
            <p className="text-sm text-amber-900 font-bold">Advanced Encryption Coming Soon</p>
            <p className="text-xs text-amber-700">We are working on adding secure AES-256 encryption to this offline tool.</p>
          </div>
        );
      case 'fill':
        return (
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-center space-y-2">
            <FilePlus size={24} className="text-blue-500 mx-auto" />
            <p className="text-sm text-blue-900 font-bold">Form Filling Coming Soon</p>
            <p className="text-xs text-blue-700">Interactive form filling is being developed for the next release.</p>
          </div>
        );
      case 'sign':
        return (
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase">Draw your signature</label>
            <SignatureCanvas onSave={(data) => setToolParams({ ...toolParams, signature: data })} />
            {toolParams.signature && (
              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-500" />
                <span className="text-xs text-emerald-700 font-medium">Signature captured!</span>
              </div>
            )}
          </div>
        );
      case 'viewer':
        return (
          <div className="p-4 bg-zinc-100 rounded-xl text-center">
            <p className="text-sm text-zinc-500">Tap "Process Now" to open the viewer.</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-zinc-50 shadow-2xl relative overflow-hidden">
      {/* Header - Only on Frontpage and Settings */}
      {((currentTab === 'tools' && !activeTool) || currentTab === 'settings') && (
        <header className="p-6 flex items-center justify-between bg-white border-b border-zinc-100 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-200">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Offline PDF</h1>
              <p className="text-xs text-zinc-500 font-medium">100% Private & Secure</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showInstallBtn && (
              <button 
                onClick={handleInstallClick}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-full text-[10px] font-bold shadow-lg shadow-red-100 active:scale-95 transition-all"
              >
                <Download size={12} />
                Install App
              </button>
            )}
            <button className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
              <Info size={20} className="text-zinc-400" />
            </button>
          </div>
        </header>
      )}

      <main className="flex-1 overflow-y-auto pb-24">
        <AnimatePresence mode="wait">
          {activeTool ? (
            <motion.div 
              key="tool-view"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-6 space-y-6"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">{TOOLS.find(t => t.id === activeTool)?.name}</h2>
                <p className="text-sm text-zinc-500">{TOOLS.find(t => t.id === activeTool)?.description}</p>
              </div>

              {/* File Upload Area / Live Preview */}
              {!resultUrl && (
                files.length === 0 ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-zinc-200 rounded-3xl p-10 flex flex-col items-center justify-center gap-4 bg-white hover:border-red-400 hover:bg-red-50/30 transition-all cursor-pointer group"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      className="hidden" 
                      multiple={activeTool === 'merge' || activeTool === 'images-to-pdf'}
                      accept={activeTool === 'images-to-pdf' ? "image/*" : "application/pdf"}
                    />
                    <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 group-hover:bg-red-100 group-hover:text-red-500 transition-colors">
                      <FilePlus size={32} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-zinc-900">Tap to select files</p>
                      <p className="text-xs text-zinc-400 mt-1">PDF files up to 50MB</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Live Preview</p>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
                      >
                        <Plus size={14} />
                        Change File
                      </button>
                    </div>
                    <div className="relative aspect-[3/4] w-full bg-zinc-200 rounded-3xl overflow-hidden border border-zinc-200 shadow-inner group">
                      {livePreviewUrl ? (
                        <iframe 
                          src={`${livePreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`} 
                          className="w-full h-full border-none"
                          title="Live Preview"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400">
                          <FileSearch size={48} className="animate-pulse" />
                        </div>
                      )}
                      
                      {isGeneratingPreview && (
                        <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin" />
                            <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Updating Preview</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              {/* Selected Files List */}
              {files.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Selected Files ({files.length})</p>
                  <div className="space-y-2">
                    {files.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white border border-zinc-100 rounded-xl">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <FileText size={18} className="text-red-500 flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{file.name}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tool Parameters */}
              {files.length > 0 && !resultUrl && renderToolParams()}

              {/* Action Button */}
              {files.length > 0 && !resultUrl && activeTool !== 'viewer' && (
                <button
                  disabled={isProcessing}
                  onClick={processPDF}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2",
                    isProcessing ? "bg-zinc-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700 active:scale-[0.98] shadow-red-200"
                  )}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap size={20} />
                      Process Now
                    </>
                  )}
                </button>
              )}

              {/* Result Area */}
              {resultUrl && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 text-center space-y-4"
                >
                  <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-200">
                    <ShieldCheck size={32} />
                  </div>
                  <div>
                    <h3 className="font-bold text-emerald-900">Success!</h3>
                    <p className="text-sm text-emerald-700">Your PDF is ready.</p>
                  </div>
                  
                  {activeTool === 'viewer' ? (
                    <div className="w-full h-[400px] border border-zinc-200 rounded-xl overflow-hidden bg-white">
                      <iframe src={resultUrl} className="w-full h-full" title="PDF Viewer" />
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = resultUrl;
                          a.download = "offline-pdf-result.pdf";
                          a.click();
                        }}
                        className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors"
                      >
                        <Download size={18} />
                        Download
                      </button>
                      <button 
                        onClick={reset}
                        className="px-4 bg-white border border-emerald-200 text-emerald-600 rounded-xl font-bold hover:bg-emerald-50 transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  )}
                  
                  {activeTool === 'viewer' && (
                    <button 
                      onClick={reset}
                      className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold"
                    >
                      Close Viewer
                    </button>
                  )}
                </motion.div>
              )}
            </motion.div>
          ) : currentTab === 'tools' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 space-y-6"
            >
              <div className="grid grid-cols-2 gap-4">
                {TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTool(tool.id)}
                    className="flex flex-col items-start p-4 bg-white rounded-2xl border border-zinc-100 card-hover text-left group"
                  >
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white mb-3 shadow-sm group-hover:scale-110 transition-transform", tool.color)}>
                      <tool.icon size={24} />
                    </div>
                    <h3 className="font-bold text-sm mb-1">{tool.name}</h3>
                    <p className="text-[10px] text-zinc-400 leading-tight">{tool.description}</p>
                  </button>
                ))}
              </div>

              {/* Security Badge */}
              <div className="flex items-center justify-center gap-2 py-4">
                <ShieldCheck size={16} className="text-emerald-500" />
                <span className="text-xs text-zinc-400 font-medium">No files ever leave your device</span>
              </div>
            </motion.div>
          ) : currentTab === 'files' ? (
            <motion.div 
              key="files-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">My Files</h2>
                <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-2 py-1 rounded-md">{storedFiles.length} Files</span>
              </div>

              {storedFiles.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                  <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-300 mx-auto">
                    <FileText size={40} />
                  </div>
                  <p className="text-zinc-400 text-sm">No files processed yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {storedFiles.map((file) => (
                    <div key={file.id} className="bg-white p-4 rounded-2xl border border-zinc-100 flex items-center justify-between group">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-500">
                          <FileText size={20} />
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="text-sm font-bold truncate">{file.name}</h3>
                          <p className="text-[10px] text-zinc-400">{new Date(file.date).toLocaleDateString()} • {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            const url = URL.createObjectURL(file.blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = file.name;
                            a.click();
                          }}
                          className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-900 transition-colors"
                        >
                          <Download size={18} />
                        </button>
                        <button 
                          onClick={() => deleteStoredFile(file.id)}
                          className="p-2 hover:bg-red-50 rounded-full text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : currentTab === 'settings' ? (
            <motion.div 
              key="settings-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 space-y-8"
            >
              <h2 className="text-2xl font-bold">Settings</h2>
              
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                  <div className="p-4 flex items-center justify-between border-b border-zinc-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-500">
                        <Zap size={16} />
                      </div>
                      <span className="text-sm font-bold">Premium Status</span>
                    </div>
                    <span className={cn("text-[10px] font-bold uppercase px-2 py-1 rounded-md", isPremium ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500")}>
                      {isPremium ? 'Active' : 'Free'}
                    </span>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-500">
                        <ShieldCheck size={16} />
                      </div>
                      <span className="text-sm font-bold">Privacy Mode</span>
                    </div>
                    <div className="w-10 h-5 bg-emerald-500 rounded-full relative">
                      <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                  <button className="w-full p-4 flex items-center gap-3 hover:bg-zinc-50 transition-colors border-b border-zinc-50">
                    <Info size={16} className="text-zinc-400" />
                    <span className="text-sm font-medium">About Offline PDF</span>
                  </button>
                  <button className="w-full p-4 flex items-center gap-3 hover:bg-zinc-50 transition-colors border-b border-zinc-50">
                    <ShieldCheck size={16} className="text-zinc-400" />
                    <span className="text-sm font-medium">Privacy Policy</span>
                  </button>
                  <button className="w-full p-4 flex items-center gap-3 hover:bg-zinc-50 transition-colors">
                    <Settings size={16} className="text-zinc-400" />
                    <span className="text-sm font-medium">Clear All Data</span>
                  </button>
                </div>
              </div>

              <div className="text-center">
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Version 1.0.0 (Build 42)</p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="premium-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 space-y-8"
            >
              <div className="text-center space-y-4 py-8">
                <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center text-amber-500 mx-auto shadow-xl shadow-amber-100 animate-bounce">
                  <Zap size={40} />
                </div>
                <h2 className="text-3xl font-bold">Go Premium</h2>
                <p className="text-zinc-500 text-sm max-w-[200px] mx-auto">Unlock the full potential of your PDF toolkit.</p>
              </div>

              <div className="space-y-4">
                {[
                  { title: 'Ad-Free Experience', desc: 'Remove all sponsored content' },
                  { title: 'Unlimited Files', desc: 'Process as many PDFs as you need' },
                  { title: 'Advanced Compression', desc: 'Reduce file size up to 90%' },
                  { title: 'Priority Support', desc: 'Get help within 24 hours' }
                ].map((feature, i) => (
                  <div key={i} className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100">
                    <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 flex-shrink-0">
                      <ShieldCheck size={14} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">{feature.title}</h3>
                      <p className="text-[10px] text-zinc-400">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => {
                  setIsPremium(true);
                  setCurrentTab('tools');
                }}
                className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold shadow-xl shadow-zinc-200 active:scale-95 transition-all"
              >
                Upgrade for $4.99/mo
              </button>
              <button className="w-full text-zinc-400 text-xs font-bold">Restore Purchase</button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Create New Menu Overlay */}
      <AnimatePresence>
        {showCreateMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateMenu(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              className="fixed bottom-24 left-6 right-6 bg-white rounded-3xl p-6 shadow-2xl z-50 space-y-4"
            >
              <h3 className="font-bold text-lg mb-4">Create New</h3>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => { setActiveTool('images-to-pdf'); setShowCreateMenu(false); }}
                  className="flex flex-col items-center gap-2 p-4 bg-emerald-50 rounded-2xl text-emerald-700"
                >
                  <ImageIcon size={24} />
                  <span className="text-xs font-bold">From Images</span>
                </button>
                <button 
                  onClick={() => { setActiveTool('merge'); setShowCreateMenu(false); }}
                  className="flex flex-col items-center gap-2 p-4 bg-blue-50 rounded-2xl text-blue-700"
                >
                  <Merge size={24} />
                  <span className="text-xs font-bold">Merge Files</span>
                </button>
                <button 
                  onClick={() => { alert('Blank PDF coming soon!'); setShowCreateMenu(false); }}
                  className="flex flex-col items-center gap-2 p-4 bg-zinc-50 rounded-2xl text-zinc-700"
                >
                  <FileText size={24} />
                  <span className="text-xs font-bold">Blank PDF</span>
                </button>
                <button 
                  onClick={() => { alert('Scan coming soon!'); setShowCreateMenu(false); }}
                  className="flex flex-col items-center gap-2 p-4 bg-amber-50 rounded-2xl text-amber-700"
                >
                  <PenTool size={24} />
                  <span className="text-xs font-bold">Scan Document</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Navigation (Mobile Style) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-lg border-t border-zinc-100 px-6 py-3 flex items-center justify-between z-30">
        <button 
          onClick={() => { setCurrentTab('tools'); reset(); }}
          className={cn("flex flex-col items-center gap-1 transition-colors", currentTab === 'tools' ? "text-red-600" : "text-zinc-400")}
        >
          <LayoutGrid size={20} />
          <span className="text-[10px] font-bold">Tools</span>
        </button>
        <button 
          onClick={() => { setCurrentTab('files'); reset(); }}
          className={cn("flex flex-col items-center gap-1 transition-colors", currentTab === 'files' ? "text-red-600" : "text-zinc-400")}
        >
          <FileText size={20} />
          <span className="text-[10px] font-bold">Files</span>
        </button>
        <div className="relative -top-6">
          <button 
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            className={cn(
              "w-14 h-14 bg-red-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-red-200 border-4 border-zinc-50 transition-transform",
              showCreateMenu ? "rotate-45" : "rotate-0"
            )}
          >
            <Plus size={28} />
          </button>
        </div>
        <button 
          onClick={() => { setCurrentTab('settings'); reset(); }}
          className={cn("flex flex-col items-center gap-1 transition-colors", currentTab === 'settings' ? "text-red-600" : "text-zinc-400")}
        >
          <Settings size={20} />
          <span className="text-[10px] font-bold">Settings</span>
        </button>
        <button 
          onClick={() => { setCurrentTab('premium'); reset(); }}
          className={cn("flex flex-col items-center gap-1 transition-colors", currentTab === 'premium' ? "text-amber-500" : "text-zinc-400")}
        >
          <Zap size={20} className={currentTab === 'premium' ? "text-amber-600" : "text-amber-500"} />
          <span className="text-[10px] font-bold">Premium</span>
        </button>
      </nav>
    </div>
  );
}
