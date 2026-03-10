import { Area } from 'react-easy-crop';

export type AspectRatio = '1:1' | '3:4' | '9:16';

export interface ImageFile {
  id: string;
  file: File;
  preview: string;
  dimensions?: { width: number; height: number };
  crop: { x: number; y: number };
  zoom: number;
  aspect: number;
  pixelCrop?: Area;
  croppedImageUrl?: string;
  croppedBlob?: Blob;
  status: 'pending' | 'processing' | 'done' | 'error';
}

export const ASPECT_RATIOS: Record<AspectRatio, number> = {
  '1:1': 1,
  '3:4': 3 / 4,
  '9:16': 9 / 16,
};
