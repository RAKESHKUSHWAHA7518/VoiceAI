import { v2 as cloudinary } from 'cloudinary';
import config from '../config';

export function cloudinaryReady() {
  return Object.values(config.cloudinary).every(value => !!value.trim());
}
function client() {
  if (!cloudinaryReady()) throw new Error('Cloudinary is not configured');
  cloudinary.config({ cloud_name: config.cloudinary.cloudName, api_key: config.cloudinary.apiKey, api_secret: config.cloudinary.apiSecret, secure: true });
  return cloudinary;
}
export async function uploadMedia(bytes: Buffer, publicId: string, kind: 'audio' | 'image') {
  const result = await new Promise<any>((resolve, reject) => {
    client().uploader.upload_stream({ public_id: publicId, resource_type: kind === 'audio' ? 'video' : 'image', type: 'authenticated', overwrite: false, timeout: 30000 }, (error, value) => error ? reject(new Error('Cloudinary upload failed')) : resolve(value)).end(bytes);
  });
  return { public_id: String(result.public_id), format: String(result.format), bytes: Number(result.bytes), duration: Number(result.duration || 0), resource_type: kind === 'audio' ? 'video' as const : 'image' as const };
}
export function mediaDownload(publicId: string, format: string) {
  return client().utils.private_download_url(publicId, format, { resource_type: 'video', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 60, attachment: false });
}
export async function deleteMedia(publicId: string, resourceType: 'video' | 'image' = 'video') {
  const result = await client().uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated', invalidate: true });
  if (!['ok', 'not found'].includes(result.result)) throw new Error('Cloudinary deletion failed');
}
