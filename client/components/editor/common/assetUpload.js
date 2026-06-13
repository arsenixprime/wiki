import _ from 'lodash'
import Cookies from 'js-cookie'

/**
 * Build a safe asset filename for an image file pasted or dropped into an editor.
 *
 * Browsers name all clipboard images "image.png" and the server overwrites
 * assets uploaded with an existing name, so pasted images get a unique
 * generated name. Dropped files keep their original name, transformed the
 * same way the server sanitizes it so the inserted link matches the final
 * asset path.
 */
export function makeAssetFilename (file, isPasted) {
  const filename = file.name || 'image.png'
  if (isPasted || /^(image|unknown)\.[a-z]+$/.test(filename)) {
    const extMap = { jpeg: 'jpg', 'svg+xml': 'svg' }
    const extRaw = _.last(file.type.split('/'))
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').substring(0, 15)
    return `pasted_${ts}_${Math.random().toString(36).substring(2, 6)}.${extMap[extRaw] || extRaw}`
  }
  return filename.toLowerCase().replace(/[\s,;#]+/g, '_').replace(/[/?<>\\:*|"]/g, '')
}

/**
 * Upload an image file to the root assets folder under the given filename.
 * Returns the absolute path of the uploaded asset.
 */
export async function uploadAssetImage (file, filename) {
  const formData = new FormData()
  formData.append('mediaUpload', JSON.stringify({ folderId: 0 }))
  formData.append('mediaUpload', file, filename)
  const resp = await fetch('/u', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Cookies.get('jwt')}`
    },
    body: formData
  })
  if (!resp.ok) {
    let errMsg = `Error ${resp.status}`
    try {
      errMsg = (await resp.json()).message
    } catch (err) {}
    throw new Error(errMsg)
  }
  return `/${filename}`
}
