import { useRef } from 'react'
import { CheckCircle2, Loader2, Upload, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type FileUploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface FileUploadFieldProps {
  label: string
  accept?: string
  required?: boolean
  file: File | null
  onFileChange: (file: File | null) => void
  status?: FileUploadStatus
  errorMessage?: string
  /** Name of a file already on record (e.g. a previously uploaded KYC document) — shown
   * when the user hasn't picked a new file yet. */
  existingFileName?: string
}

/** Section 6: consistent upload UI with status feedback — KYC documents (Phase 2B) and
 * invoice documents (Phase 3B) both used a bare <input type="file"> with no upload
 * progress/success/error affordance; this is the one place that's handled from now on. */
export function FileUploadField({
  label,
  accept,
  required = false,
  file,
  onFileChange,
  status = 'idle',
  errorMessage,
  existingFileName,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="mt-space-2">
      <Label>
        {label}
        {required ? (
          <span className="ml-1.5 text-size-5 font-semibold text-destructive">Required</span>
        ) : (
          <span className="ml-1.5 text-size-5 font-normal text-muted-foreground">Optional</span>
        )}
      </Label>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={status === 'uploading'}>
          <Upload className="h-4 w-4" />
          {file || existingFileName ? 'Replace file' : 'Choose file'}
        </Button>

        <span className={cn('text-size-4', file ? 'text-foreground' : 'text-muted-foreground')}>
          {file?.name ?? existingFileName ?? 'No file selected'}
        </span>

        {status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {status === 'success' && <CheckCircle2 className="h-4 w-4 text-success" />}
        {status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
      </div>

      {status === 'error' && errorMessage && <p className="mt-1 text-size-5 text-destructive">{errorMessage}</p>}
    </div>
  )
}
