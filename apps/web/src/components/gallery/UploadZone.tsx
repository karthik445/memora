'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useGalleryStore } from '@/lib/stores/gallery.store'
import { useUploadPhotos } from '@/lib/hooks/usePhotos'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/lib/utils'

const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic', '.heif'],
  'image/tiff': ['.tiff', '.tif'],
  'image/avif': ['.avif'],
  'application/octet-stream': ['.raw', '.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.rw2'],
}

interface Props {
  weddingId: string
  eventId?: string
}

export function UploadZone({ weddingId, eventId }: Props) {
  const [queued, setQueued] = useState<File[]>([])
  const { isUploading, uploadProgress, uploadTotal, uploadFailed } = useGalleryStore()
  const { mutate: upload } = useUploadPhotos(weddingId)

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length === 0) return
      setQueued(accepted)
      upload({ files: accepted, eventId })
    },
    [upload, eventId],
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 500 * 1024 * 1024,
    multiple: true,
    disabled: isUploading,
  })

  const progress = uploadTotal > 0 ? (uploadProgress / uploadTotal) * 100 : 0

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
          isDragActive && !isDragReject && 'border-brand-400 bg-brand-500/5 scale-[1.01]',
          isDragReject && 'border-destructive bg-destructive/5',
          isUploading && 'cursor-not-allowed opacity-60',
          !isDragActive && !isUploading && 'border-border hover:border-brand-400/50 hover:bg-brand-500/2',
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
            isDragActive ? 'bg-brand-500/20' : 'bg-muted',
          )}>
            {isUploading
              ? <Loader2 size={24} className="text-brand-400 animate-spin" />
              : <Upload size={24} className={isDragActive ? 'text-brand-400' : 'text-muted-foreground'} />
            }
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">
              {isDragActive
                ? isDragReject ? 'Unsupported file type' : 'Drop photos here'
                : isUploading ? `Uploading ${uploadProgress} of ${uploadTotal}…`
                : 'Drop photos or click to upload'
              }
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPEG, PNG, WebP, HEIC, RAW — up to 500 MB each
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <AnimatePresence>
          {isUploading && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4"
            >
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-brand-500 rounded-full"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
                <span className="text-xs text-muted-foreground">
                  {uploadProgress} / {uploadTotal} files
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Failed files */}
      <AnimatePresence>
        {uploadFailed.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-destructive/10 border border-destructive/20 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-2">
              <AlertCircle size={14} />
              {uploadFailed.length} file{uploadFailed.length > 1 ? 's' : ''} failed
            </div>
            <ul className="space-y-0.5">
              {uploadFailed.slice(0, 5).map(name => (
                <li key={name} className="text-xs text-muted-foreground truncate">{name}</li>
              ))}
              {uploadFailed.length > 5 && (
                <li className="text-xs text-muted-foreground">…and {uploadFailed.length - 5} more</li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
