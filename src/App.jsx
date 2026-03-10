import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
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
const SESSION_COOKIE_KEY = 'lg_harris_session';
const SESSION_QUERY_KEY = 'session';
const DEFAULT_SHARED_SESSION_ID = '979ac24e-e051-4ab5-9771-6bd8e7381c47';
const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,}$/;
const CATALOGUE_FOOTER_REFERENCE_NOTE =
  '* Prices are for customer reference and remain subject to stock and approval.';
const CATALOGUE_FOOTER_MINIMUM_NOTE =
  'Minimum order: 2 cases to be eligible for the quoted price.';
const CATALOGUE_FOOTER_EXCLUSIONS =
  'Excludes: Stax, Decco, Fortis, H&B, IBC, IBMG, NBG, Trago Mills, Home Hardware.';
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

function buildProduct(product, fallbackId = createId()) {
  return {
    id: product.id ?? fallbackId,
    brand: product.brand?.trim() ?? '',
    code: product.code?.trim() ?? '',
    desc: product.desc?.trim() ?? '',
    deal: product.deal?.trim() ?? '',
    list: product.list?.trim() ?? '',
    image: product.image ?? '',
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

function getSessionIdFromCookie() {
  if (typeof document === 'undefined') {
    return '';
  }

  const cookieEntry = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${SESSION_COOKIE_KEY}=`));

  if (!cookieEntry) {
    return '';
  }

  return decodeURIComponent(cookieEntry.split('=').slice(1).join('='));
}

function persistSessionId(sessionId) {
  if (typeof document === 'undefined' || !isValidSessionId(sessionId)) {
    return;
  }

  document.cookie = `${SESSION_COOKIE_KEY}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

function canBootstrapSessionSource(source) {
  return source === 'generated' || source === 'default-shared';
}

function resolveDesktopSession() {
  if (typeof window === 'undefined') {
    return { sessionId: '', source: 'server' };
  }

  const existing = getSessionIdFromUrl();
  if (isValidSessionId(existing)) {
    persistSessionId(existing);
    return { sessionId: existing, source: 'url' };
  }

  const cookieSessionId = getSessionIdFromCookie();
  if (cookieSessionId === DEFAULT_SHARED_SESSION_ID) {
    persistSessionId(cookieSessionId);
    return { sessionId: cookieSessionId, source: 'default-shared' };
  }

  persistSessionId(DEFAULT_SHARED_SESSION_ID);
  return { sessionId: DEFAULT_SHARED_SESSION_ID, source: 'default-shared' };
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

function truncatePdfLines(doc, text, maxWidth, maxLines) {
  const lines = doc.splitTextToSize(text || '', maxWidth);
  if (lines.length <= maxLines) {
    return lines;
  }

  const truncated = lines.slice(0, maxLines);
  let lastLine = truncated[maxLines - 1];
  const ellipsis = '...';

  while (lastLine && doc.getTextWidth(`${lastLine}${ellipsis}`) > maxWidth) {
    lastLine = lastLine.slice(0, -1).trimEnd();
  }

  truncated[maxLines - 1] = `${lastLine}${ellipsis}`;
  return truncated;
}

function fitImageWithinBox(sourceWidth, sourceHeight, boxWidth, boxHeight) {
  if (!sourceWidth || !sourceHeight) {
    return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    width,
    height,
    offsetX: (boxWidth - width) / 2,
    offsetY: (boxHeight - height) / 2,
  };
}

async function convertBlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('That image could not be prepared for PDF export.'));
    reader.readAsDataURL(blob);
  });
}

async function createPdfImageAsset(imageSource) {
  if (!imageSource) {
    return null;
  }

  let dataUrl = imageSource;

  if (!imageSource.startsWith('data:')) {
    const response = await fetch(imageSource, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error('A product image could not be loaded for PDF export.');
    }

    const blob = await response.blob();
    dataUrl = await convertBlobToDataUrl(blob);
  }

  const image = await loadImage(dataUrl);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  const scale = Math.min(1, 1800 / longestEdge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser cannot prepare PDF export images.');
  }

  context.drawImage(image, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
  };
}

async function buildPdfImageAssetMap(products) {
  const uniqueSources = [...new Set(products.map((product) => product.image).filter(Boolean))];
  const assetEntries = await Promise.all(
    uniqueSources.map(async (source) => {
      try {
        return [source, await createPdfImageAsset(source)];
      } catch (error) {
        console.warn('Skipping image in PDF export', source, error);
        return [source, null];
      }
    }),
  );

  return new Map(assetEntries);
}

function drawPdfPill(doc, { x, y, width, height, fillColor, textColor, text, fontSize = 7 }) {
  doc.setFillColor(...fillColor);
  doc.roundedRect(x, y, width, height, height / 2, height / 2, 'F');
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.text(text, x + width / 2, y + height * 0.64, { align: 'center' });
}

function drawPdfWrappedCenteredText(doc, text, centerX, startY, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line, index) => {
    doc.text(line, centerX, startY + lineHeight * index, { align: 'center' });
  });
  return startY + lineHeight * lines.length;
}

function drawPosterCardPdf(doc, product, assetMap, x, y, width, height) {
  const savings = getSavings(product);
  const palette = {
    cardBorder: [220, 212, 201],
    cardFill: [255, 255, 255],
    accent: [217, 82, 50],
    surface: [247, 242, 234],
    brand: [20, 78, 146],
    code: [112, 101, 89],
    body: [32, 29, 25],
    muted: [124, 112, 99],
    deal: [204, 76, 46],
  };
  const sidePadding = 2;
  const left = x + sidePadding;
  const right = x + width - sidePadding;
  const mediaX = x + 1.2;
  const mediaY = y + 1.2;
  const mediaWidth = width - 2.4;
  const mediaHeight = 17;
  const metaY = mediaY + mediaHeight + 3.5;
  const descriptionY = metaY + 4.7;
  const pricingBoxY = y + height - 13.8;
  const pricingBoxHeight = 12.4;

  doc.setFillColor(...palette.cardFill);
  doc.setDrawColor(...palette.cardBorder);
  doc.roundedRect(x, y, width, height, 2.2, 2.2, 'FD');

  doc.setFillColor(...palette.accent);
  doc.roundedRect(x + 1.2, y + 1.2, 18, 1.25, 0.6, 0.6, 'F');

  doc.setFillColor(...palette.surface);
  doc.roundedRect(mediaX, mediaY + 1.1, mediaWidth, mediaHeight, 0.9, 0.9, 'F');

  const asset = assetMap.get(product.image) ?? null;
  if (asset) {
    const imageBox = fitImageWithinBox(asset.width, asset.height, mediaWidth - 1.4, mediaHeight - 1.4);
    doc.addImage(
      asset.dataUrl,
      'PNG',
      mediaX + 0.7 + imageBox.offsetX,
      mediaY + 1.8 + imageBox.offsetY,
      imageBox.width,
      imageBox.height,
    );
  } else {
    doc.setTextColor(165, 152, 136);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.text('Image pending', x + width / 2, mediaY + 10.8, { align: 'center' });
  }

  if (savings) {
    drawPdfPill(doc, {
      x: x + width - 13.8,
      y: y + 1.2,
      width: 12.6,
      height: 4.2,
      fillColor: palette.accent,
      textColor: [255, 255, 255],
      text: `${savings.percent}% off`,
      fontSize: 5,
    });
  }

  doc.setTextColor(...palette.brand);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  const brandLabel = truncatePdfLines(doc, (product.brand || 'Brand').toUpperCase(), width * 0.58, 1)[0];
  doc.text(brandLabel, left, metaY);

  doc.setTextColor(...palette.code);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  const codeLabel = truncatePdfLines(doc, (product.code || 'Code').toUpperCase(), width * 0.36, 1)[0];
  doc.text(codeLabel, right, metaY, { align: 'right' });

  doc.setTextColor(...palette.body);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setLineHeightFactor(1.14);
  const descriptionLines = truncatePdfLines(doc, product.desc || '', width - sidePadding * 2, 2);
  doc.text(descriptionLines, left, descriptionY);

  doc.setFillColor(252, 247, 241);
  doc.roundedRect(x + 1.2, pricingBoxY, width - 2.4, pricingBoxHeight, 1.2, 1.2, 'F');
  doc.setDrawColor(231, 224, 213);
  doc.setLineWidth(0.2);
  doc.line(left, pricingBoxY + 3.6, right, pricingBoxY + 3.6);

  doc.setTextColor(...palette.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.9);
  doc.text('TRADE PRICE', left, pricingBoxY + 2.4);

  doc.setTextColor(...palette.deal);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.7);
  doc.text(product.deal || '', left, y + height - 2.2);

  if (product.list) {
    doc.setTextColor(...palette.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.9);
    doc.text('LIST', right, pricingBoxY + 2.4, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    const listY = y + height - 2.6;
    doc.text(product.list, right, listY, { align: 'right' });
    const listWidth = doc.getTextWidth(product.list);
    doc.setLineWidth(0.2);
    doc.setDrawColor(...palette.muted);
    doc.line(right - listWidth, listY - 0.95, right, listY - 0.95);
  }
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

  return (
    <article className="poster-card">
      <div className="poster-card__media">
        {product.image ? (
          <img src={product.image} alt={product.desc} />
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
          <span className="poster-card__code">{product.code}</span>
        </div>

        <h3 className="poster-card__description">{product.desc}</h3>

        <div className="poster-card__pricing">
          <div>
            <span className="poster-card__label">Deal price</span>
            <strong className="poster-card__price">{product.deal}</strong>
          </div>

          {product.list ? (
            <div className="poster-card__list">
              <span className="poster-card__label">List</span>
              <span>{product.list}</span>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function CatalogPoster({ products, mode = 'preview', posterRef = null }) {
  const isExportMode = mode === 'export';

  return (
    <div ref={posterRef} className={`poster-canvas ${isExportMode ? 'poster-canvas--export' : ''}`}>
      <header className="poster-header">
        <span className="poster-kicker">LG Harris customer catalogue</span>
        <h2 className="poster-title">Premium Dust Sheets and Tarpaulins</h2>
        <p className="poster-subtitle">
          Prepared by LG Harris for customer reference and sales conversations
        </p>
        <div className="poster-chip">Current trade prices across trusted brands</div>
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
        <p>{CATALOGUE_FOOTER_MINIMUM_NOTE}</p>
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
    setStatusMessage('Preparing image...');

    try {
      const compressedDataUrl = await compressImageFile(file);
      setStatusMessage('Uploading image to the catalogue...');

      const response = await uploadCatalogImage(
        sessionId,
        selectedProductId,
        compressedDataUrl,
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

  const initialDesktopSessionRef = useRef(null);
  if (initialDesktopSessionRef.current === null && typeof window !== 'undefined' && getHashRoute() !== '/upload') {
    initialDesktopSessionRef.current = resolveDesktopSession();
    sessionBootstrapAllowedRef.current = canBootstrapSessionSource(initialDesktopSessionRef.current.source);
  }

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

    if (initialDesktopSessionRef.current) {
      return initialDesktopSessionRef.current.sessionId;
    }

    const resolved = resolveDesktopSession();
    sessionBootstrapAllowedRef.current = canBootstrapSessionSource(resolved.source);
    return resolved.sessionId;
  });
  const [products, setProducts] = useState(cloneDefaultProducts);
  const [draft, setDraft] = useState(createEmptyProduct);
  const [draftImageName, setDraftImageName] = useState('');
  const [editingProductId, setEditingProductId] = useState('');
  const [currentView, setCurrentView] = useState('manage');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);
  const [syncMessage, setSyncMessage] = useState('Connecting to shared catalogue workspace...');
  const [formMessage, setFormMessage] = useState(
    'Edits made here and uploads from mobile are saved to the same shared catalogue session.',
  );
  const [exportError, setExportError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [copiedUploadLink, setCopiedUploadLink] = useState(false);

  const isMobileUploadRoute = route === '/upload';
  const previewProducts = useMemo(() => products.slice(0, PREVIEW_LIMIT), [products]);
  const hiddenProducts = Math.max(products.length - PREVIEW_LIMIT, 0);
  const mobileUploadUrl = useMemo(() => buildMobileUploadUrl(sessionId), [sessionId]);
  const editingProduct = useMemo(
    () => products.find((product) => product.id === editingProductId) ?? null,
    [editingProductId, products],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    function syncLocation() {
      const nextRoute = getHashRoute();
      setRoute(nextRoute);

      if (nextRoute === '/upload') {
        const nextSessionId = getSessionIdFromUrl();
        if (isValidSessionId(nextSessionId)) {
          persistSessionId(nextSessionId);
        }
        sessionBootstrapAllowedRef.current = false;
        setSessionId(isValidSessionId(nextSessionId) ? nextSessionId : DEFAULT_SHARED_SESSION_ID);
      } else {
        const resolved = resolveDesktopSession();
        sessionBootstrapAllowedRef.current = canBootstrapSessionSource(resolved.source);
        setSessionId(resolved.sessionId);
      }
    }

    syncLocation();
    window.addEventListener('hashchange', syncLocation);
    window.addEventListener('popstate', syncLocation);

    return () => {
      window.removeEventListener('hashchange', syncLocation);
      window.removeEventListener('popstate', syncLocation);
    };
  }, []);

  useEffect(() => {
    if (sessionId) {
      persistSessionId(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    if (isMobileUploadRoute || !sessionId) {
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

        const nextProducts = normalizeProducts(session.products);
        const snapshot = getProductsSnapshot(nextProducts);
        serverSnapshotRef.current = snapshot;
        setProducts(nextProducts);
        pollFailureCountRef.current = 0;
        setSyncMessage('Shared catalogue ready');
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
  }, [isMobileUploadRoute, sessionId]);

  useEffect(() => {
    if (isMobileUploadRoute || !sessionId || isBootstrapping) {
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
  }, [isBootstrapping, isMobileUploadRoute, products, sessionId]);

  useEffect(() => {
    if (isMobileUploadRoute || !sessionId || isBootstrapping) {
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
  }, [isBootstrapping, isMobileUploadRoute, sessionId]);

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
      const compressedDataUrl = await compressImageFile(file);
      setDraft((current) => ({
        ...current,
        image: compressedDataUrl,
      }));
      setDraftImageName(file.name);
      setFormMessage(
        editingProductId
          ? `${file.name} is ready. Save changes to replace the current product image.`
          : `${file.name} is ready. It will upload once the product has been added.`,
      );
    } catch (error) {
      setFormMessage(error.message);
      event.target.value = '';
    }
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

  async function handleDownloadPDF() {
    if (previewProducts.length === 0 || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setExportError('');

    try {
      const [{ jsPDF }] = await Promise.all([import('jspdf')]);
      const imageAssetMap = await buildPdfImageAssetMap(previewProducts);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const marginX = 8;
      const marginTop = 8;
      const columnGap = 3.2;
      const rowGap = 2.8;
      const columns = 3;
      const rows = Math.max(1, Math.ceil(previewProducts.length / columns));
      const heroX = marginX;
      const heroY = marginTop;
      const heroWidth = pageWidth - marginX * 2;
      const heroHeight = 43;
      const gridStartY = heroY + heroHeight + 4.8;
      const footerHeight = 19.5;
      const footerTop = pageHeight - marginTop - footerHeight;
      const cardWidth = (pageWidth - marginX * 2 - columnGap * (columns - 1)) / columns;
      const cardHeight = (footerTop - gridStartY - rowGap * (rows - 1)) / rows;
      const bestSavingsPercent = previewProducts.reduce((highest, product) => {
        const savings = getSavings(product);
        return savings ? Math.max(highest, savings.percent) : highest;
      }, 0);
      const exportDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      pdf.setFillColor(246, 242, 235);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      pdf.setFillColor(27, 34, 44);
      pdf.roundedRect(heroX, heroY, heroWidth, heroHeight, 4, 4, 'F');

      pdf.setFillColor(217, 82, 50);
      pdf.roundedRect(heroX + 4, heroY + 33.6, 84, 5.3, 2.6, 2.6, 'F');

      pdf.setTextColor(236, 109, 75);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.text('LG HARRIS | CUSTOMER CATALOGUE', heroX + 4, heroY + 6.4);

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18.8);
      pdf.text('Premium Dust Sheets', heroX + 4, heroY + 16.3);
      pdf.text('& Tarpaulins', heroX + 4, heroY + 25.2);

      pdf.setTextColor(221, 214, 204);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.4);
      pdf.text(
        'Prepared by LG Harris for customer reference and sales conversations',
        heroX + 4,
        heroY + 30.2,
      );

      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text('Trade prices in pounds sterling', heroX + 8, heroY + 37.2);

      const insightWidth = 58;
      const insightHeight = 29;
      const insightX = heroX + heroWidth - insightWidth - 4;
      const insightY = heroY + 7;
      pdf.setFillColor(246, 241, 233);
      pdf.roundedRect(insightX, insightY, insightWidth, insightHeight, 2.5, 2.5, 'F');

      pdf.setTextColor(108, 96, 84);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5.7);
      pdf.text('Current trade snapshot', insightX + 3.2, insightY + 4.6);

      if (bestSavingsPercent > 0) {
        pdf.setTextColor(208, 76, 45);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.text(`${bestSavingsPercent}%`, insightX + 3.2, insightY + 12.2);
        pdf.setTextColor(113, 101, 90);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5.7);
        pdf.text('Best saving versus list', insightX + 3.2, insightY + 16.2);
      } else {
        pdf.setTextColor(64, 56, 48);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.5);
        pdf.text('Live pricing', insightX + 3.2, insightY + 11.8);
        pdf.setTextColor(113, 101, 90);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5.7);
        pdf.text('Based on current trade data', insightX + 3.2, insightY + 15.8);
      }

      pdf.setTextColor(64, 56, 48);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.4);
      pdf.text(`${previewProducts.length} products`, insightX + 3.2, insightY + 21);

      pdf.setTextColor(122, 112, 101);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5.4);
      pdf.text(exportDate, insightX + 3.2, insightY + 24.6);

      pdf.setDrawColor(223, 216, 206);
      pdf.setLineWidth(0.45);
      pdf.line(marginX, gridStartY - 2.3, pageWidth - marginX, gridStartY - 2.3);

      previewProducts.forEach((product, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = marginX + column * (cardWidth + columnGap);
        const y = gridStartY + row * (cardHeight + rowGap);

        drawPosterCardPdf(pdf, product, imageAssetMap, x, y, cardWidth, cardHeight);
      });

      pdf.setFillColor(241, 236, 228);
      pdf.roundedRect(marginX, footerTop + 1.8, pageWidth - marginX * 2, footerHeight - 3.3, 2.5, 2.5, 'F');
      pdf.setDrawColor(205, 196, 184);
      pdf.setLineWidth(0.3);
      pdf.line(marginX, footerTop, pageWidth - marginX, footerTop);

      let footerCursor = footerTop + 6;
      const footerTextWidth = pageWidth - marginX * 2 - 7;
      pdf.setTextColor(118, 107, 95);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5.6);
      footerCursor = drawPdfWrappedCenteredText(
        pdf,
        CATALOGUE_FOOTER_REFERENCE_NOTE,
        pageWidth / 2,
        footerCursor,
        footerTextWidth,
        2.65,
      );
      footerCursor += 0.9;
      pdf.setFontSize(5.6);
      footerCursor = drawPdfWrappedCenteredText(
        pdf,
        CATALOGUE_FOOTER_MINIMUM_NOTE,
        pageWidth / 2,
        footerCursor,
        footerTextWidth,
        2.65,
      );
      footerCursor += 0.9;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5.15);
      drawPdfWrappedCenteredText(
        pdf,
        CATALOGUE_FOOTER_EXCLUSIONS,
        pageWidth / 2,
        footerCursor,
        footerTextWidth,
        2.45,
      );

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
            {syncMessage}
          </span>

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
        </div>
      </header>

      <main className="page-shell">
        {currentView === 'manage' ? (
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
                      disabled={isBootstrapping || isSubmittingDraft}
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

                  <div className="form-actions">
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={isBootstrapping || isSubmittingDraft}
                    >
                      {isSubmittingDraft ? (
                        <Loader2 className="spin" size={18} />
                      ) : editingProduct ? (
                        <Pencil size={18} />
                      ) : (
                        <PackagePlus size={18} />
                      )}
                      {isSubmittingDraft
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
              <CatalogPoster products={previewProducts} posterRef={posterRef} />
            </div>

            {exportError ? <p className="status-error no-print">{exportError}</p> : null}
          </section>
        )}
      </main>
    </div>
  );
}
