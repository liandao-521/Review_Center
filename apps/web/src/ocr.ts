let workerPromise: Promise<any> | null = null;

export async function recognizeChinese(canvas: HTMLCanvasElement, onProgress: (message: string) => void) {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('chi_sim+eng', 1, {
      logger: (message) => {
        if (message.status === 'recognizing text') onProgress(`正在识别 ${Math.round(message.progress * 100)}%`);
        else if (message.status === 'loading language traineddata') onProgress('首次使用：下载中文识别数据…');
        else if (message.status) onProgress('正在准备中文识别…');
      },
    })).catch((error) => { workerPromise = null; throw error; });
  }
  const worker = await workerPromise;
  const result = await worker.recognize(canvas);
  return String(result.data.text ?? '').trim();
}

export async function terminateOcr() {
  const current = workerPromise;
  workerPromise = null;
  if (current) await current.then((worker) => worker.terminate()).catch(() => undefined);
}
