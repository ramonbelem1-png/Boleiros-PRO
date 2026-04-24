
/**
 * Redimensiona e comprime uma imagem antes do upload.
 * @param file O arquivo original do usuário
 * @param maxWidth Largura máxima desejada
 * @param quality Qualidade do JPEG (0 a 1)
 */
/**
 * Gera a imagem recortada baseada nas coordenadas do componente de crop.
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Não foi possível obter o contexto do canvas');

  // Definimos o tamanho do avatar recortado final (sempre quadrado)
  const targetSize = 250;
  canvas.width = targetSize;
  canvas.height = targetSize;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetSize,
    targetSize
  );

  // Retorna como JPEG comprimido
  return canvas.toDataURL('image/jpeg', 0.6);
}

/**
 * Redimensiona e comprime uma imagem para o formato Base64 (Data URL).
 */
export async function compressImageToBase64(file: File, maxWidth = 200, quality = 0.5): Promise<string> {
  // Mantida para compatibilidade se necessário, mas getCroppedImg já faz o trabalho no novo fluxo
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout na compressão')), 10000);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timeout);
          return reject(new Error('Falha no Canvas'));
        }
        
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        clearTimeout(timeout);
        console.log(`[compressImage] Concluído. Texto gerado (${(dataUrl.length / 1024).toFixed(1)} KB)`);
        resolve(dataUrl);
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Erro ao carregar imagem'));
      };
    };
    reader.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Erro ao ler arquivo'));
    };
  });
}
