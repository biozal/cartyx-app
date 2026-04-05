import React, { useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { Camera, X } from 'lucide-react'

interface ImageCropInputProps {
  imageUrl: string
  crop: { x: number; y: number; width: number; height: number } | null
  onImageChange: (url: string) => void
  onCropChange: (crop: { x: number; y: number; width: number; height: number } | null) => void
  onUpload: (file: File) => Promise<string>
  disabled?: boolean
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ImageCropInput({
  imageUrl,
  crop: savedCrop,
  onImageChange,
  onCropChange,
  onUpload,
  disabled,
}: ImageCropInputProps) {
  const [isCropping, setIsCropping] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [cropImageSrc, setCropImageSrc] = useState<string>('')
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPG, PNG, and WebP images are accepted.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('Image must be under 5MB.')
      return
    }

    setSelectedFile(file)

    const reader = new FileReader()
    reader.onload = () => {
      setCropImageSrc(reader.result as string)
      setCropPosition({ x: 0, y: 0 })
      setZoom(1)
      setIsCropping(true)
    }
    reader.readAsDataURL(file)
  }, [])

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleConfirmCrop = useCallback(async () => {
    if (!croppedAreaPixels) {
      setError('Please adjust the crop area before confirming.')
      return
    }
    if (!selectedFile) {
      setError('No file selected. Please try again.')
      return
    }

    setIsUploading(true)
    setError(null)
    try {
      const publicUrl = await onUpload(selectedFile)

      // Create an image to get natural dimensions for normalization
      const img = new Image()
      img.src = cropImageSrc
      await new Promise((resolve) => { img.onload = resolve })

      const normalizedCrop = {
        x: croppedAreaPixels.x / img.naturalWidth,
        y: croppedAreaPixels.y / img.naturalHeight,
        width: croppedAreaPixels.width / img.naturalWidth,
        height: croppedAreaPixels.height / img.naturalHeight,
      }

      onImageChange(publicUrl)
      onCropChange(normalizedCrop)
      setIsCropping(false)
      setCropImageSrc('')
      setSelectedFile(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }, [croppedAreaPixels, selectedFile, cropImageSrc, onUpload, onImageChange, onCropChange])

  const handleCancelCrop = useCallback(() => {
    setIsCropping(false)
    setCropImageSrc('')
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleRemoveImage = useCallback(() => {
    onImageChange('')
    onCropChange(null)
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [onImageChange, onCropChange])

  return (
    <div className="flex flex-col items-center gap-2">
      {/* File input always mounted so the ref persists */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {isCropping ? (
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-64 h-64 bg-black rounded-lg overflow-hidden">
            <Cropper
              image={cropImageSrc}
              crop={cropPosition}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              onCropChange={setCropPosition}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <p className="text-[10px] text-slate-500 font-sans">
            Drag to position, scroll to zoom
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancelCrop}
              disabled={isUploading}
              className="px-4 py-1.5 rounded text-xs font-semibold text-slate-300 border border-white/[0.07] hover:bg-white/[0.05] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmCrop}
              disabled={isUploading}
              className="px-4 py-1.5 rounded text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : 'Confirm'}
            </button>
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>
      ) : (
        <>
          {imageUrl ? (
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/10">
                <img
                  src={imageUrl}
                  alt="Character"
                  className="w-full h-full object-cover"
                  style={
                    savedCrop
                      ? {
                          objectPosition: `${savedCrop.x * 100}% ${savedCrop.y * 100}%`,
                        }
                      : undefined
                  }
                />
              </div>
              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={disabled}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 flex items-center justify-center hover:bg-rose-500 transition-colors"
                aria-label="Remove image"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="w-24 h-24 rounded-full border-2 border-dashed border-white/[0.15] flex flex-col items-center justify-center gap-1 hover:border-blue-500/50 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Camera className="h-5 w-5 text-slate-500" />
              <span className="text-[9px] text-slate-500 font-semibold">Upload</span>
            </button>
          )}

          {!imageUrl && (
            <p className="text-[10px] text-slate-600 text-center font-sans">
              Recommended: 512×512px or larger. Max 5MB.
              <br />
              JPG, PNG, or WebP.
            </p>
          )}

          {imageUrl && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold transition-colors"
            >
              Change image
            </button>
          )}

          {error && <p className="text-xs text-rose-400">{error}</p>}
        </>
      )}
    </div>
  )
}
