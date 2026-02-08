const trackedUrls = new Set<string>();

export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  return new Blob([byteArray], { type: mimeType });
};

export const createObjectUrl = (blob: Blob): string => {
  const url = URL.createObjectURL(blob);
  trackedUrls.add(url);
  return url;
};

export const revokeObjectUrl = (url: string): void => {
  URL.revokeObjectURL(url);
  trackedUrls.delete(url);
};

export const revokeAllObjectUrls = (): void => {
  trackedUrls.forEach((url) => URL.revokeObjectURL(url));
  trackedUrls.clear();
};

export const generateThumbnail = async (
  blob: Blob,
  maxSize = 400
): Promise<Blob> => {
  const imgUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = imgUrl;
    });

    const { width, height } = img;
    const scale = Math.min(maxSize / width, maxSize / height, 1);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        0.8
      );
    });
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
