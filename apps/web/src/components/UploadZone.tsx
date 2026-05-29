'use client'

import { useRef } from 'react'

interface Props {
  onUpload: (files: FileList) => void
  isPhotographer: boolean
}

export function UploadZone({ onUpload, isPhotographer }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  if (!isPhotographer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
        <p>No photos yet. Waiting for photographer to upload.</p>
      </div>
    )
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files)
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={e => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-neutral-700 hover:border-brand-500 rounded-2xl cursor-pointer transition"
    >
      <p className="text-4xl mb-3">📷</p>
      <p className="text-neutral-400">Drop photos here or click to upload</p>
      <p className="text-neutral-600 text-sm mt-1">JPG, PNG, HEIC, RAW supported</p>
      <input ref={inputRef} type="file" multiple accept="image/*" className="hidden"
        onChange={e => e.target.files && onUpload(e.target.files)} />
    </div>
  )
}
