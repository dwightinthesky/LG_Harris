import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  Eye,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  LogOut,
  PackagePlus,
  Pencil,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';

const PREVIEW_LIMIT = 12;
const POLL_INTERVAL_MS = 15000;
const HIDDEN_POLL_INTERVAL_MS = 60000;
const MAX_POLL_BACKOFF_MS = 120000;
const SESSION_QUERY_KEY = 'session';
const DEFAULT_SHARED_SESSION_ID = '979ac24e-e051-4ab5-9771-6bd8e7381c47';
const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,}$/;
const CATALOGUE_FOOTER_REFERENCE_NOTE =
  '* Prices are for customer reference and remain subject to stock and approval.';
const CATALOGUE_FOOTER_MINIMUM_NOTE =
  'Minimum order: 2 cases to be eligible for the quoted price.';
const CATALOGUE_FOOTER_EXCLUSIONS =
  'Excludes: Stax, Decco, Fortis, H&B, IBC, IBMG, NBG, Trago Mills, Home Hardware.';
const TILTED_IMAGE_CODES = new Set(['101064202', '3854201-50']);
const STOCK_IMAGE_BY_CODE = Object.freeze({
  '101064201': '/catalogue-images/101064201.webp',
  '101064202': '/catalogue-images/101064202.webp',
  SH102: '/catalogue-images/SH102.webp',
  '102064200': '/catalogue-images/102064200.webp',
  '102064201': '/catalogue-images/102064201.webp',
  SH400: '/catalogue-images/SH400.webp',
  '24968-001': '/catalogue-images/24968-001.webp',
  '3854201-50': '/catalogue-images/3854201-50.webp',
  '102064203': '/catalogue-images/102064203.webp',
  '44967-003': '/catalogue-images/44967-003.webp',
  '400340': '/catalogue-images/400340.webp',
  '44968-003': '/catalogue-images/44968-003.webp',
});
const EMPTY_PRODUCT = Object.freeze({
  brand: '',
  code: '',
  desc: '',
  deal: '',
  list: '',
  image: '',
});

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
});

function createId() {
  return `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isValidSessionId(sessionId) {
  return SESSION_ID_PATTERN.test(sessionId ?? '');
}

function normalizeProductCode(code) {
  return String(code ?? '').trim().toUpperCase();
}

function getStockImageForCode(code) {
  return STOCK_IMAGE_BY_CODE[normalizeProductCode(code)] ?? '';
}

function shouldTiltProductImage(code) {
  return TILTED_IMAGE_CODES.has(normalizeProductCode(code));
}

function buildProduct(product, fallbackId = createId()) {
  const code = product.code?.trim() ?? '';
  const sourceImage = typeof product.image === 'string' ? product.image : '';
  const stockImage = getStockImageForCode(code);
  const image = stockImage || sourceImage;

  return {
    id: product.id ?? fallbackId,
    brand: product.brand?.trim() ?? '',
    code,
    desc: product.desc?.trim() ?? '',
    deal: product.deal?.trim() ?? '',
    list: product.list?.trim() ?? '',
    image,
  };
}

const DEFAULT_PRODUCTS = [
  { brand: 'Harris', code: '101064201', desc: 'Essentials Dust Sheet 3.7 x 2.75M', deal: '£0.30', list: '£0.91', image: '' },
  { brand: 'Harris', code: '101064202', desc: 'Essentials Dust Sheet on a Roll', deal: '£2.75', list: '£7.85', image: '' },
  { brand: 'Lynwood', code: 'SH102', desc: '12 x 9 Polythene Dust Sheet', deal: '£0.25', list: '', image: '' },
  { brand: 'Harris', code: '102064200', desc: 'Seriously Good Cotton Rich Dust Sheet', deal: '£3.85', list: '£14.91', image: '' },
  { brand: 'Harris', code: '102064201', desc: 'Seriously Good Cotton Rich Staircase Dust Sheet', deal: '£3.42', list: '£10.09', image: '' },
  { brand: 'Lynwood', code: 'SH400', desc: '3.2 x 3.2 Non Woven Dust Sheet', deal: '£1.41', list: '', image: '' },
  { brand: 'Hamilton', code: '24968-001', desc: 'Prestige Poly Cotton Dust Sheet 12x9 100% Cotton', deal: '£4.55', list: '£12.45', image: '' },
  { brand: 'FTT', code: '3854201-50', desc: 'FTT Dust Sheet on a Roll', deal: '£2.39', list: '£6.28', image: '' },
  { brand: 'Harris', code: '102064203', desc: 'Seriously Good Tarp 12x9 (60gsm)', deal: '£1.92', list: '£5.61', image: '' },
  { brand: 'Hamilton', code: '44967-003', desc: '5 PK Cotton Twill Dust Sheet 12x9 1.2KG', deal: '£16.00', list: '£52.28', image: '' },
  { brand: 'Costco', code: '400340', desc: 'Harris Dust Sheet 3pk Baled 12x9 Poly Back', deal: '£11.00', list: '£34.53', image: '' },
  { brand: 'Hamilton', code: '44968-003', desc: "Cotton Twill Dust Sheet 12' x 9'", deal: '£3.30', list: '£10.64', image: '' },
].map((product, index) => buildProduct(product, `seed-${index + 1}`));

function cloneDefaultProducts() {
  return DEFAULT_PRODUCTS.map((product) => ({ ...product }));
}

function createEmptyProduct() {
  return { ...EMPTY_PRODUCT };
}

function normalizePrice(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return /^[0-9]/.test(trimmed) ? `£${trimmed}` : trimmed;
}

function isDataUrlImage(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function parseCurrency(value) {
  if (!value) {
    return null;
  }

  const numericValue = Number.parseFloat(String(value).replace(/[^0-9.]+/g, ''));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getSavings(product) {
  const listPrice = parseCurrency(product.list);
  const dealPrice = parseCurrency(product.deal);

  if (listPrice === null || dealPrice === null || listPrice <= dealPrice) {
    return null;
  }

  const amount = listPrice - dealPrice;
  const percent = Math.round((amount / listPrice) * 100);

  return { amount, percent };
}

function getHashRoute() {
  if (typeof window === 'undefined') {
    return '/';
  }

  const hash = window.location.hash.replace(/^#/, '');
  const [route = '/'] = hash.split('?');
  return route || '/';
}

function getSessionIdFromUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  return new URL(window.location.href).searchParams.get(SESSION_QUERY_KEY) ?? '';
}

function buildMobileUploadUrl(sessionId) {
  if (typeof window === 'undefined' || !sessionId) {
    return '';
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(SESSION_QUERY_KEY, sessionId);
  nextUrl.hash = '/upload';
  return nextUrl.toString();
}

function syncSessionQueryParam(sessionId) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextUrl = new URL(window.location.href);
  if (sessionId) {
    nextUrl.searchParams.set(SESSION_QUERY_KEY, sessionId);
  } else {
    nextUrl.searchParams.delete(SESSION_QUERY_KEY);
  }
  window.history.replaceState({}, '', nextUrl.toString());
}

function formatUpdatedAt(value) {
  if (!value) {
    return 'No updates yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No updates yet';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function isPageVisible() {
  if (typeof document === 'undefined') {
    return true;
  }

  return document.visibilityState === 'visible';
}

function getProductsSnapshot(products) {
  return JSON.stringify(
    products.map((product) => ({
      id: product.id,
      brand: product.brand,
      code: product.code,
      desc: product.desc,
      deal: product.deal,
      list: product.list,
      image: product.image,
    })),
  );
}

function normalizeProducts(products) {
  return Array.isArray(products)
    ? products.map((product, index) => buildProduct(product, `server-${index + 1}`))
    : [];
}

async function requestJson(url, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let payload = null;
  const contentType = response.headers.get('content-type') ?? '';

  if (response.status !== 204) {
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }
  }

  if (!response.ok) {
    const error = new Error(
      typeof payload === 'string' ? payload : payload?.error ?? 'Request failed',
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function fetchCatalogSession(sessionId) {
  return requestJson(`/api/catalog-session?session=${encodeURIComponent(sessionId)}`);
}

async function saveCatalogSession(sessionId, products) {
  return requestJson('/api/catalog-session', {
    method: 'PUT',
    body: JSON.stringify({ sessionId, products }),
  });
}

async function uploadCatalogImage(sessionId, productId, imageDataUrl, fileName) {
  return requestJson('/api/catalog-upload', {
    method: 'POST',
    body: JSON.stringify({ sessionId, productId, imageDataUrl, fileName }),
  });
}

async function fetchAuthSession() {
  return requestJson('/api/auth-session');
}

async function loginAuthSession(username, password) {
  return requestJson('/api/auth-session', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

async function logoutAuthSession() {
  return requestJson('/api/auth-session', {
    method: 'DELETE',
  });
}

async function fetchPublicCatalogues() {
  return requestJson('/api/catalog-public');
}

async function saveCatalogSettings(sessionId, { catalogName, isShared }) {
  return requestJson('/api/catalog-settings', {
    method: 'PUT',
    body: JSON.stringify({
      sessionId,
      catalogName,
      isShared,
    }),
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That image could not be processed.'));
    image.src = src;
  });
}

async function compressImageFile(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  const scale = Math.min(1, maxEdge / longestEdge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser cannot prepare image uploads.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

async function convertBlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('That image could not be prepared.'));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(imageUrl) {
  if (!imageUrl) {
    return '';
  }

  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  const response = await fetch(imageUrl, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Could not load image (${response.status})`);
  }

  const blob = await response.blob();
  return convertBlobToDataUrl(blob);
}

async function inlinePosterImagesForCapture(posterNode) {
  const images = Array.from(posterNode.querySelectorAll('img'));
  const originalSources = new Map();

  await Promise.all(
    images.map(async (image) => {
      const sourceUrl = image.currentSrc || image.src || '';
      if (!sourceUrl || sourceUrl.startsWith('data:')) {
        return;
      }

      const originalSrcset = image.getAttribute('srcset');
      originalSources.set(image, {
        src: image.src,
        srcset: originalSrcset,
      });

      try {
        const dataUrl = await fetchImageAsDataUrl(sourceUrl);
        if (originalSrcset !== null) {
          image.removeAttribute('srcset');
        }
        image.src = dataUrl;
      } catch (error) {
        console.warn('Inline image conversion failed, using original URL', sourceUrl, error);
      }
    }),
  );

  await waitForElementImages(posterNode);

  return () => {
    for (const [image, original] of originalSources.entries()) {
      image.src = original.src;
      if (original.srcset === null || original.srcset === undefined) {
        image.removeAttribute('srcset');
      } else {
        image.setAttribute('srcset', original.srcset);
      }
    }
  };
}

function getCanvasDetailScore(canvas) {
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) {
    return 0;
  }

  const sampleWidth = Math.max(32, Math.min(160, canvas.width));
  const sampleHeight = Math.max(32, Math.min(160, canvas.height));
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;

  const sampleContext = sampleCanvas.getContext('2d');
  if (!sampleContext) {
    return 0;
  }

  sampleContext.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
  const { data } = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
  const luminance = new Float32Array(sampleWidth * sampleHeight);

  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3] / 255;
    const lum = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * alpha;
    const pixelIndex = index / 4;
    luminance[pixelIndex] = lum;
    total += lum;
  }

  const pixelCount = sampleWidth * sampleHeight;
  const mean = total / pixelCount;
  let variance = 0;
  let edgeEnergy = 0;

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const idx = y * sampleWidth + x;
      const value = luminance[idx];
      const delta = value - mean;
      variance += delta * delta;

      if (x > 0) {
        edgeEnergy += Math.abs(value - luminance[idx - 1]);
      }
      if (y > 0) {
        edgeEnergy += Math.abs(value - luminance[idx - sampleWidth]);
      }
    }
  }

  return variance / pixelCount + edgeEnergy / pixelCount;
}

function sampleBackgroundColour(data, width, height) {
  const border = Math.max(2, Math.floor(Math.min(width, height) * 0.04));
  const step = Math.max(1, Math.floor(Math.min(width, height) / 120));
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  const includePixel = (x, y) => {
    const index = (y * width + x) * 4;
    const alpha = data[index + 3];
    if (alpha < 40) {
      return;
    }
    red += data[index];
    green += data[index + 1];
    blue += data[index + 2];
    count += 1;
  };

  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < border; y += 1) {
      includePixel(x, y);
      includePixel(x, height - 1 - y);
    }
  }

  for (let y = border; y < height - border; y += step) {
    for (let x = 0; x < border; x += 1) {
      includePixel(x, y);
      includePixel(width - 1 - x, y);
    }
  }

  if (!count) {
    return { red: 245, green: 245, blue: 245 };
  }

  return {
    red: red / count,
    green: green / count,
    blue: blue / count,
  };
}

async function removeBackgroundFromDataUrl(sourceDataUrl, { maxEdge = 1600 } = {}) {
  const image = await loadImage(sourceDataUrl);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  const scale = Math.min(1, maxEdge / longestEdge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser cannot prepare image uploads.');
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const background = sampleBackgroundColour(data, width, height);

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) {
      continue;
    }

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = (red + green + blue) / 3;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    const distance = Math.hypot(
      red - background.red,
      green - background.green,
      blue - background.blue,
    );

    let nextAlpha = alpha;
    if (distance < 34 || (brightness > 244 && saturation < 18)) {
      nextAlpha = 0;
    } else if (distance < 60 || (brightness > 226 && saturation < 30)) {
      const distanceFactor = Math.max(0, Math.min(1, (distance - 34) / 26));
      const brightnessFactor = Math.max(0, Math.min(1, (244 - brightness) / 18));
      nextAlpha = Math.round(alpha * Math.max(distanceFactor, brightnessFactor));
    }

    data[index + 3] = nextAlpha;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

async function removeBackgroundFromImageSource(imageSource) {
  if (!imageSource) {
    throw new Error('No image source was provided.');
  }

  if (imageSource.startsWith('data:')) {
    return removeBackgroundFromDataUrl(imageSource);
  }

  const response = await fetch(imageSource, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('A stored image could not be loaded for background removal.');
  }

  const blob = await response.blob();
  const sourceDataUrl = await convertBlobToDataUrl(blob);
  return removeBackgroundFromDataUrl(sourceDataUrl);
}

async function prepareUploadedImage(file, { removeBackground = false } = {}) {
  if (removeBackground) {
    const sourceDataUrl = await readFileAsDataUrl(file);
    return removeBackgroundFromDataUrl(sourceDataUrl);
  }

  return compressImageFile(file);
}

async function waitForElementImages(element) {
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map((image) => {
      if (image.complete) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const done = () => resolve();
        image.addEventListener('load', done, { once: true });
        image.addEventListener('error', done, { once: true });
      });
    }),
  );
}

function StatCard({ label, value, hint, tone = 'default' }) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      <span className="stat-card__hint">{hint}</span>
    </article>
  );
}

function ProductRow({ product, isEditing, onEdit, onRemove }) {
  const savings = getSavings(product);

  return (
    <tr className={isEditing ? 'row-is-editing' : ''}>
      <td>
        {product.image ? (
          <img className="thumbnail" src={product.image} alt={product.desc} />
        ) : (
          <div className="thumbnail thumbnail--empty" aria-hidden="true">
            <ImageIcon size={16} />
          </div>
        )}
      </td>
      <td>
        <div className="row-brand">{product.brand}</div>
        {savings ? <div className="row-subtle">{savings.percent}% below list</div> : null}
      </td>
      <td className="row-mono">{product.code}</td>
      <td>{product.desc}</td>
      <td>
        <div className="row-price">{product.deal}</div>
        {product.list ? <div className="row-subtle">List {product.list}</div> : null}
      </td>
      <td>
        <div className="row-actions">
          <button
            type="button"
            className={`icon-button ${isEditing ? 'is-active' : ''}`}
            aria-label={`Edit ${product.desc}`}
            title={`Edit ${product.desc}`}
            onClick={() => onEdit(product.id)}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${product.desc}`}
            title={`Remove ${product.desc}`}
            onClick={() => onRemove(product.id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function PosterCard({ product }) {
  const savings = getSavings(product);
  const imageClassName = shouldTiltProductImage(product.code)
    ? 'poster-card__image poster-card__image--tilted'
    : 'poster-card__image';

  return (
    <article className="poster-card">
      <div className="poster-card__media">
        {product.image ? (
          <img className={imageClassName} src={product.image} alt={product.desc} />
        ) : (
          <div className="poster-card__placeholder" aria-hidden="true">
            <ImageIcon size={24} />
            <span>Image pending</span>
          </div>
        )}
        {savings ? <span className="poster-card__badge">Save {savings.percent}%</span> : null}
      </div>

      <div className="poster-card__body">
        <div className="poster-card__meta">
          <span className="poster-card__brand">{product.brand}</span>
        </div>

        <h3 className="poster-card__description">{product.desc}</h3>

        <div className="poster-card__pricing">
          <div>
            <span className="poster-card__label">Deal price</span>
            <strong className="poster-card__price">{product.deal}</strong>
          </div>

          {product.list ? (
            <div className="poster-card__list">
              <span className="poster-card__label">List price</span>
              <span>{product.list}</span>
            </div>
          ) : null}
        </div>

        {product.code ? <p className="poster-card__ref">Ref: {product.code}</p> : null}
      </div>
    </article>
  );
}

function CatalogPoster({
  products,
  mode = 'preview',
  posterRef = null,
  catalogName = '',
  className = '',
}) {
  const isExportMode = mode === 'export';
  const headerKicker = catalogName?.trim() || 'LG Harris customer catalogue';

  return (
    <div
      ref={posterRef}
      className={`poster-canvas ${isExportMode ? 'poster-canvas--export' : ''} ${className}`.trim()}
    >
      <header className="poster-header">
        <span className="poster-kicker">{headerKicker}</span>
        <h2 className="poster-title">Premium Dust Sheets and Tarpaulins</h2>
        <p className="poster-subtitle">
          Prepared by LG Harris for customer reference and sales conversations
        </p>
        <div className="poster-chip">
          <span>Current trade prices across trusted brands</span>
          <span aria-hidden="true">•</span>
          <span>{CATALOGUE_FOOTER_MINIMUM_NOTE}</span>
        </div>
      </header>

      <section
        className={`poster-products ${
          products.length === 0 ? 'poster-products--empty' : ''
        } ${isExportMode ? 'poster-products--export' : ''}`}
      >
        {products.length ? (
          products.map((product) => <PosterCard key={product.id} product={product} />)
        ) : (
          <div className="poster-empty">
            Add products from the manage view to generate the catalogue.
          </div>
        )}
      </section>

      <footer className="poster-footer">
        <p>{CATALOGUE_FOOTER_REFERENCE_NOTE}</p>
        <p>{CATALOGUE_FOOTER_EXCLUSIONS}</p>
      </footer>
    </div>
  );
}

function MobileUploadPanel({ sessionId, uploadUrl, onCopy, copied }) {
  return (
    <section className="qr-panel">
      <div className="section-heading section-heading--compact">
        <span className="eyebrow">Mobile image upload</span>
        <h2>Scan once, upload from mobile.</h2>
        <p>
          Staff can scan this QR code, open the live catalogue session on a mobile, and upload
          product imagery straight into the current page.
        </p>
      </div>

      <div className="qr-panel__content">
        <div className="qr-panel__code">
          {uploadUrl ? (
            <QRCodeSVG
              value={uploadUrl}
              size={176}
              includeMargin
              bgColor="#fffaf1"
              fgColor="#221d1a"
            />
          ) : (
            <div className="qr-panel__placeholder">
              <QrCode size={28} />
              <span>Generating QR code...</span>
            </div>
          )}
        </div>

        <div className="qr-panel__meta">
          <div className="qr-panel__status">
            <Smartphone size={18} />
            <span>Mobile upload page</span>
          </div>

          <p>
            This catalogue is backed by a shared cloud session rather than browser storage. Any
            mobile upload goes into the same session and syncs back into the desktop page.
          </p>

          <div className="session-chip">
            <Cloud size={16} />
            <span>Session {sessionId.slice(0, 8)}</span>
          </div>

          <div className="qr-panel__actions">
            <button type="button" className="button button--secondary" onClick={onCopy}>
              <Copy size={18} />
              {copied ? 'Link copied' : 'Copy mobile link'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileUploadView({ sessionId }) {
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [removeBackgroundOnUpload, setRemoveBackgroundOnUpload] = useState(true);
  const [statusMessage, setStatusMessage] = useState(
    'Scan the desktop QR code, choose a product, then take a photo or upload one from your mobile.',
  );
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadSession() {
      if (!sessionId) {
        setErrorMessage('This QR code is missing a catalogue session.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage('');

      try {
        const session = await fetchCatalogSession(sessionId);
        if (!isActive) {
          return;
        }

        const nextProducts = normalizeProducts(session.products);
        setProducts(nextProducts);
        setSelectedProductId((current) =>
          current && nextProducts.some((product) => product.id === current)
            ? current
            : nextProducts[0]?.id ?? '',
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error.status === 404
            ? 'This catalogue session no longer exists. Ask the desktop user to refresh the QR code.'
            : error.message,
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      isActive = false;
    };
  }, [sessionId]);

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;

  async function handleMobileUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !selectedProductId) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Only image files can be uploaded.');
      event.target.value = '';
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setStatusMessage(
      removeBackgroundOnUpload ? 'Removing background and preparing image...' : 'Preparing image...',
    );

    try {
      const processedDataUrl = await prepareUploadedImage(file, {
        removeBackground: removeBackgroundOnUpload,
      });
      setStatusMessage('Uploading image to the catalogue...');

      const response = await uploadCatalogImage(
        sessionId,
        selectedProductId,
        processedDataUrl,
        file.name,
      );

      setProducts((current) =>
        current.map((product) =>
          product.id === response.product.id ? buildProduct(response.product, product.id) : product,
        ),
      );
      setStatusMessage(
        `Image uploaded for ${response.product.code}. The desktop catalogue will update automatically.`,
      );
    } catch (error) {
      setErrorMessage(error.message);
      setStatusMessage('Upload failed. Try a smaller image or a stronger mobile connection.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  }

  return (
    <div className="mobile-upload-shell">
      <div className="mobile-upload-card">
        <div className="mobile-upload-header">
          <div className="brand-lockup">
            <div className="brand-badge">
              <LayoutTemplate size={22} />
            </div>
            <div>
              <p className="brand-kicker">LG Harris staff upload</p>
              <h1 className="brand-title mobile-brand-title">Catalogue Image Uploader</h1>
            </div>
          </div>

          <div className="session-chip session-chip--mobile">
            <Cloud size={16} />
            <span>Session {sessionId ? sessionId.slice(0, 8) : 'missing'}</span>
          </div>
        </div>

        <p className="mobile-upload-copy">
          Use this page to add or replace product imagery in the live customer catalogue.
        </p>

        {errorMessage ? <div className="warning-banner mobile-banner">{errorMessage}</div> : null}

        {isLoading ? (
          <div className="mobile-loading">
            <Loader2 className="spin" size={20} />
            <span>Loading catalogue session...</span>
          </div>
        ) : (
          <>
            <div className="mobile-product-grid">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className={`mobile-product-tile ${
                    product.id === selectedProductId ? 'is-active' : ''
                  }`}
                  onClick={() => setSelectedProductId(product.id)}
                >
                  <div className="mobile-product-tile__thumb">
                    {product.image ? (
                      <img src={product.image} alt={product.desc} />
                    ) : (
                      <div className="thumbnail thumbnail--empty mobile-thumb-empty" aria-hidden="true">
                        <ImageIcon size={16} />
                      </div>
                    )}
                  </div>
                  <div className="mobile-product-tile__text">
                    <strong>{product.code}</strong>
                    <span>{product.desc}</span>
                  </div>
                </button>
              ))}
            </div>

            {selectedProduct ? (
              <div className="mobile-selected-card">
                <div className="mobile-selected-card__meta">
                  <span className="eyebrow">Selected product</span>
                  <h2>{selectedProduct.code}</h2>
                  <p>{selectedProduct.desc}</p>
                </div>

                <label className="mobile-upload-cta">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleMobileUpload}
                    disabled={isUploading}
                  />
                  {isUploading ? <Loader2 className="spin" size={20} /> : <Camera size={20} />}
                  <span>{isUploading ? 'Uploading image...' : 'Take photo or choose image'}</span>
                </label>
                <label className="option-check option-check--compact">
                  <input
                    type="checkbox"
                    checked={removeBackgroundOnUpload}
                    onChange={(event) => setRemoveBackgroundOnUpload(event.target.checked)}
                    disabled={isUploading}
                  />
                  <span>Remove background before upload</span>
                </label>
              </div>
            ) : (
              <div className="subtle-banner mobile-banner">
                No products are available in this catalogue session yet.
              </div>
            )}
          </>
        )}

        <div className="mobile-status">
          <CheckCircle2 size={18} />
          <span>{statusMessage}</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const posterRef = useRef(null);
  const formPanelRef = useRef(null);
  const fileInputRef = useRef(null);
  const serverSnapshotRef = useRef(getProductsSnapshot(cloneDefaultProducts()));
  const localChangeAtRef = useRef(0);
  const isSavingRef = useRef(false);
  const pollFailureCountRef = useRef(0);
  const sessionBootstrapAllowedRef = useRef(false);

  const [route, setRoute] = useState(() => getHashRoute());
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    if (getHashRoute() === '/upload') {
      sessionBootstrapAllowedRef.current = false;
      const uploadSessionId = getSessionIdFromUrl();
      return isValidSessionId(uploadSessionId) ? uploadSessionId : DEFAULT_SHARED_SESSION_ID;
    }

    sessionBootstrapAllowedRef.current = false;
    const initialSessionId = getSessionIdFromUrl();
    return isValidSessionId(initialSessionId) ? initialSessionId : '';
  });
  const [products, setProducts] = useState(cloneDefaultProducts);
  const [draft, setDraft] = useState(createEmptyProduct);
  const [draftImageName, setDraftImageName] = useState('');
  const [editingProductId, setEditingProductId] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginDraft, setLoginDraft] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [isVisitorPreview, setIsVisitorPreview] = useState(false);
  const [sharedCatalogues, setSharedCatalogues] = useState([]);
  const [isLoadingSharedCatalogues, setIsLoadingSharedCatalogues] = useState(false);
  const [catalogName, setCatalogName] = useState('My catalogue');
  const [isSharedCatalog, setIsSharedCatalog] = useState(false);
  const [isSavingCatalogSettings, setIsSavingCatalogSettings] = useState(false);
  const [currentView, setCurrentView] = useState('manage');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isBatchRemovingBackground, setIsBatchRemovingBackground] = useState(false);
  const [removeBackgroundOnUpload, setRemoveBackgroundOnUpload] = useState(true);
  const [syncMessage, setSyncMessage] = useState('Connecting to shared catalogue workspace...');
  const [formMessage, setFormMessage] = useState(
    'Edits made here and uploads from mobile are saved to the same shared catalogue session.',
  );
  const [exportError, setExportError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [copiedUploadLink, setCopiedUploadLink] = useState(false);

  const isMobileUploadRoute = route === '/upload';
  const isStaffAuthenticated = Boolean(authUser);
  const isStaffWorkspace = isStaffAuthenticated && !isVisitorPreview;
  const isPublicVisitor = !isMobileUploadRoute && !isStaffWorkspace;
  const previewProducts = useMemo(() => products.slice(0, PREVIEW_LIMIT), [products]);
  const hiddenProducts = Math.max(products.length - PREVIEW_LIMIT, 0);
  const mobileUploadUrl = useMemo(() => buildMobileUploadUrl(sessionId), [sessionId]);
  const editingProduct = useMemo(
    () => products.find((product) => product.id === editingProductId) ?? null,
    [editingProductId, products],
  );
  const selectedPublicCatalogue = useMemo(
    () => sharedCatalogues.find((catalogue) => catalogue.sessionId === sessionId) ?? null,
    [sessionId, sharedCatalogues],
  );

  useEffect(() => {
    if (isMobileUploadRoute) {
      setIsAuthChecking(false);
      return;
    }

    let isActive = true;

    async function loadAuthSession() {
      setIsAuthChecking(true);
      setAuthError('');

      try {
        const authSession = await fetchAuthSession();
        if (!isActive) {
          return;
        }

        if (authSession?.authenticated && authSession.user) {
          setAuthUser(authSession.user);
          setIsVisitorPreview(false);
          sessionBootstrapAllowedRef.current = true;
          setSessionId(authSession.user.sessionId);
          setCatalogName(`${authSession.user.displayName}'s catalogue`);
          setIsSharedCatalog(true);
          setProducts([]);
          setSessionError('');
          setCurrentView('manage');
          setSyncMessage('Signed in to your private catalogue workspace');
          syncSessionQueryParam('');
        } else {
          setAuthUser(null);
          setIsVisitorPreview(false);
          sessionBootstrapAllowedRef.current = false;
          setSessionId('');
          setProducts([]);
          setCatalogName('');
          setIsSharedCatalog(false);
          setSessionError('');
          setCurrentView('preview');
          setSyncMessage('Viewing shared catalogues');
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setAuthUser(null);
        setIsVisitorPreview(false);
        sessionBootstrapAllowedRef.current = false;
        setSessionId('');
        setProducts([]);
        setCatalogName('');
        setIsSharedCatalog(false);
        setAuthError(error.message);
      } finally {
        if (isActive) {
          setIsAuthChecking(false);
        }
      }
    }

    loadAuthSession();

    return () => {
      isActive = false;
    };
  }, [isMobileUploadRoute]);

  useEffect(() => {
    if (isMobileUploadRoute || isAuthChecking || !isPublicVisitor) {
      return;
    }

    let isActive = true;

    async function loadSharedCatalogues() {
      setIsLoadingSharedCatalogues(true);
      setSessionError('');

      try {
        const response = await fetchPublicCatalogues();
        if (!isActive) {
          return;
        }

        const catalogues = Array.isArray(response?.catalogues) ? response.catalogues : [];
        setSharedCatalogues(catalogues);

        if (!catalogues.length) {
          setSessionId('');
          setProducts([]);
          setCatalogName('');
          setIsSharedCatalog(false);
          setIsBootstrapping(false);
          setSyncMessage('No shared catalogues are published yet');
          return;
        }

        const requestedSessionId = getSessionIdFromUrl();
        setSessionId((currentSessionId) =>
          catalogues.some((catalogue) => catalogue.sessionId === currentSessionId)
            ? currentSessionId
            : isValidSessionId(requestedSessionId) &&
                catalogues.some((catalogue) => catalogue.sessionId === requestedSessionId)
              ? requestedSessionId
            : catalogues[0].sessionId,
        );
        sessionBootstrapAllowedRef.current = false;
      } catch (error) {
        if (!isActive) {
          return;
        }

        setSharedCatalogues([]);
        setSessionError(error.message);
      } finally {
        if (isActive) {
          setIsLoadingSharedCatalogues(false);
        }
      }
    }

    loadSharedCatalogues();

    return () => {
      isActive = false;
    };
  }, [isAuthChecking, isMobileUploadRoute, isPublicVisitor]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    function syncLocation() {
      const nextRoute = getHashRoute();
      setRoute(nextRoute);

      if (nextRoute === '/upload') {
        const nextSessionId = getSessionIdFromUrl();
        sessionBootstrapAllowedRef.current = false;
        setSessionId(isValidSessionId(nextSessionId) ? nextSessionId : DEFAULT_SHARED_SESSION_ID);
      } else {
        if (isStaffWorkspace) {
          const signedInSessionId = authUser?.sessionId ?? '';
          sessionBootstrapAllowedRef.current = Boolean(signedInSessionId);
          if (signedInSessionId) {
            setSessionId(signedInSessionId);
          }
        } else {
          const urlSessionId = getSessionIdFromUrl();
          if (isValidSessionId(urlSessionId)) {
            setSessionId(urlSessionId);
          }
        }
      }
    }

    syncLocation();
    window.addEventListener('hashchange', syncLocation);
    window.addEventListener('popstate', syncLocation);

    return () => {
      window.removeEventListener('hashchange', syncLocation);
      window.removeEventListener('popstate', syncLocation);
    };
  }, [authUser, isStaffWorkspace]);

  useEffect(() => {
    if (isMobileUploadRoute || isAuthChecking || !sessionId) {
      setIsBootstrapping(false);
      return;
    }

    let isActive = true;

    async function loadSession() {
      setIsBootstrapping(true);
      setSessionError('');
      setSyncMessage('Loading shared catalogue workspace...');

      try {
        let session;

        try {
          session = await fetchCatalogSession(sessionId);
        } catch (error) {
          if (error.status !== 404) {
            throw error;
          }

          if (!sessionBootstrapAllowedRef.current) {
            throw new Error(
              'This catalogue session was not found. Open the original session link or check that storage bindings point to the correct bucket.',
            );
          }

          session = await saveCatalogSession(sessionId, cloneDefaultProducts());
          sessionBootstrapAllowedRef.current = false;
        }

        if (!isActive) {
          return;
        }

        let effectiveSession = session;
        if (
          isStaffWorkspace &&
          authUser?.userId &&
          session.ownerId === authUser.userId &&
          !session.isShared
        ) {
          try {
            effectiveSession = await saveCatalogSettings(session.sessionId, {
              catalogName: session.catalogName,
              isShared: true,
            });
          } catch (autoShareError) {
            console.warn('Could not auto-enable sharing for staff catalogue', autoShareError);
          }
        }

        const nextProducts = normalizeProducts(effectiveSession.products);
        const snapshot = getProductsSnapshot(nextProducts);
        serverSnapshotRef.current = snapshot;
        setProducts(nextProducts);
        setCatalogName(
          effectiveSession.catalogName ||
            (effectiveSession.ownerName
              ? `${effectiveSession.ownerName}'s catalogue`
              : 'LG Harris catalogue'),
        );
        setIsSharedCatalog(Boolean(effectiveSession.isShared));
        pollFailureCountRef.current = 0;
        setSyncMessage(
          isStaffWorkspace
            ? 'Signed in to your private catalogue workspace'
            : 'Viewing shared catalogue',
        );
        if (!isStaffWorkspace) {
          syncSessionQueryParam(effectiveSession.sessionId);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setSessionError(error.message);
        setSyncMessage('Shared catalogue is unavailable');
      } finally {
        if (isActive) {
          setIsBootstrapping(false);
        }
      }
    }

    loadSession();

    return () => {
      isActive = false;
    };
  }, [authUser?.userId, isAuthChecking, isMobileUploadRoute, isStaffWorkspace, sessionId]);

  useEffect(() => {
    if (isMobileUploadRoute || isAuthChecking || !isStaffWorkspace || !sessionId || isBootstrapping) {
      return undefined;
    }

    const nextSnapshot = getProductsSnapshot(products);
    if (nextSnapshot === serverSnapshotRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      isSavingRef.current = true;
      setSyncMessage('Saving changes to the shared catalogue...');
      setSessionError('');

      try {
        const savedSession = await saveCatalogSession(sessionId, products);
        const normalizedProducts = normalizeProducts(savedSession.products);
        const savedSnapshot = getProductsSnapshot(normalizedProducts);
        serverSnapshotRef.current = savedSnapshot;
        setProducts((current) =>
          getProductsSnapshot(current) === savedSnapshot ? current : normalizedProducts,
        );
        setSyncMessage('All changes saved');
      } catch (error) {
        setSessionError(error.message);
        setSyncMessage('Could not save changes');
      } finally {
        isSavingRef.current = false;
      }
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isAuthChecking, isBootstrapping, isMobileUploadRoute, isStaffWorkspace, products, sessionId]);

  useEffect(() => {
    if (isMobileUploadRoute || isAuthChecking || !sessionId || isBootstrapping) {
      return undefined;
    }

    let timeoutId = 0;
    let isCancelled = false;

    async function pollSession() {
      if (isCancelled) {
        return;
      }

      if (!isPageVisible()) {
        timeoutId = window.setTimeout(pollSession, HIDDEN_POLL_INTERVAL_MS);
        return;
      }

      if (isSavingRef.current || Date.now() - localChangeAtRef.current < 2500) {
        timeoutId = window.setTimeout(pollSession, POLL_INTERVAL_MS);
        return;
      }

      try {
        const session = await fetchCatalogSession(sessionId);
        if (isCancelled) {
          return;
        }

        const normalizedProducts = normalizeProducts(session.products);
        const remoteSnapshot = getProductsSnapshot(normalizedProducts);
        pollFailureCountRef.current = 0;

        if (remoteSnapshot !== serverSnapshotRef.current) {
          serverSnapshotRef.current = remoteSnapshot;
          setProducts(normalizedProducts);
          setSyncMessage('Mobile uploads synced');
        }

        timeoutId = window.setTimeout(pollSession, POLL_INTERVAL_MS);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        pollFailureCountRef.current += 1;
        setSessionError(error.message);
        setSyncMessage('Shared catalogue is unavailable');

        const backoffMs = Math.min(
          MAX_POLL_BACKOFF_MS,
          POLL_INTERVAL_MS * 2 ** Math.min(pollFailureCountRef.current, 3),
        );
        timeoutId = window.setTimeout(pollSession, backoffMs);
      }
    }

    timeoutId = window.setTimeout(pollSession, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isAuthChecking, isBootstrapping, isMobileUploadRoute, sessionId]);

  useEffect(() => {
    if (!editingProductId) {
      return;
    }

    if (!products.some((product) => product.id === editingProductId)) {
      resetDraft();
      setFormMessage('The product being edited is no longer in this catalogue.');
    }
  }, [editingProductId, products]);

  const stats = useMemo(() => {
    const discountedVisible = previewProducts.filter((product) => getSavings(product));
    const visibleSavings = discountedVisible.reduce((sum, product) => {
      const savings = getSavings(product);
      return sum + (savings?.amount ?? 0);
    }, 0);

    return {
      total: products.length,
      withImages: products.filter((product) => Boolean(product.image)).length,
      discounted: products.filter((product) => Boolean(getSavings(product))).length,
      visibleSavings,
      averageVisibleDiscount: discountedVisible.length
        ? Math.round(
            discountedVisible.reduce((sum, product) => sum + getSavings(product).percent, 0) /
              discountedVisible.length,
          )
        : 0,
    };
  }, [previewProducts, products]);

  function touchCatalog() {
    localChangeAtRef.current = Date.now();
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function resetDraft() {
    setDraft(createEmptyProduct());
    setDraftImageName('');
    setEditingProductId('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function startEditingProduct(productId) {
    const product = products.find((entry) => entry.id === productId);
    if (!product) {
      return;
    }

    setEditingProductId(product.id);
    setDraft({
      brand: product.brand,
      code: product.code,
      desc: product.desc,
      deal: product.deal,
      list: product.list,
      image: product.image ?? '',
    });
    setDraftImageName('');
    setCurrentView('manage');
    setFormMessage(`Editing ${product.code}. Save changes to update this line in the catalogue.`);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEditingProduct() {
    resetDraft();
    setFormMessage('Edit cancelled. The existing product was left unchanged.');
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setFormMessage('Only image files can be attached to a product.');
      event.target.value = '';
      return;
    }

    if (file.size > 10_000_000) {
      setFormMessage('Use an image smaller than 10 MB before compression.');
      event.target.value = '';
      return;
    }

    try {
      setIsPreparingImage(true);
      setFormMessage(
        removeBackgroundOnUpload
          ? 'Removing background and preparing image...'
          : 'Preparing image...',
      );
      const processedDataUrl = await prepareUploadedImage(file, {
        removeBackground: removeBackgroundOnUpload,
      });
      setDraft((current) => ({
        ...current,
        image: processedDataUrl,
      }));
      setDraftImageName(file.name);
      setFormMessage(
        editingProductId
          ? `${file.name} is ready${removeBackgroundOnUpload ? ' with background removed' : ''}. Save changes to replace the current product image.`
          : `${file.name} is ready${removeBackgroundOnUpload ? ' with background removed' : ''}. It will upload once the product has been added.`,
      );
    } catch (error) {
      setFormMessage(error.message);
      event.target.value = '';
    } finally {
      setIsPreparingImage(false);
    }
  }

  async function handleRemoveBackgroundForCurrentImages() {
    if (!sessionId) {
      setFormMessage('Shared catalogue session is unavailable.');
      return;
    }

    const productsWithImages = products.filter((product) => Boolean(product.image));
    if (!productsWithImages.length) {
      setFormMessage('There are no product images available for background removal.');
      return;
    }

    setIsBatchRemovingBackground(true);
    setFormMessage(
      `Removing backgrounds for ${productsWithImages.length} image${productsWithImages.length === 1 ? '' : 's'}...`,
    );

    let successCount = 0;
    let failureCount = 0;

    for (const product of productsWithImages) {
      try {
        const transparentDataUrl = await removeBackgroundFromImageSource(product.image);
        const response = await uploadCatalogImage(
          sessionId,
          product.id,
          transparentDataUrl,
          `${product.code || product.id}.png`,
        );
        touchCatalog();
        successCount += 1;
        setProducts((current) =>
          current.map((entry) =>
            entry.id === response.product.id ? buildProduct(response.product, entry.id) : entry,
          ),
        );
      } catch (error) {
        failureCount += 1;
        console.warn('Background removal failed for product', product.id, error);
      }
    }

    if (failureCount) {
      setFormMessage(
        `Background removal completed for ${successCount} product image${successCount === 1 ? '' : 's'}. ${failureCount} failed, please retry those items.`,
      );
    } else {
      setFormMessage(
        `Background removal completed for ${successCount} product image${successCount === 1 ? '' : 's'}.`,
      );
    }

    setIsBatchRemovingBackground(false);
  }

  async function handleAddProduct(event) {
    event.preventDefault();

    const currentEditingProduct = editingProductId
      ? products.find((product) => product.id === editingProductId) ?? null
      : null;
    const hasPendingImage = isDataUrlImage(draft.image);
    const resolvedImage = currentEditingProduct ? currentEditingProduct.image ?? '' : '';

    const nextProduct = buildProduct({
      ...draft,
      id: currentEditingProduct?.id ?? draft.id,
      brand: draft.brand.trim(),
      code: draft.code.trim(),
      desc: draft.desc.trim(),
      deal: normalizePrice(draft.deal),
      list: normalizePrice(draft.list),
      image: hasPendingImage ? resolvedImage : draft.image,
    });

    if (!nextProduct.brand || !nextProduct.code || !nextProduct.desc || !nextProduct.deal) {
      setFormMessage('Brand, code, description, and deal price are required.');
      return;
    }

    setIsSubmittingDraft(true);
    touchCatalog();

    if (currentEditingProduct) {
      setProducts((current) =>
        current.map((product) => (product.id === currentEditingProduct.id ? nextProduct : product)),
      );
    } else {
      setProducts((current) => [...current, { ...nextProduct, image: resolvedImage }]);
    }

    resetDraft();
    setFormMessage(
      currentEditingProduct
        ? `Changes saved for ${nextProduct.code}.`
        : products.length + 1 > PREVIEW_LIMIT
        ? 'Product added. Only the first 12 items will appear in the exported catalogue.'
          : 'Product added to the shared catalogue line-up.',
    );

    try {
      if (hasPendingImage) {
        const response = await uploadCatalogImage(
          sessionId,
          nextProduct.id,
          draft.image,
          draftImageName || `${nextProduct.code}.jpg`,
        );
        touchCatalog();
        setProducts((current) =>
          current.map((product) =>
            product.id === response.product.id ? buildProduct(response.product, product.id) : product,
          ),
        );
        setFormMessage(
          currentEditingProduct
            ? `Changes saved and image replaced for ${response.product.code}.`
            : `Product added and image uploaded for ${response.product.code}.`,
        );
      }
    } catch (error) {
      setFormMessage(
        currentEditingProduct
          ? `Text changes were saved, but the image replacement failed. Use the QR upload page to try again. ${error.message}`
          : `Product added, but the image upload failed. Use the QR upload page to try again. ${error.message}`,
      );
    } finally {
      setIsSubmittingDraft(false);
    }
  }

  function handleRemoveProduct(productId) {
    touchCatalog();
    if (productId === editingProductId) {
      resetDraft();
    }
    setProducts((current) => current.filter((product) => product.id !== productId));
  }

  function restoreDefaults() {
    touchCatalog();
    setProducts(cloneDefaultProducts());
    setCurrentView('manage');
    resetDraft();
    setFormMessage('Starter catalogue restored from the shared template.');
  }

  function clearProducts() {
    touchCatalog();
    setProducts([]);
    setCurrentView('manage');
    resetDraft();
    setFormMessage('All products removed from this shared catalogue session.');
  }

  async function handleCopyUploadLink() {
    if (!mobileUploadUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(mobileUploadUrl);
      setCopiedUploadLink(true);
      window.setTimeout(() => setCopiedUploadLink(false), 1800);
    } catch (error) {
      setFormMessage(`Could not copy the mobile link automatically. ${error.message}`);
    }
  }

  function updateLoginDraft(field, value) {
    setLoginDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const username = loginDraft.username.trim();
    const password = loginDraft.password;
    if (!username || !password) {
      setAuthError('Username and password are required.');
      return;
    }

    setIsLoggingIn(true);
    setAuthError('');

    try {
      const response = await loginAuthSession(username, password);
      if (!response?.authenticated || !response.user) {
        throw new Error('Sign-in failed. Please try again.');
      }

      const user = response.user;
      setAuthUser(user);
      setIsVisitorPreview(false);
      sessionBootstrapAllowedRef.current = true;
      setSessionId(user.sessionId);
      setProducts([]);
      setSharedCatalogues([]);
      setCatalogName(`${user.displayName}'s catalogue`);
      setIsSharedCatalog(false);
      setSessionError('');
      setLoginDraft({ username: '', password: '' });
      setCurrentView('manage');
      setSyncMessage('Signed in to your private catalogue workspace');
      setFormMessage('Signed in successfully. Loading your private catalogue session...');
      syncSessionQueryParam('');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    setIsLoggingIn(true);
    setAuthError('');

    try {
      await logoutAuthSession();
    } catch (error) {
      console.warn('Logout request failed', error);
    } finally {
      setAuthUser(null);
      setIsVisitorPreview(false);
      sessionBootstrapAllowedRef.current = false;
      setSessionId('');
      setProducts([]);
      setCatalogName('');
      setIsSharedCatalog(false);
      setCurrentView('preview');
      setSyncMessage('Viewing shared catalogues');
      setIsLoggingIn(false);
      syncSessionQueryParam('');
    }
  }

  function toggleVisitorPreview() {
    if (!isStaffAuthenticated) {
      return;
    }

    setSessionError('');
    if (isVisitorPreview) {
      setIsVisitorPreview(false);
      setCurrentView('manage');
      setSessionId(authUser?.sessionId ?? '');
      setSyncMessage('Signed in to your private catalogue workspace');
      syncSessionQueryParam('');
      return;
    }

    setIsVisitorPreview(true);
    setCurrentView('preview');
    setSessionId('');
    setProducts([]);
    setCatalogName('');
    setSyncMessage('Visitor preview mode');
    syncSessionQueryParam('');
  }

  function selectPublicCatalogue(nextSessionId) {
    if (!nextSessionId || nextSessionId === sessionId) {
      return;
    }

    sessionBootstrapAllowedRef.current = false;
    setSessionId(nextSessionId);
    setCurrentView('preview');
    setSessionError('');
    syncSessionQueryParam(nextSessionId);
  }

  async function handleSaveCatalogueSettings() {
    if (!isStaffAuthenticated || !sessionId) {
      return;
    }

    const trimmedName = catalogName.trim();
    if (!trimmedName) {
      setSessionError('Catalogue name cannot be empty.');
      return;
    }

    setIsSavingCatalogSettings(true);
    setSessionError('');

    try {
      const updatedSession = await saveCatalogSettings(sessionId, {
        catalogName: trimmedName,
        isShared: isSharedCatalog,
      });

      setCatalogName(updatedSession.catalogName || trimmedName);
      setIsSharedCatalog(Boolean(updatedSession.isShared));
      setSyncMessage(
        updatedSession.isShared
          ? 'Catalogue settings saved and shared publicly'
          : 'Catalogue settings saved as private',
      );
    } catch (error) {
      setSessionError(error.message);
    } finally {
      setIsSavingCatalogSettings(false);
    }
  }

  async function handleDownloadPDF() {
    if (previewProducts.length === 0 || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setExportError('');

    try {
      const [html2canvasModule, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const html2canvas = html2canvasModule.default;
      const posterNode = posterRef.current;

      if (!posterNode) {
        throw new Error('A printable poster preview is not ready yet.');
      }

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await waitForElementImages(posterNode);
      const restoreImages = await inlinePosterImagesForCapture(posterNode);

      let canvas;
      try {
        const baseOptions = {
          scale: 2,
          useCORS: false,
          logging: false,
          backgroundColor: '#f4efe6',
          removeContainer: true,
          imageTimeout: 20000,
        };

        const candidates = [];

        try {
          const foreignObjectCanvas = await html2canvas(posterNode, {
            ...baseOptions,
            foreignObjectRendering: true,
          });
          candidates.push({
            canvas: foreignObjectCanvas,
            score: getCanvasDetailScore(foreignObjectCanvas),
          });
        } catch (foreignObjectError) {
          console.warn('foreignObject PDF capture failed; falling back to standard capture.', foreignObjectError);
        }

        try {
          const standardCanvas = await html2canvas(posterNode, {
            ...baseOptions,
            foreignObjectRendering: false,
          });
          candidates.push({
            canvas: standardCanvas,
            score: getCanvasDetailScore(standardCanvas),
          });
        } catch (standardError) {
          console.warn('Standard PDF capture failed.', standardError);
        }

        if (!candidates.length) {
          throw new Error('Could not capture the poster for export.');
        }

        candidates.sort((left, right) => right.score - left.score);
        canvas = candidates[0].canvas;
      } finally {
        restoreImages();
      }

      const pageWidth = 210;
      const pageHeight = 297;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const imageData = canvas.toDataURL('image/png');
      pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

      pdf.save(`lg-harris-catalogue-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('PDF export failed', error);
      setExportError('Catalogue export failed. Try again with smaller images or fewer heavy uploads.');
    } finally {
      setIsGenerating(false);
    }
  }

  if (isMobileUploadRoute) {
    return <MobileUploadView sessionId={sessionId} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <div className="brand-lockup">
          <div className="brand-badge">
            <LayoutTemplate size={24} />
          </div>

          <div>
            <p className="brand-kicker">LG Harris staff tool</p>
            <h1 className="brand-title">Customer Catalogue Builder</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="save-pill">
            <Cloud size={14} />
            {isPublicVisitor ? 'Public shared catalogue view' : syncMessage}
          </span>

          {isStaffAuthenticated ? (
            <>
              {isStaffWorkspace ? (
                <div className="view-switch" role="tablist" aria-label="Catalogue views">
                  <button
                    type="button"
                    className={currentView === 'manage' ? 'is-active' : ''}
                    onClick={() => setCurrentView('manage')}
                  >
                    Manage
                  </button>
                  <button
                    type="button"
                    className={currentView === 'preview' ? 'is-active' : ''}
                    onClick={() => setCurrentView('preview')}
                  >
                    Preview
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="button button--secondary topbar-preview-button"
                onClick={toggleVisitorPreview}
                disabled={isLoggingIn}
              >
                <Eye size={18} />
                {isVisitorPreview ? 'Back to Staff View' : 'Preview as Visitor'}
              </button>

              <button
                type="button"
                className="button button--secondary topbar-auth-button"
                onClick={handleLogout}
                disabled={isLoggingIn}
              >
                {isLoggingIn ? <Loader2 className="spin" size={18} /> : <LogOut size={18} />}
                {isLoggingIn ? 'Signing out...' : 'Sign out'}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <main className="page-shell">
        {isAuthChecking ? (
          <section className="panel no-print">
            <div className="mobile-loading">
              <Loader2 className="spin" size={20} />
              <span>Checking staff session...</span>
            </div>
          </section>
        ) : isPublicVisitor ? (
          <>
            {authError ? (
              <div className="warning-banner no-print session-warning">
                <AlertTriangle size={18} />
                <p>{authError}</p>
              </div>
            ) : null}

            <section className="public-layout no-print">
              <article className="panel panel--auth">
                {isStaffAuthenticated ? (
                  <>
                    <div className="section-heading section-heading--compact">
                      <span className="eyebrow">Visitor preview mode</span>
                      <h2>Browsing as a public visitor.</h2>
                      <p>
                        You are still signed in as staff. This view only shows catalogues currently
                        shared publicly.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={toggleVisitorPreview}
                    >
                      <ArrowRight size={18} />
                      Back to staff workspace
                    </button>
                  </>
                ) : (
                  <>
                    <div className="section-heading section-heading--compact">
                      <span className="eyebrow">Staff access</span>
                      <h2>Sign in to manage your own catalogue.</h2>
                      <p>
                        Each staff account has a separate catalogue. You can keep it private or share it
                        publicly on this page.
                      </p>
                    </div>

                    <form className="product-form" onSubmit={handleLoginSubmit}>
                      <label className="field">
                        <span>Username</span>
                        <input
                          required
                          type="text"
                          autoComplete="username"
                          placeholder="staff.username"
                          value={loginDraft.username}
                          onChange={(event) => updateLoginDraft('username', event.target.value)}
                          disabled={isLoggingIn}
                        />
                      </label>

                      <label className="field">
                        <span>Password</span>
                        <input
                          required
                          type="password"
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={loginDraft.password}
                          onChange={(event) => updateLoginDraft('password', event.target.value)}
                          disabled={isLoggingIn}
                        />
                      </label>

                      <button className="button button--primary" type="submit" disabled={isLoggingIn}>
                        {isLoggingIn ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
                        {isLoggingIn ? 'Signing in...' : 'Sign in'}
                      </button>
                    </form>

                    {authError ? <p className="status-error">{authError}</p> : null}
                  </>
                )}
              </article>

              <aside className="panel panel--shared">
                <div className="section-heading section-heading--compact">
                  <span className="eyebrow">Shared catalogues</span>
                  <h2>Published staff catalogues</h2>
                  <p>Only catalogues marked as shared by staff are listed here.</p>
                </div>

                {isLoadingSharedCatalogues ? (
                  <div className="mobile-loading">
                    <Loader2 className="spin" size={18} />
                    <span>Loading shared catalogues...</span>
                  </div>
                ) : sharedCatalogues.length ? (
                  <div className="shared-list">
                    {sharedCatalogues.map((catalogue) => (
                      <button
                        key={catalogue.sessionId}
                        type="button"
                        className={`shared-list-item ${
                          catalogue.sessionId === sessionId ? 'is-active' : ''
                        }`}
                        onClick={() => selectPublicCatalogue(catalogue.sessionId)}
                      >
                        <strong>{catalogue.catalogName || 'LG Harris catalogue'}</strong>
                        <span>{catalogue.ownerName || 'LG Harris staff'}</span>
                        <span>
                          {catalogue.productCount || 0} products • {catalogue.imageCount || 0}{' '}
                          images
                        </span>
                        <span>Updated {formatUpdatedAt(catalogue.updatedAt)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="subtle-banner">
                    No shared catalogues are available yet. Staff can sign in and enable sharing.
                  </div>
                )}
              </aside>
            </section>

            <section className="preview-shell">
              {sessionError ? (
                <div className="warning-banner no-print session-warning">
                  <AlertTriangle size={18} />
                  <p>{sessionError}</p>
                </div>
              ) : null}

              <div className="panel panel--toolbar no-print">
                <div className="toolbar-copy">
                  <span className="eyebrow">Public catalogue preview</span>
                  <h2>{selectedPublicCatalogue?.catalogName || catalogName || 'LG Harris catalogue'}</h2>
                  <p>
                    {previewProducts.length} product{previewProducts.length === 1 ? '' : 's'} in this
                    shared catalogue.
                  </p>
                </div>

                <div className="toolbar-actions">
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={isGenerating || previewProducts.length === 0}
                    onClick={handleDownloadPDF}
                  >
                    {isGenerating ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
                    {isGenerating ? 'Generating PDF...' : 'Export PDF'}
                  </button>
                </div>
              </div>

              <div className="poster-stage">
                <CatalogPoster
                  products={previewProducts}
                  mode="export"
                  posterRef={posterRef}
                  catalogName={catalogName}
                />
              </div>

              {exportError ? <p className="status-error no-print">{exportError}</p> : null}
            </section>
          </>
        ) : currentView === 'manage' ? (
          <>
            {sessionError ? (
              <div className="warning-banner no-print session-warning">
                <AlertTriangle size={18} />
                <p>{sessionError}</p>
              </div>
            ) : null}

            <section className="manage-layout no-print">
              <article ref={formPanelRef} className="panel panel--form">
                <div className="section-heading">
                  <span className="eyebrow">Catalogue data</span>
                  <h2>{editingProduct ? `Editing ${editingProduct.code}` : 'Build a customer-ready catalogue page.'}</h2>
                  <p>
                    {editingProduct
                      ? 'Update pricing, wording or imagery for an existing catalogue line, then save it back into the shared session.'
                      : 'This workspace keeps catalogue data in a shared session, supports QR-based mobile image uploads and exports a tidy A4 catalogue PDF.'}
                  </p>
                </div>

                <form className="product-form" onSubmit={handleAddProduct}>
                  <div className="field-grid">
                    <label className="field">
                      <span>Brand</span>
                      <input
                        required
                        type="text"
                        placeholder="Harris"
                        value={draft.brand}
                        onChange={(event) => updateDraft('brand', event.target.value)}
                        disabled={isBootstrapping}
                      />
                    </label>

                    <label className="field">
                      <span>Product code</span>
                      <input
                        required
                        type="text"
                        placeholder="101064201"
                        value={draft.code}
                        onChange={(event) => updateDraft('code', event.target.value)}
                        disabled={isBootstrapping}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Description</span>
                    <textarea
                      required
                      rows="3"
                      placeholder="Essentials Dust Sheet 3.7 x 2.75M"
                      value={draft.desc}
                      onChange={(event) => updateDraft('desc', event.target.value)}
                      disabled={isBootstrapping}
                    />
                  </label>

                  <div className="field-grid">
                    <label className="field">
                      <span>Deal price</span>
                      <input
                        required
                        type="text"
                        inputMode="decimal"
                        placeholder="£3.50"
                        value={draft.deal}
                        onChange={(event) => updateDraft('deal', event.target.value)}
                        onBlur={() => updateDraft('deal', normalizePrice(draft.deal))}
                        disabled={isBootstrapping}
                      />
                    </label>

                    <label className="field">
                      <span>List price</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="£7.85"
                        value={draft.list}
                        onChange={(event) => updateDraft('list', event.target.value)}
                        onBlur={() => updateDraft('list', normalizePrice(draft.list))}
                        disabled={isBootstrapping}
                      />
                    </label>
                  </div>

                  <label className={`upload-zone ${draft.image ? 'has-image' : ''}`}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isBootstrapping || isSubmittingDraft || isPreparingImage}
                    />

                    <div className="upload-zone__icon">
                      {draft.image ? <ImageIcon size={18} /> : <Upload size={18} />}
                    </div>

                    <div>
                      <strong>
                        {isDataUrlImage(draft.image)
                          ? 'Replacement image attached'
                          : draft.image
                            ? 'Current image will be kept'
                            : 'Upload an image from this computer'}
                      </strong>
                      <p>
                        {editingProduct
                          ? 'Choose a new image only if you want to replace the existing one.'
                          : 'It will upload into the shared session after the product is added.'}
                      </p>
                    </div>
                  </label>

                  <label className="option-check">
                    <input
                      type="checkbox"
                      checked={removeBackgroundOnUpload}
                      onChange={(event) => setRemoveBackgroundOnUpload(event.target.checked)}
                      disabled={isBootstrapping || isSubmittingDraft || isPreparingImage}
                    />
                    <span>Remove background from this upload (recommended)</span>
                  </label>

                  <div className="form-actions">
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={isBootstrapping || isSubmittingDraft || isPreparingImage}
                    >
                      {isSubmittingDraft || isPreparingImage ? (
                        <Loader2 className="spin" size={18} />
                      ) : editingProduct ? (
                        <Pencil size={18} />
                      ) : (
                        <PackagePlus size={18} />
                      )}
                      {isPreparingImage
                        ? 'Preparing image...'
                        : isSubmittingDraft
                        ? 'Saving product...'
                        : editingProduct
                          ? 'Save changes'
                          : 'Add product'}
                    </button>

                    {editingProduct ? (
                      <button
                        className="button button--secondary"
                        type="button"
                        onClick={cancelEditingProduct}
                        disabled={isSubmittingDraft}
                      >
                        <X size={18} />
                        Cancel edit
                      </button>
                    ) : null}

                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => setCurrentView('preview')}
                    >
                      Preview catalogue
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </form>

                <p className="inline-message">{formMessage}</p>
              </article>

              <aside className="panel panel--summary">
                <div className="section-heading section-heading--compact">
                  <span className="eyebrow">Catalogue health</span>
                  <h2>Keep the A4 catalogue page tidy.</h2>
                </div>

                <div className="catalogue-settings">
                  <label className="field">
                    <span>Catalogue name</span>
                    <input
                      type="text"
                      value={catalogName}
                      onChange={(event) => setCatalogName(event.target.value)}
                      disabled={isBootstrapping || isSavingCatalogSettings}
                    />
                  </label>
                  <label className="option-check">
                    <input
                      type="checkbox"
                      checked={isSharedCatalog}
                      onChange={(event) => setIsSharedCatalog(event.target.checked)}
                      disabled={isBootstrapping || isSavingCatalogSettings}
                    />
                    <span>Share this catalogue publicly on lg-harris.pages.dev</span>
                  </label>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={handleSaveCatalogueSettings}
                    disabled={isBootstrapping || isSavingCatalogSettings}
                  >
                    {isSavingCatalogSettings ? (
                      <Loader2 className="spin" size={18} />
                    ) : (
                      <Cloud size={18} />
                    )}
                    {isSavingCatalogSettings ? 'Saving settings...' : 'Save catalogue settings'}
                  </button>
                </div>

                <div className="stat-grid">
                  <StatCard
                    label="Products in line-up"
                    value={stats.total}
                    hint={`${previewProducts.length} visible in the exported catalogue`}
                  />
                  <StatCard
                    label="Product images"
                    value={stats.withImages}
                    hint="Includes images uploaded from mobiles"
                    tone="warm"
                  />
                  <StatCard
                    label="Discounted lines"
                    value={stats.discounted}
                    hint={
                      stats.averageVisibleDiscount
                        ? `${stats.averageVisibleDiscount}% average visible discount`
                        : 'Add list prices to surface savings'
                    }
                    tone="accent"
                  />
                  <StatCard
                    label="Visible savings"
                    value={CURRENCY_FORMATTER.format(stats.visibleSavings)}
                    hint="Combined savings shown on the current catalogue page"
                    tone="ink"
                  />
                </div>

                {hiddenProducts > 0 ? (
                  <div className="warning-banner">
                    <AlertTriangle size={18} />
                    <p>
                      {hiddenProducts} extra product{hiddenProducts > 1 ? 's are' : ' is'} stored
                      in the line-up. Only the first {PREVIEW_LIMIT} export to A4.
                    </p>
                  </div>
                ) : (
                  <div className="subtle-banner">
                    Keep the visible selection at {PREVIEW_LIMIT} or fewer for the cleanest print
                    layout.
                  </div>
                )}

                <div className="stack-actions">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={handleRemoveBackgroundForCurrentImages}
                    disabled={
                      isBatchRemovingBackground ||
                      isBootstrapping ||
                      !products.some((product) => Boolean(product.image))
                    }
                  >
                    {isBatchRemovingBackground ? <Loader2 className="spin" size={18} /> : <ImageIcon size={18} />}
                    {isBatchRemovingBackground
                      ? 'Removing backgrounds...'
                      : 'Remove backgrounds from current images'}
                  </button>
                  <button className="button button--ghost" type="button" onClick={restoreDefaults}>
                    <RefreshCw size={18} />
                    Restore starter list
                  </button>
                  <button className="button button--ghost" type="button" onClick={clearProducts}>
                    <Trash2 size={18} />
                    Clear line-up
                  </button>
                </div>

                <MobileUploadPanel
                  sessionId={sessionId}
                  uploadUrl={mobileUploadUrl}
                  onCopy={handleCopyUploadLink}
                  copied={copiedUploadLink}
                />
              </aside>
            </section>

            <section className="panel no-print">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Line-up</span>
                  <h2>Current products</h2>
                </div>

                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setCurrentView('preview')}
                >
                  Open PDF preview
                  <ArrowRight size={18} />
                </button>
              </div>

              <div className="table-wrap">
                <table className="product-table">
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Brand</th>
                      <th>Code</th>
                      <th>Description</th>
                      <th>Pricing</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length ? (
                      products.map((product) => (
                        <ProductRow
                          key={product.id}
                          product={product}
                          isEditing={product.id === editingProductId}
                          onEdit={startEditingProduct}
                          onRemove={handleRemoveProduct}
                        />
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="table-empty">
                          No products yet. Add one above to start building the catalogue.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="preview-shell">
            {sessionError ? (
              <div className="warning-banner no-print session-warning">
                <AlertTriangle size={18} />
                <p>{sessionError}</p>
              </div>
            ) : null}

            <div className="panel panel--toolbar no-print">
              <div className="toolbar-copy">
                <span className="eyebrow">A4 catalogue preview</span>
                <h2>Ready for customer conversations</h2>
                <p>
                  {previewProducts.length} product{previewProducts.length === 1 ? '' : 's'} will be
                  rendered into the customer PDF.
                </p>
              </div>

              <div className="toolbar-actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setCurrentView('manage')}
                >
                  Back to manage
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={isGenerating || previewProducts.length === 0}
                  onClick={handleDownloadPDF}
                >
                  {isGenerating ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
                  {isGenerating ? 'Generating PDF...' : 'Export PDF'}
                </button>
              </div>
            </div>

            {hiddenProducts > 0 ? (
              <div className="warning-banner no-print">
                <AlertTriangle size={18} />
                <p>
                  The export includes only the first {PREVIEW_LIMIT} products. Remove lower-priority
                  items from the line-up if you need a cleaner catalogue page.
                </p>
              </div>
            ) : null}

            <div className="poster-stage">
              <CatalogPoster
                products={previewProducts}
                mode="export"
                posterRef={posterRef}
                catalogName={catalogName}
              />
            </div>

            {exportError ? <p className="status-error no-print">{exportError}</p> : null}
          </section>
        )}
      </main>
    </div>
  );
}
