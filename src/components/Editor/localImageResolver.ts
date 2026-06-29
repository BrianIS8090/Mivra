import { localImagePathToDataUrl } from '../../utils/localImages';
import { resolveImageSrc, resolveLocalImagePath } from '../../utils/paths';

const RESOLVED_FROM_ATTR = 'data-mivra-resolved-from';
const LOCAL_PATH_ATTR = 'data-mivra-local-path';
const ERROR_FALLBACK_BOUND_ATTR = 'data-mivra-error-fallback-bound';
const ERROR_FALLBACK_USED_ATTR = 'data-mivra-error-fallback-used';
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export type LocalImageResolverOptions = {
  loadLocalImageDataUrl?: (path: string) => Promise<string>;
};

function shouldResolveImageSrc(src: string): boolean {
  if (!src) return false;
  if (src.startsWith('#')) return false;
  if (src.startsWith('//')) return false;
  return !URL_SCHEME_RE.test(src);
}

function bindErrorFallback(
  img: HTMLImageElement,
  loadLocalImageDataUrl: (path: string) => Promise<string>,
): void {
  if (img.getAttribute(ERROR_FALLBACK_BOUND_ATTR) === 'true') return;
  img.setAttribute(ERROR_FALLBACK_BOUND_ATTR, 'true');

  img.addEventListener('error', () => {
    const localPath = img.getAttribute(LOCAL_PATH_ATTR);
    if (!localPath) return;
    if (img.getAttribute(ERROR_FALLBACK_USED_ATTR) === 'true') return;

    img.setAttribute(ERROR_FALLBACK_USED_ATTR, 'true');
    void loadLocalImageDataUrl(localPath)
      .then((dataUrl) => {
        img.setAttribute('src', dataUrl);
      })
      .catch((e) => {
        console.warn('[localImageResolver] не удалось прочитать локальную картинку', e);
      });
  });
}

async function resolveImageElement(
  img: HTMLImageElement,
  baseDir: string,
  loadLocalImageDataUrl: (path: string) => Promise<string>,
): Promise<void> {
  const rawSrc = img.getAttribute('src') ?? '';
  if (!shouldResolveImageSrc(rawSrc)) return;
  if (img.getAttribute(RESOLVED_FROM_ATTR) === rawSrc) return;

  bindErrorFallback(img, loadLocalImageDataUrl);
  const localPath = await resolveLocalImagePath(rawSrc, baseDir);
  const nextSrc = await resolveImageSrc(rawSrc, baseDir);
  if ((img.getAttribute('src') ?? '') !== rawSrc) return;

  img.setAttribute(RESOLVED_FROM_ATTR, rawSrc);
  img.setAttribute(LOCAL_PATH_ATTR, localPath);
  img.setAttribute('src', nextSrc);
}

function scanImages(
  root: ParentNode,
  baseDir: string,
  loadLocalImageDataUrl: (path: string) => Promise<string>,
): void {
  root.querySelectorAll('img[src]').forEach((img) => {
    void resolveImageElement(img as HTMLImageElement, baseDir, loadLocalImageDataUrl);
  });
}

export function installLocalImageResolver(
  root: HTMLElement,
  baseDir: string | null,
  options: LocalImageResolverOptions = {},
): () => void {
  if (!baseDir) return () => {};

  const loadLocalImageDataUrl = options.loadLocalImageDataUrl ?? localImagePathToDataUrl;
  scanImages(root, baseDir, loadLocalImageDataUrl);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
        void resolveImageElement(mutation.target, baseDir, loadLocalImageDataUrl);
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node instanceof HTMLImageElement) {
          void resolveImageElement(node, baseDir, loadLocalImageDataUrl);
        } else {
          scanImages(node, baseDir, loadLocalImageDataUrl);
        }
      }
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src'],
  });

  return () => observer.disconnect();
}
