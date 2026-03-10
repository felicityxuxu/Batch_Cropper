/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { 
  Upload, 
  Crop, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Loader2, 
  LayoutGrid, 
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Settings2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { cn } from './lib/utils';
import { AspectRatio, ImageFile, ASPECT_RATIOS } from './types';
import getCroppedImg from './lib/cropImage';

export default function App() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('1:1');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      
      const newFilesPromises = files.map(async (file) => {
        const preview = URL.createObjectURL(file);
        
        // Get dimensions
        const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.src = preview;
        });

        return {
          id: Math.random().toString(36).substring(7),
          file,
          preview,
          dimensions,
          crop: { x: 0, y: 0 },
          zoom: 1,
          aspect: ASPECT_RATIOS[selectedAspectRatio],
          status: 'pending' as const,
        };
      });

      const newFiles = await Promise.all(newFilesPromises);
      setImages((prev) => [...prev, ...newFiles]);
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      const removed = prev.find((img) => img.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return filtered;
    });
    if (activeImageId === id) setActiveImageId(null);
  };

  const resetQueue = () => {
    images.forEach((img) => {
      URL.revokeObjectURL(img.preview);
      if (img.croppedImageUrl) URL.revokeObjectURL(img.croppedImageUrl);
    });
    setImages([]);
    setActiveImageId(null);
  };

  const onCropChange = (id: string, crop: { x: number; y: number }) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, crop } : img))
    );
  };

  const onZoomChange = (id: string, zoom: number) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, zoom } : img))
    );
  };

  const onCropComplete = useCallback((id: string, croppedArea: Area, croppedAreaPixels: Area) => {
    // Store pixel crop data if needed for final processing
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, pixelCrop: croppedAreaPixels } : img))
    );
  }, []);

  const handleAspectRatioChange = (ratio: AspectRatio) => {
    setSelectedAspectRatio(ratio);
    if (activeImageId) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === activeImageId
            ? {
                ...img,
                aspect: ASPECT_RATIOS[ratio],
                status: 'pending',
                pixelCrop: undefined,
                croppedImageUrl: undefined,
                croppedBlob: undefined,
              }
            : img
        )
      );
    }
  };

  const processAll = async () => {
    setIsProcessing(true);
    const updatedImages = [...images];

    for (let i = 0; i < updatedImages.length; i++) {
      const img = updatedImages[i];
      if (img.status === 'done') continue;

      try {
        setImages((prev) =>
          prev.map((item) =>
            item.id === img.id ? { ...item, status: 'processing' } : item
          )
        );

        let pixelCrop = img.pixelCrop;
        
        // If no pixelCrop (user didn't visit image), calculate center crop
        if (!pixelCrop && img.dimensions) {
          const { width, height } = img.dimensions;
          const targetAspect = img.aspect;
          
          let cropWidth, cropHeight;
          if (width / height > targetAspect) {
            cropHeight = height;
            cropWidth = height * targetAspect;
          } else {
            cropWidth = width;
            cropHeight = width / targetAspect;
          }
          
          pixelCrop = {
            x: (width - cropWidth) / 2,
            y: (height - cropHeight) / 2,
            width: cropWidth,
            height: cropHeight
          };
        }
        
        if (pixelCrop) {
          const croppedBlob = await getCroppedImg(img.preview, pixelCrop);
          if (croppedBlob instanceof Blob) {
            const croppedUrl = URL.createObjectURL(croppedBlob);
            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id
                  ? { ...item, status: 'done', croppedImageUrl: croppedUrl, croppedBlob }
                  : item
              )
            );
          }
        }
      } catch (e) {
        console.error(e);
        setImages((prev) =>
          prev.map((item) =>
            item.id === img.id ? { ...item, status: 'error' } : item
          )
        );
      }
    }
    setIsProcessing(false);
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    images.forEach((img, index) => {
      if (img.croppedBlob) {
        const extension = img.file.name.split('.').pop() || 'jpg';
        zip.file(`cropped_${index + 1}.${extension}`, img.croppedBlob);
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'cropped_images.zip');
  };

  const activeImage = images.find((img) => img.id === activeImageId);

  const currentRatio = activeImage
    ? (Object.entries(ASPECT_RATIOS).find(([_, val]) => val === activeImage.aspect)?.[0] as AspectRatio)
    : selectedAspectRatio;

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#F5F5F0]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#F5F5F0]/80 backdrop-blur-md border-b border-[#141414]/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#141414] rounded-full flex items-center justify-center text-[#F5F5F0]">
              <Crop size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Batch Cropper</h1>
              <p className="text-xs text-[#141414]/50 uppercase tracking-widest font-medium">Image Processing Tool</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {images.length > 0 && (
              <button
                onClick={resetQueue}
                className="flex items-center gap-2 px-5 py-2 rounded-xl border border-red-200 text-red-600 font-medium hover:bg-red-50 transition-all active:scale-95"
              >
                <Trash2 size={18} />
                Reset
              </button>
            )}
            {images.length > 0 && (
              <button
                onClick={processAll}
                disabled={isProcessing || images.every(img => img.status === 'done')}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all",
                  isProcessing || images.every(img => img.status === 'done')
                    ? "bg-[#141414]/10 text-[#141414]/30 cursor-not-allowed"
                    : "bg-[#141414] text-[#F5F5F0] hover:scale-105 active:scale-95 shadow-lg"
                )}
              >
                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Maximize2 size={18} />}
                {isProcessing ? 'Processing...' : 'Process All'}
              </button>
            )}
            {images.some(img => img.status === 'done') && (
              <button
                onClick={downloadAll}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-all hover:scale-105 active:scale-95 shadow-lg"
              >
                <Download size={18} />
                Download ZIP
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Sidebar Controls */}
          <div className="lg:col-span-3 space-y-8">
            <section>
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#141414]/40 mb-4 flex items-center gap-2">
                <Settings2 size={14} />
                Aspect Ratio
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {(['1:1', '3:4', '9:16'] as AspectRatio[]).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => handleAspectRatioChange(ratio)}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl text-left font-medium transition-all flex items-center justify-between",
                      currentRatio === ratio
                        ? "bg-[#141414] text-[#F5F5F0] shadow-lg"
                        : "bg-white text-[#141414] hover:bg-[#141414]/5 border border-[#141414]/10"
                    )}
                  >
                    <span>{ratio}</span>
                    <div className={cn(
                      "border-2 rounded-sm",
                      ratio === '1:1' ? "w-4 h-4" : ratio === '3:4' ? "w-3 h-4" : "w-2 h-4",
                      currentRatio === ratio ? "border-[#F5F5F0]" : "border-[#141414]/30"
                    )} />
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#141414]/40 mb-4 flex items-center gap-2">
                <LayoutGrid size={14} />
                Queue ({images.length})
              </h3>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {images.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-[#141414]/10 rounded-xl">
                    <p className="text-xs text-[#141414]/30 font-medium">Queue is empty</p>
                  </div>
                ) : (
                  images.map((img) => (
                    <div
                      key={img.id}
                      onClick={() => setActiveImageId(img.id)}
                      className={cn(
                        "group relative flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer",
                        activeImageId === img.id
                          ? "bg-[#141414] border-[#141414] text-[#F5F5F0]"
                          : "bg-white border-[#141414]/10 hover:border-[#141414]/30"
                      )}
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#141414]/5 flex-shrink-0">
                        <img src={img.preview} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{img.file.name}</p>
                        <p className={cn(
                          "text-[10px] uppercase font-bold tracking-tighter",
                          activeImageId === img.id ? "text-[#F5F5F0]/50" : "text-[#141414]/40"
                        )}>
                          {img.status === 'done' ? 'Ready' : img.status === 'processing' ? 'Processing...' : 'Pending'}
                        </p>
                      </div>
                      {img.status === 'done' && <CheckCircle2 size={16} className="text-emerald-500" />}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(img.id);
                        }}
                        className={cn(
                          "p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity",
                          activeImageId === img.id ? "hover:bg-white/10 text-white" : "hover:bg-red-50 text-red-500"
                        )}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-[#141414]/20 text-[#141414]/40 font-medium hover:border-[#141414]/40 hover:text-[#141414]/60 transition-all flex items-center justify-center gap-2"
              >
                <Upload size={16} />
                Add Images
              </button>
            </section>
          </div>

          {/* Main Editor */}
          <div className="lg:col-span-9">
            <AnimatePresence mode="wait">
              {activeImage ? (
                <motion.div
                  key={activeImage.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-white rounded-[2rem] shadow-xl overflow-hidden border border-[#141414]/5 flex flex-col h-[70vh]"
                >
                  <div className="relative flex-1 bg-[#141414]/5">
                    <Cropper
                      image={activeImage.preview}
                      crop={activeImage.crop}
                      zoom={activeImage.zoom}
                      aspect={activeImage.aspect}
                      onCropChange={(crop) => onCropChange(activeImage.id, crop)}
                      onCropComplete={(_, pixels) => onCropComplete(activeImage.id, _, pixels)}
                      onZoomChange={(zoom) => onZoomChange(activeImage.id, zoom)}
                    />
                    
                    {/* Navigation Overlays */}
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <button 
                        onClick={() => {
                          const idx = images.findIndex(i => i.id === activeImageId);
                          if (idx > 0) setActiveImageId(images[idx-1].id);
                        }}
                        disabled={images.findIndex(i => i.id === activeImageId) === 0}
                        className="p-2 rounded-full bg-white/80 backdrop-blur shadow-lg pointer-events-auto disabled:opacity-30 transition-all hover:scale-110 active:scale-90"
                      >
                        <ChevronLeft size={24} />
                      </button>
                    </div>
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                      <button 
                        onClick={() => {
                          const idx = images.findIndex(i => i.id === activeImageId);
                          if (idx < images.length - 1) setActiveImageId(images[idx+1].id);
                        }}
                        disabled={images.findIndex(i => i.id === activeImageId) === images.length - 1}
                        className="p-2 rounded-full bg-white/80 backdrop-blur shadow-lg pointer-events-auto disabled:opacity-30 transition-all hover:scale-110 active:scale-90"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </div>
                  </div>

                  <div className="p-6 border-t border-[#141414]/5 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-6">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-[#141414]/40">Zoom</label>
                        <input
                          type="range"
                          min={1}
                          max={3}
                          step={0.1}
                          value={activeImage.zoom}
                          onChange={(e) => onZoomChange(activeImage.id, Number(e.target.value))}
                          className="block w-48 h-1.5 bg-[#141414]/10 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-[#141414]/50 font-medium italic">
                        Adjust the crop area for {activeImage.file.name}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-white/50 border-2 border-dashed border-[#141414]/10 rounded-[2rem] h-[70vh] flex flex-col items-center justify-center text-[#141414]/30">
                  <Maximize2 size={48} strokeWidth={1} className="mb-4" />
                  <p className="font-medium text-lg">Select an image from the queue to edit</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-6 px-8 py-3 bg-[#141414] text-[#F5F5F0] rounded-2xl font-medium hover:scale-105 transition-transform active:scale-95 flex items-center gap-2"
                  >
                    <Upload size={20} />
                    Upload Images
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        multiple
        accept="image/*"
        className="hidden"
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(20, 20, 20, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(20, 20, 20, 0.2);
        }
      `}</style>
    </div>
  );
}
