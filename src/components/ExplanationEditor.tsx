import { useRef, useState, type ChangeEvent } from 'react'
import { AlertTriangle, ChevronDown, ImagePlus, Lightbulb, Link2, Loader2, X } from 'lucide-react'
import { ImageImportError, imageFileToDataUrl } from '../lib/image'

interface ExplanationEditorProps {
  text: string
  image: string // '' = pas d'image ; sinon URL http(s) ou data URL
  onChange: (patch: { explanationText?: string; explanationImage?: string }) => void
}

export default function ExplanationEditor({ text, image, onChange }: ExplanationEditorProps) {
  const [open, setOpen] = useState(() => text !== '' || image !== '')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDataImage = image.startsWith('data:')
  const hasContent = text.trim() !== '' || image !== ''

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de réimporter le même fichier
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      const dataUrl = await imageFileToDataUrl(file)
      setPreviewError(false)
      onChange({ explanationImage: dataUrl })
    } catch (err) {
      setImportError(err instanceof ImageImportError ? err.message : "L'image n'a pas pu être importée.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-bold text-amber-900"
      >
        <Lightbulb className="h-5 w-5 text-amber-500" />
        <span className="flex-1">Explication après réponse (optionnel)</span>
        {hasContent && !open && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">Ajoutée</span>
        )}
        <ChevronDown className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          <textarea
            value={text}
            onChange={(e) => onChange({ explanationText: e.target.value })}
            maxLength={2000}
            rows={3}
            placeholder="Texte affiché à l'écran après la révélation de la bonne réponse, pour débriefer…"
            aria-label="Texte explicatif"
            className="w-full resize-y rounded-xl border-2 border-amber-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:outline-none"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-amber-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {importing ? 'Préparation…' : 'Importer une image'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleFile(e)}
              data-testid="explanation-file"
            />
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border-2 border-amber-200 bg-white px-3 focus-within:border-amber-400">
              <Link2 className="h-5 w-5 shrink-0 text-amber-500" />
              <input
                type="url"
                value={isDataImage ? '' : image}
                onChange={(e) => {
                  setPreviewError(false)
                  setImportError(null)
                  onChange({ explanationImage: e.target.value.trim() })
                }}
                placeholder={isDataImage ? 'Image importée (coller une URL pour la remplacer)' : "…ou colle l'URL d'une image"}
                aria-label="URL de l'image explicative"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
            </label>
          </div>

          {importError && (
            <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <AlertTriangle className="h-4 w-4" /> {importError}
            </p>
          )}

          {image && (
            <div className="relative inline-block">
              {previewError ? (
                <p className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-red-700">
                  <AlertTriangle className="h-4 w-4" /> Impossible d'afficher cette image (lien invalide ?)
                </p>
              ) : (
                <img
                  src={image}
                  alt="Aperçu de l'image explicative"
                  onError={() => setPreviewError(true)}
                  className="max-h-48 rounded-xl border border-amber-200 bg-white object-contain"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setPreviewError(false)
                  onChange({ explanationImage: '' })
                }}
                title="Retirer l'image"
                aria-label="Retirer l'image"
                className="absolute -right-2 -top-2 rounded-full bg-gray-900 p-1 text-white shadow hover:bg-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
