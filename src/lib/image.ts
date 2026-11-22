// Préparation des images importées depuis l'ordinateur : redimensionnement et compression
// dans le navigateur (aucun serveur), puis encodage en data URL pour être stockée en base.

const MAX_DIMENSION = 1280 // px, côté le plus long
const MAX_DATA_URL_LENGTH = 450_000 // ~330 Ko d'image une fois décodée
const MAX_INPUT_BYTES = 20 * 1024 * 1024 // refuse les fichiers source > 20 Mo

export class ImageImportError extends Error {}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new ImageImportError("Ce fichier n'est pas une image lisible.")
  } finally {
    URL.revokeObjectURL(url)
  }
}

function render(img: HTMLImageElement, scale: number, quality: number): string {
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageImportError('Le navigateur ne permet pas de traiter cette image.')
  // Fond blanc : les zones transparentes (PNG) ne deviennent pas noires en JPEG
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Redimensionne (1280 px max) et compresse une image en JPEG jusqu'à ce qu'elle soit
 * assez légère pour la base. Renvoie une data URL "data:image/jpeg;base64,...".
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new ImageImportError('Choisis un fichier image (JPG, PNG, WebP, GIF…).')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageImportError('Image trop lourde (20 Mo maximum).')
  }

  const img = await loadImage(file)
  let scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))

  // On baisse d'abord la qualité, puis la taille, jusqu'à passer sous la limite
  for (let attempt = 0; attempt < 8; attempt++) {
    for (const quality of [0.85, 0.75, 0.65]) {
      const dataUrl = render(img, scale, quality)
      if (dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl
    }
    scale *= 0.75
  }
  throw new ImageImportError("Impossible de réduire suffisamment cette image.")
}

// Vrai pour une image utilisable : URL http(s) ou image encodée
export function isValidImageSource(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value) || /^data:image\/(png|jpeg|webp|gif);base64,/.test(value)
}
