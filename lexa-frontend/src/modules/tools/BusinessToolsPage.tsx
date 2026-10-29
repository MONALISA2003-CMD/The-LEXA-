import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  Activity, AlertTriangle, ArrowRight, Barcode, Building2, Camera, Check, Clock3,
  DatabaseBackup, Download, FileSpreadsheet, FileText, History, Printer, RefreshCw,
  Search, ShieldCheck, Smartphone, Upload, Wallet, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { formatMinorAmount, minorUnitFactor } from '../../domain/money/money';
import {
  createLocalDatabaseBackup, importOpeningStockCsv, importProductsCsv, loadBusinessToolsSnapshot,
  restoreLocalDatabaseBackup, validateLocalDatabaseBackup,
} from '../../data/local/businessTools';

type ToolTab = 'overview' | 'cash-up' | 'tax' | 'data' | 'capture' | 'profile';
type UiMode = 'simple' | 'advanced';
type TaxProfile = {
  tin: string; vatRegistered: boolean; sector: string; efrisOverride: 'auto' | 'yes' | 'no';
  vatThreshold: string; efrisTurnoverThreshold: string; ruleSource: string; ruleEffectiveFrom: string;
};
type ComplianceNote = { id: string; date: string; documentType: string; internalReference: string; fdn: string; status: string; notes: string };
type CashUp = {
  workspaceId: string; branchId: string; date: string; openingFloatMinor: number; otherCashInMinor: number;
  otherCashOutMinor: number; expectedCashMinor: number; countedCashMinor: number; varianceMinor: number;
  reason: string; savedAt: string;
};
type LocalAttachment = {
  id: string; workspaceId: string; branchId: string; reference: string; kind: 'product' | 'receipt' | 'other';
  name: string; mimeType: string; size: number; capturedAt: string; blob: Blob;
};
type BarcodeResult = { rawValue?: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<BarcodeResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

const TAX_SECTORS = [
  ['retail', 'Retail / wholesale'], ['manufacturing', 'Manufacturing'], ['mining', 'Mining and quarrying'],
  ['water-waste', 'Water, sewerage and waste'], ['utilities', 'Electricity, gas and air-conditioning'],
  ['construction', 'Construction'], ['transport', 'Transportation and storage'], ['accommodation-food', 'Accommodation and food services'],
  ['it-communications', 'IT and communications'], ['real-estate', 'Real estate'], ['professional', 'Professional, scientific and technical services'],
  ['arts-recreation', 'Arts, entertainment and recreation'], ['fuel', 'Fuel wholesale and retail'], ['pharmacy', 'Pharmacy / health retail'],
  ['salon', 'Salon / personal services'], ['agro-inputs', 'Agricultural inputs'], ['other', 'Other / not sure'],
] as const;
const SECTOR_CODES_REPORTED_AS_EFRIS = new Set(['manufacturing', 'mining', 'water-waste', 'utilities', 'construction', 'transport', 'accommodation-food', 'it-communications', 'real-estate', 'professional', 'arts-recreation', 'fuel']);
const PROFILE_KEY = 'lexa.tools.tax-profile.v1';
const CASHUP_KEY = 'lexa.tools.cash-ups.v1';
const COMPLIANCE_KEY = 'lexa.tools.compliance-notes.v1';
const UI_MODE_KEY = 'lexa.ui.mode';
const ATTACHMENT_DB_NAME = 'lexa-local-attachments';
const ATTACHMENT_STORE = 'attachments';

const defaultTaxProfile: TaxProfile = {
  tin: '', vatRegistered: false, sector: 'retail', efrisOverride: 'auto',
  vatThreshold: '300000000', efrisTurnoverThreshold: '10000000',
  ruleSource: 'LEXA Engineering Concept §10.1, dated 28 October 2026; source facts require URA / qualified tax adviser verification.',
  ruleEffectiveFrom: '2026-07-01',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } as T : fallback;
  } catch { return fallback; }
}
function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
function safeId(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function dateForZone(value: string | Date, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  } catch { return date.toISOString().slice(0, 10); }
}
function localDateForZone(timeZone: string): string { return dateForZone(new Date(), timeZone); }
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadText(text: string, fileName: string, mime = 'text/plain;charset=utf-8'): void { downloadBlob(new Blob([text], { type: mime }), fileName); }
function csvCell(value: unknown): string {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function rowsToCsv(rows: unknown[]): string {
  if (!rows.length) return 'No records\r\n';
  const objects = rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row));
  if (!objects.length) return 'value\r\n' + rows.map(csvCell).join('\r\n');
  const headers = [...new Set(objects.flatMap((row) => Object.keys(row)))];
  return [headers.map(csvCell).join(','), ...objects.map((row) => headers.map((key) => csvCell(row[key])).join(','))].join('\r\n') + '\r\n';
}
function parseProfile(workspaceId: string): TaxProfile {
  return readJson(`${PROFILE_KEY}:${workspaceId}`, defaultTaxProfile);
}
function saveProfile(workspaceId: string, profile: TaxProfile): void { writeJson(`${PROFILE_KEY}:${workspaceId}`, profile); }
function readCashUps(): CashUp[] {
  try { const value = localStorage.getItem(CASHUP_KEY); return value ? JSON.parse(value) as CashUp[] : []; }
  catch { return []; }
}
function readComplianceNotes(workspaceId: string): ComplianceNote[] {
  try { const value = localStorage.getItem(`${COMPLIANCE_KEY}:${workspaceId}`); return value ? JSON.parse(value) as ComplianceNote[] : []; }
  catch { return []; }
}

let attachmentDbPromise: Promise<IDBDatabase> | undefined;
function openAttachmentDatabase(): Promise<IDBDatabase> {
  if (attachmentDbPromise) return attachmentDbPromise;
  attachmentDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(ATTACHMENT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ATTACHMENT_STORE)) {
        const store = database.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' });
        store.createIndex('workspaceId', 'workspaceId', { unique: false });
        store.createIndex('branchId', 'branchId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the local attachment store.'));
  });
  return attachmentDbPromise;
}
async function storeAttachment(attachment: LocalAttachment): Promise<void> {
  const database = await openAttachmentDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(ATTACHMENT_STORE, 'readwrite');
    transaction.objectStore(ATTACHMENT_STORE).put(attachment);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Attachment could not be saved.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Attachment save was cancelled.'));
  });
}
async function listAttachments(workspaceId: string): Promise<LocalAttachment[]> {
  const database = await openAttachmentDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(ATTACHMENT_STORE, 'readonly');
    const request = transaction.objectStore(ATTACHMENT_STORE).index('workspaceId').getAll(IDBKeyRange.only(workspaceId));
    request.onsuccess = () => resolve((request.result as LocalAttachment[]).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 30));
    request.onerror = () => reject(request.error ?? new Error('Could not list attachments.'));
  });
}

export default function BusinessToolsPage() {
  const { workspace, branch, refreshWorkspaces } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ToolTab>('overview');
  const [uiMode, setUiMode] = useState<UiMode>(() => localStorage.getItem(UI_MODE_KEY) === 'advanced' ? 'advanced' : 'simple');
  const [profile, setProfile] = useState<TaxProfile>(() => parseProfile(workspace.id));
  const [searchValue, setSearchValue] = useState('');
  const [cashDate, setCashDate] = useState(() => localDateForZone(workspace.timezone));
  const [openingFloat, setOpeningFloat] = useState('0');
  const [otherCashIn, setOtherCashIn] = useState('0');
  const [otherCashOut, setOtherCashOut] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [cashUps, setCashUps] = useState<CashUp[]>(() => readCashUps());
  const [complianceNotes, setComplianceNotes] = useState<ComplianceNote[]>(() => readComplianceNotes(workspace.id));
  const [documentType, setDocumentType] = useState('Sales invoice');
  const [internalReference, setInternalReference] = useState('');
  const [fdn, setFdn] = useState('');
  const [fdnStatus, setFdnStatus] = useState('Pending');
  const [complianceNoteText, setComplianceNoteText] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [attachmentKind, setAttachmentKind] = useState<'product' | 'receipt' | 'other'>('receipt');
  const [attachmentReference, setAttachmentReference] = useState('');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [scanValue, setScanValue] = useState('');
  const [busy, setBusy] = useState(false);
  const productImportRef = useRef<HTMLInputElement>(null);
  const stockImportRef = useRef<HTMLInputElement>(null);
  const backupImportRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerTimerRef = useRef<number | null>(null);
  const scanInFlightRef = useRef(false);

  const snapshotQuery = useQuery({
    queryKey: ['business-tools', workspace.id, branch.id],
    queryFn: () => loadBusinessToolsSnapshot(workspace.id, branch.id),
  });
  const snapshot = snapshotQuery.data;
  const refreshSnapshot = async () => {
    await queryClient.invalidateQueries({ queryKey: ['business-tools', workspace.id, branch.id] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id, branch.id] });
    await queryClient.invalidateQueries({ queryKey: ['products', workspace.id] });
    await queryClient.invalidateQueries({ queryKey: ['categories', workspace.id] });
    await queryClient.invalidateQueries({ queryKey: ['inventory-balances', workspace.id, branch.id] });
    await queryClient.invalidateQueries({ queryKey: ['inventory-movements', workspace.id, branch.id] });
  };

  useEffect(() => {
    setProfile(parseProfile(workspace.id));
    setComplianceNotes(readComplianceNotes(workspace.id));
    setCashUps(readCashUps());
  }, [workspace.id]);
  useEffect(() => {
    let alive = true;
    void listAttachments(workspace.id).then((items) => { if (alive) setAttachments(items); }).catch(() => { if (alive) setAttachments([]); });
    return () => { alive = false; };
  }, [workspace.id]);
  useEffect(() => {
    localStorage.setItem(UI_MODE_KEY, uiMode);
    window.dispatchEvent(new CustomEvent('lexa:ui-mode-change', { detail: uiMode }));
  }, [uiMode]);
  useEffect(() => () => {
    if (scannerTimerRef.current !== null) window.clearInterval(scannerTimerRef.current);
    scannerTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const formatter = (minor: number) => formatMinorAmount(minor, workspace.currency);
  const branchSaleIds = useMemo(() => new Set((snapshot?.sales ?? []).filter((sale) => sale.branchId === branch.id).map((sale) => sale.id)), [snapshot, branch.id]);
  const todaysPayments = useMemo(() => (snapshot?.payments ?? []).filter((payment) => branchSaleIds.has(payment.saleId) && dateForZone(payment.createdAt, workspace.timezone) === cashDate && payment.method === 'cash'), [snapshot, branchSaleIds, cashDate, workspace.timezone]);
  const cashReceiptsMinor = todaysPayments.filter((payment) => payment.kind === 'receipt').reduce((sum, payment) => sum + payment.amountMinor, 0);
  const cashRefundsMinor = todaysPayments.filter((payment) => payment.kind === 'refund').reduce((sum, payment) => sum + payment.amountMinor, 0);
  const currencyFactor = minorUnitFactor(workspace.currency);
  const expectedCashMinor = (Number(openingFloat) || 0) * currencyFactor
    + cashReceiptsMinor - cashRefundsMinor + (Number(otherCashIn) || 0) * currencyFactor
    - (Number(otherCashOut) || 0) * currencyFactor;
  const countedCashMinor = countedCash.trim() ? (Number(countedCash) || 0) * currencyFactor : null;
  const varianceMinor = countedCashMinor === null ? null : countedCashMinor - expectedCashMinor;

  const turnoverCutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const rollingSales = (snapshot?.sales ?? []).filter((sale) => new Date(sale.createdAt).getTime() >= turnoverCutoff);
  const rollingIds = new Set(rollingSales.map((sale) => sale.id));
  const rollingGrossMinor = rollingSales.reduce((sum, sale) => sum + sale.totalMinor, 0);
  const rollingReturnsMinor = (snapshot?.returns ?? []).filter((record) => rollingIds.has(record.saleId)).reduce((sum, record) => sum + record.totalMinor, 0);
  const rollingTurnoverMinor = Math.max(0, rollingGrossMinor - rollingReturnsMinor);
  const vatThresholdMinor = Math.max(1, Number(profile.vatThreshold) || 300000000);
  const efrisThresholdMinor = Math.max(1, Number(profile.efrisTurnoverThreshold) || 10000000);
  const taxCurrencySupported = workspace.currency === 'UGX';
  const vatThresholdSignal = taxCurrencySupported && rollingTurnoverMinor >= vatThresholdMinor;
  const efrisPossibleBySector = taxCurrencySupported && SECTOR_CODES_REPORTED_AS_EFRIS.has(profile.sector) && rollingTurnoverMinor >= efrisThresholdMinor;
  const efrisPossible = profile.efrisOverride === 'yes' ? true : profile.efrisOverride === 'no' ? false : profile.vatRegistered || vatThresholdSignal || efrisPossibleBySector;

  const matchedProducts = useMemo(() => {
    const q = searchValue.trim().toLocaleLowerCase();
    if (!q) return [];
    return (snapshot?.products ?? []).filter((product) => [product.name, product.sku, product.barcode ?? '', product.brand ?? ''].some((value) => value.toLocaleLowerCase().includes(q))).slice(0, 8);
  }, [snapshot, searchValue]);
  const matchedSales = useMemo(() => {
    const q = searchValue.trim().toLocaleLowerCase();
    if (!q) return [];
    return (snapshot?.sales ?? []).filter((sale) => [sale.receiptNumber, sale.customerName ?? '', sale.customerPhone ?? ''].some((value) => value.toLocaleLowerCase().includes(q))).slice(0, 8);
  }, [snapshot, searchValue]);
  const matchesCount = matchedProducts.length + matchedSales.length;

  function stopCamera(): void {
    if (scannerTimerRef.current !== null) window.clearInterval(scannerTimerRef.current);
    scannerTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    scanInFlightRef.current = false;
    setCameraOpen(false);
  }

  async function startCamera(): Promise<void> {
    setCameraMessage('');
    const browser = window as Window & { BarcodeDetector?: BarcodeDetectorConstructor };
    const Detector = browser.BarcodeDetector;
    if (!Detector) {
      setCameraMessage('Live barcode detection is not supported by this browser. Use the barcode field or the camera/photo capture control below.');
      toast.info('Live scanner unavailable', { description: 'You can still type or capture a barcode and search the product catalogue.' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage('Camera access is unavailable in this browser or page context.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
      window.setTimeout(async () => {
        if (!videoRef.current || !streamRef.current) return;
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch { /* browser may require user interaction */ }
        let detector: BarcodeDetectorInstance;
        try { detector = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code'] }); }
        catch { detector = new Detector(); }
        scannerTimerRef.current = window.setInterval(async () => {
          if (scanInFlightRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
          scanInFlightRef.current = true;
          try {
            const results = await detector.detect(videoRef.current);
            const code = results.find((result) => result.rawValue)?.rawValue;
            if (code) {
              setScanValue(code); setSearchValue(code); setCameraMessage(`Scanned ${code}`); stopCamera();
              toast.success('Barcode captured', { description: 'Review the matching product before continuing.' });
            }
          } catch { /* blurry camera frames are expected while scanning */ }
          finally { scanInFlightRef.current = false; }
        }, 450);
      }, 100);
    } catch (error) {
      stopCamera();
      setCameraMessage(error instanceof Error ? error.message : 'Camera permission was not granted.');
    }
  }

  function saveCashUp(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (countedCashMinor === null || !Number.isFinite(countedCashMinor)) { toast.error('Enter the counted cash amount.'); return; }
    if ([openingFloat, otherCashIn, otherCashOut, countedCash].some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) { toast.error('Cash-up amounts must be valid non-negative numbers.'); return; }
    if (varianceMinor !== 0 && !cashReason.trim()) { toast.error('Explain the cash variance before saving.'); return; }
    const record: CashUp = {
      workspaceId: workspace.id, branchId: branch.id, date: cashDate,
      openingFloatMinor: Math.round((Number(openingFloat) || 0) * currencyFactor),
      otherCashInMinor: Math.round((Number(otherCashIn) || 0) * currencyFactor),
      otherCashOutMinor: Math.round((Number(otherCashOut) || 0) * currencyFactor),
      expectedCashMinor: Math.round(expectedCashMinor), countedCashMinor: Math.round(countedCashMinor), varianceMinor: Math.round(varianceMinor ?? 0), reason: cashReason.trim(), savedAt: new Date().toISOString(),
    };
    const next = [...readCashUps().filter((item) => !(item.workspaceId === workspace.id && item.branchId === branch.id && item.date === cashDate)), record];
    writeJson(CASHUP_KEY, next); setCashUps(next); toast.success('Cash-up saved locally', { description: 'This compares recorded cash entries with your count; it is not a bank or mobile-money reconciliation.' });
  }

  function saveTaxProfile(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!Number.isFinite(Number(profile.vatThreshold)) || Number(profile.vatThreshold) <= 0 || !Number.isFinite(Number(profile.efrisTurnoverThreshold)) || Number(profile.efrisTurnoverThreshold) <= 0) {
      toast.error('Enter positive turnover thresholds.'); return;
    }
    saveProfile(workspace.id, profile);
    toast.success('Tax profile saved on this device', { description: 'Thresholds and applicability remain provisional guidance, not a tax determination.' });
  }

  function saveComplianceNote(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!internalReference.trim()) { toast.error('Enter the internal invoice or receipt reference.'); return; }
    const note: ComplianceNote = { id: safeId('tax-note'), date: new Date().toISOString().slice(0, 10), documentType, internalReference: internalReference.trim(), fdn: fdn.trim(), status: fdnStatus, notes: complianceNoteText.trim() };
    const next = [note, ...readComplianceNotes(workspace.id)];
    writeJson(`${COMPLIANCE_KEY}:${workspace.id}`, next); setComplianceNotes(next);
    setInternalReference(''); setFdn(''); setComplianceNoteText(''); toast.success('Manual tax reference saved locally');
  }

  async function handleBackup(): Promise<void> {
    setBusy(true);
    try {
      const backup = await createLocalDatabaseBackup();
      downloadText(JSON.stringify(backup, null, 2), `lexa-local-backup-${workspace.id}-${new Date().toISOString().slice(0, 10)}.json`, 'application/json;charset=utf-8');
      toast.success('Local database backup downloaded', { description: `${Object.keys(backup.tables).length} tables were included. Device photos and separate tool notes are not included in this core database backup.` });
    } catch (error) { toast.error('Backup failed', { description: error instanceof Error ? error.message : 'Could not read local data.' }); }
    finally { setBusy(false); }
  }

  async function handleBackupFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const value: unknown = JSON.parse(await file.text());
      const valid = validateLocalDatabaseBackup(value);
      const recordCount = Object.values(valid.tables).reduce((sum, rows) => sum + rows.length, 0);
      if (!window.confirm(`Restore ${recordCount.toLocaleString()} records across ${Object.keys(valid.tables).length} core tables? This replaces ALL core local business data in this browser profile. Download a fresh backup first if you need one.`)) return;
      const result = await restoreLocalDatabaseBackup(valid);
      await refreshWorkspaces(); await refreshSnapshot();
      toast.success('Local database restored', { description: `${result.recordsRestored} records restored across ${result.tablesRestored} tables. Refresh the app if the selected business has changed.` });
    } catch (error) { toast.error('Restore was not completed', { description: error instanceof Error ? error.message : 'The backup file was invalid.' }); }
    finally { setBusy(false); }
  }

  async function handleCsvImport(event: ChangeEvent<HTMLInputElement>, kind: 'products' | 'stock'): Promise<void> {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const contents = await file.text();
      const count = kind === 'products'
        ? await importProductsCsv(workspace.id, workspace.currency, contents)
        : await importOpeningStockCsv(workspace.id, branch.id, contents);
      await refreshSnapshot();
      toast.success(kind === 'products' ? 'Products imported' : 'Opening stock imported', { description: `${count} validated rows were imported in one IndexedDB transaction.` });
    } catch (error) { toast.error('CSV import rejected', { description: error instanceof Error ? error.message : 'The file did not pass validation. Existing records were left unchanged.' }); }
    finally { setBusy(false); }
  }

  function exportCsv(kind: 'products' | 'sales' | 'returns' | 'payments' | 'stock'): void {
    if (!snapshot) { toast.error('Data is still loading.'); return; }
    const rows = kind === 'products' ? snapshot.products
      : kind === 'sales' ? snapshot.sales
      : kind === 'returns' ? snapshot.returns
      : kind === 'payments' ? snapshot.payments
      : snapshot.movements;
    downloadText(rowsToCsv(rows), `lexa-${kind}-${workspace.id}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    toast.success('CSV export downloaded', { description: `${rows.length} ${kind} records exported. CSV opens in Excel-compatible spreadsheet tools.` });
  }

  async function saveAttachment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!pickedFile) { toast.error('Capture or choose a photo first.'); return; }
    if (!attachmentReference.trim()) { toast.error('Add a product SKU, receipt number or other reference.'); return; }
    if (pickedFile.size > 12 * 1024 * 1024) { toast.error('Photo is larger than 12 MB', { description: 'Choose a smaller image to keep local storage responsive on mobile.' }); return; }
    setBusy(true);
    try {
      const attachment: LocalAttachment = {
        id: safeId('attachment'), workspaceId: workspace.id, branchId: branch.id, reference: attachmentReference.trim(),
        kind: attachmentKind, name: pickedFile.name || `${attachmentKind}-${Date.now()}.jpg`, mimeType: pickedFile.type || 'image/jpeg',
        size: pickedFile.size, capturedAt: new Date().toISOString(), blob: pickedFile,
      };
      await storeAttachment(attachment); setAttachments(await listAttachments(workspace.id)); setPickedFile(null); setAttachmentReference('');
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      toast.success('Photo saved on this device', { description: 'The photo is linked to your reference in local attachment storage; it is not uploaded or synced.' });
    } catch (error) { toast.error('Photo was not saved', { description: error instanceof Error ? error.message : 'The browser could not persist the image.' }); }
    finally { setBusy(false); }
  }

  function openAttachment(attachment: LocalAttachment): void {
    const url = URL.createObjectURL(attachment.blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = attachment.name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const tabs: { id: ToolTab; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'cash-up', label: 'Cash-up' }, { id: 'tax', label: 'Tax & EFRIS' },
    { id: 'data', label: 'Import / backup' }, { id: 'capture', label: 'Search & capture' }, { id: 'profile', label: 'Business profile' },
  ];
  const currentCashUp = cashUps.find((item) => item.workspaceId === workspace.id && item.branchId === branch.id && item.date === cashDate);

  return (
    <div className="page-stack business-tools-page">
      <div className="page-heading-row">
        <div><div className="eyebrow">WORKSPACE TOOLS</div><h2>Business tools</h2><p style={{ margin: '6px 0 0', color: '#64748b', maxWidth: 720 }}>Local cash-up, compliance guidance, data recovery and mobile capture for {workspace.businessName} · {branch.name}.</p></div>
        <button className="button button-secondary" onClick={() => { setUiMode((old) => old === 'simple' ? 'advanced' : 'simple'); }}><Smartphone size={15} /> {uiMode === 'simple' ? 'Switch to Advanced' : 'Switch to Simple'}</button>
      </div>

      <div role="tablist" aria-label="Business tools sections" style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'button button-primary' : 'button button-secondary'} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>

      {tab === 'overview' && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <div className="section-card" style={{ padding: 18 }}><div style={{ color: '#64748b', fontSize: 12 }}>Active catalogue records</div><strong style={{ display: 'block', fontSize: 25, marginTop: 8 }}>{snapshot?.products.filter((product) => product.active).length ?? '—'}</strong><span style={{ color: '#64748b', fontSize: 11 }}>Core product repository</span></div>
          <div className="section-card" style={{ padding: 18 }}><div style={{ color: '#64748b', fontSize: 12 }}>Recorded sales · rolling 12 months</div><strong style={{ display: 'block', fontSize: 22, marginTop: 8 }}>{formatter(rollingTurnoverMinor)}</strong><span style={{ color: '#64748b', fontSize: 11 }}>Less recorded sales returns</span></div>
          <div className="section-card" style={{ padding: 18 }}><div style={{ color: '#64748b', fontSize: 12 }}>Cash-up status · {cashDate}</div><strong style={{ display: 'block', fontSize: 20, marginTop: 8 }}>{currentCashUp ? (currentCashUp.varianceMinor === 0 ? 'Reconciled' : 'Variance noted') : 'Not yet saved'}</strong><span style={{ color: '#64748b', fontSize: 11 }}>Browser-local till comparison</span></div>
          <div className="section-card" style={{ padding: 18 }}><div style={{ color: '#64748b', fontSize: 12 }}>EFRIS review signal</div><strong style={{ display: 'block', fontSize: 20, marginTop: 8 }}>{efrisPossible ? 'Review applicability' : 'Profile review'}</strong><span style={{ color: '#64748b', fontSize: 11 }}>Not a compliance determination</span></div>
        </div>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Activity size={18} /></div><div><h3>Quick actions</h3><p>Pick the task you need now.</p></div></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', gap: 12, padding: '0 20px 20px' }}>
          <button className="button button-secondary" onClick={() => setTab('cash-up')} style={{ minHeight: 64, justifyContent: 'flex-start' }}><Wallet size={18} /> Record end-of-day cash-up <ArrowRight size={15} /></button>
          <button className="button button-secondary" onClick={() => setTab('tax')} style={{ minHeight: 64, justifyContent: 'flex-start' }}><ShieldCheck size={18} /> Review tax guidance <ArrowRight size={15} /></button>
          <button className="button button-secondary" onClick={() => setTab('data')} style={{ minHeight: 64, justifyContent: 'flex-start' }}><DatabaseBackup size={18} /> Back up or restore data <ArrowRight size={15} /></button>
          <button className="button button-secondary" onClick={() => setTab('capture')} style={{ minHeight: 64, justifyContent: 'flex-start' }}><Barcode size={18} /> Search / scan / add photo <ArrowRight size={15} /></button>
        </div></section>
        <div className="local-disclaimer"><span className="disclaimer-icon"><AlertTriangle size={16} /></span><div><strong>Local-first capability notice</strong><span>These tools persist on this browser/device. They do not synchronize across users, process payments, submit EFRIS documents, or enforce server-side permissions.</span></div></div>
      </>}

      {tab === 'cash-up' && <>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Wallet size={18} /></div><div><h3>End-of-day cash-up</h3><p>Expected cash is calculated from recorded cash payment lines for this branch and date.</p></div></div>
          <form onSubmit={saveCashUp} style={{ padding: '0 22px 22px', display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 13 }}>
              <label className="field-label">Branch / outlet<input value={branch.name} readOnly /></label>
              <label className="field-label">Cash-up date<input type="date" value={cashDate} onChange={(event) => setCashDate(event.target.value)} required /></label>
              <label className="field-label">Opening float ({workspace.currency})<input inputMode="decimal" type="number" min="0" step={workspace.currency === 'UGX' ? '1' : '0.01'} value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} required /></label>
              <label className="field-label">Other cash in ({workspace.currency})<input inputMode="decimal" type="number" min="0" step={workspace.currency === 'UGX' ? '1' : '0.01'} value={otherCashIn} onChange={(event) => setOtherCashIn(event.target.value)} required /></label>
              <label className="field-label">Other cash out ({workspace.currency})<input inputMode="decimal" type="number" min="0" step={workspace.currency === 'UGX' ? '1' : '0.01'} value={otherCashOut} onChange={(event) => setOtherCashOut(event.target.value)} required /></label>
              <label className="field-label">Counted cash ({workspace.currency})<input inputMode="decimal" type="number" min="0" step={workspace.currency === 'UGX' ? '1' : '0.01'} value={countedCash} onChange={(event) => setCountedCash(event.target.value)} required /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              <div style={{ padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}><span style={{ color: '#64748b', fontSize: 12 }}>Recorded cash receipts</span><strong style={{ display: 'block', fontSize: 19, marginTop: 5 }}>{formatter(cashReceiptsMinor)}</strong></div>
              <div style={{ padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}><span style={{ color: '#64748b', fontSize: 12 }}>Recorded cash refunds</span><strong style={{ display: 'block', fontSize: 19, marginTop: 5 }}>{formatter(cashRefundsMinor)}</strong></div>
              <div style={{ padding: 16, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12 }}><span style={{ color: '#1d4ed8', fontSize: 12 }}>Expected cash</span><strong style={{ display: 'block', fontSize: 21, marginTop: 5 }}>{formatter(Math.round(expectedCashMinor))}</strong></div>
              <div style={{ padding: 16, background: varianceMinor === null ? '#f8fafc' : varianceMinor === 0 ? '#f0fdf4' : '#fff7ed', border: `1px solid ${varianceMinor === null ? '#e2e8f0' : varianceMinor === 0 ? '#bbf7d0' : '#fed7aa'}`, borderRadius: 12 }}><span style={{ color: '#64748b', fontSize: 12 }}>Variance (counted − expected)</span><strong style={{ display: 'block', fontSize: 21, marginTop: 5 }}>{varianceMinor === null ? 'Enter count' : formatter(Math.round(varianceMinor))}</strong></div>
            </div>
            {varianceMinor !== null && varianceMinor !== 0 && <label className="field-label">Variance explanation (required)<textarea rows={2} value={cashReason} onChange={(event) => setCashReason(event.target.value)} placeholder="For example: float used to buy supplies; recount completed" /></label>}
            <div className="warning-note"><strong>Scope:</strong> this calculation includes opening float, cash receipts/refunds recorded in sale payments, and the two other-cash fields you enter. It does not automatically include expenses, transfers, owner drawings, or MoMo/Airtel/bank wallet statements. Compare those separately.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="button button-primary" type="submit"><Check size={16} /> Save cash-up</button><button className="button button-secondary" type="button" onClick={() => { const text = `${workspace.businessName} — ${branch.name} cash-up ${cashDate}\nExpected: ${formatter(Math.round(expectedCashMinor))}\nCounted: ${countedCashMinor === null ? 'not entered' : formatter(Math.round(countedCashMinor))}\nVariance: ${varianceMinor === null ? 'not calculated' : formatter(Math.round(varianceMinor))}\nLocal record only; compare other accounts separately.`; if (navigator.share) void navigator.share({ title: 'LEXA cash-up', text }).catch(() => undefined); else downloadText(text, `lexa-cash-up-${cashDate}.txt`); }}><Smartphone size={15} /> Share summary</button><button className="button button-secondary" type="button" onClick={() => window.print()}><Printer size={15} /> Print</button></div>
          </form>
        </section>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><History size={18} /></div><div><h3>Saved cash-ups</h3><p>Local cash-up snapshots for this workspace.</p></div></div><div style={{ padding: '0 22px 20px', overflowX: 'auto' }}>{cashUps.filter((item) => item.workspaceId === workspace.id && item.branchId === branch.id).sort((a,b) => b.date.localeCompare(a.date)).length === 0 ? <p style={{ color: '#64748b' }}>No cash-ups saved yet.</p> : <table style={{ width: '100%', minWidth: 500, borderCollapse: 'collapse' }}><thead><tr>{['Date','Expected','Counted','Variance','Result'].map((label)=><th key={label} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e2e8f0', fontSize: 11 }}>{label}</th>)}</tr></thead><tbody>{cashUps.filter((item) => item.workspaceId === workspace.id && item.branchId === branch.id).sort((a,b) => b.date.localeCompare(a.date)).slice(0,12).map((item)=><tr key={item.date}>{[item.date,formatter(item.expectedCashMinor),formatter(item.countedCashMinor),formatter(item.varianceMinor),item.varianceMinor===0?'Reconciled':'Variance noted'].map((value,index)=><td key={index} style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>{value}</td>)}</tr>)}</tbody></table>}</div></section>
      </>}

      {tab === 'tax' && <>
        <div className="warning-note" style={{ alignItems: 'flex-start' }}><ShieldCheck size={18} /><div><strong>Compliance guidance — not tax advice</strong><p style={{ margin: '5px 0 0' }}>The thresholds below were transcribed from the supplied engineering concept, which says its tax facts were not retrieved directly from URA and must be confirmed before reliance or final encoding. You can maintain the rule values and source/effective-date here; this page does not call URA or submit an e-invoice.</p></div></div>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Building2 size={18} /></div><div><h3>Business tax profile & maintained rules</h3><p>Stored on this device for the selected business.</p></div></div>
          <form onSubmit={saveTaxProfile} style={{ padding: '0 22px 22px', display: 'grid', gap: 15 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 13 }}>
              <label className="field-label">TIN (manual reference)<input value={profile.tin} onChange={(event) => setProfile({ ...profile, tin: event.target.value })} placeholder="Enter business TIN if applicable" /></label>
              <label className="field-label">Business sector<select value={profile.sector} onChange={(event) => setProfile({ ...profile, sector: event.target.value })}>{TAX_SECTORS.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
              <label className="field-label">VAT registration status<select value={profile.vatRegistered ? 'yes' : 'no'} onChange={(event) => setProfile({ ...profile, vatRegistered: event.target.value === 'yes' })}><option value="no">Not registered / unsure</option><option value="yes">VAT registered</option></select></label>
              <label className="field-label">EFRIS applicability override<select value={profile.efrisOverride} onChange={(event) => setProfile({ ...profile, efrisOverride: event.target.value as TaxProfile['efrisOverride'] })}><option value="auto">Use provisional signal</option><option value="yes">Manual review says applies</option><option value="no">Manual review says does not apply</option></select></label>
              <label className="field-label">VAT rolling turnover threshold (UGX, as per concept)<input type="number" min="1" value={profile.vatThreshold} onChange={(event) => setProfile({ ...profile, vatThreshold: event.target.value })} required /></label>
              <label className="field-label">Reported EFRIS sector turnover carve-out (UGX, as per concept)<input type="number" min="1" value={profile.efrisTurnoverThreshold} onChange={(event) => setProfile({ ...profile, efrisTurnoverThreshold: event.target.value })} required /></label>
              <label className="field-label">Effective from<input type="date" value={profile.ruleEffectiveFrom} onChange={(event) => setProfile({ ...profile, ruleEffectiveFrom: event.target.value })} required /></label>
              <label className="field-label">Rule source / verification note<textarea rows={2} value={profile.ruleSource} onChange={(event) => setProfile({ ...profile, ruleSource: event.target.value })} required /></label>
            </div>
            <button type="submit" className="button button-primary"><Check size={15} /> Save tax profile</button>
          </form>
        </section>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Activity size={18} /></div><div><h3>Rolling 12-month recorded turnover</h3><p>Sales across this business's local branches, less recorded sale returns.</p></div></div><div style={{ padding: '0 22px 22px', display: 'grid', gap: 12 }}>
          <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}><span style={{ fontSize: 12, color: '#64748b' }}>Recorded turnover proxy · rolling 365 days</span><strong style={{ display: 'block', fontSize: 25, margin: '5px 0' }}>{formatter(rollingTurnoverMinor)}</strong><span style={{ color: '#64748b', fontSize: 11 }}>Gross {formatter(rollingGrossMinor)} less recorded returns {formatter(rollingReturnsMinor)}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}><div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 10 }}><strong>VAT threshold monitor</strong><p style={{ margin: '6px 0', fontSize: 20 }}>{taxCurrencySupported ? `${Math.round(rollingTurnoverMinor / vatThresholdMinor * 100)}% of configured threshold` : 'UGX conversion required'}</p><div style={{ height: 7, background: '#e2e8f0', borderRadius: 20, overflow: 'hidden' }}><div style={{ height: '100%', width: `${taxCurrencySupported ? Math.min(100, rollingTurnoverMinor / vatThresholdMinor * 100) : 0}%`, background: rollingTurnoverMinor >= vatThresholdMinor * 0.8 ? '#d97706' : '#2563eb' }} /></div><p style={{ margin: '7px 0 0', color: '#64748b', fontSize: 11 }}>Provisional threshold: UGX {vatThresholdMinor.toLocaleString('en-UG')}. {taxCurrencySupported ? 'Verify effective rules and taxable-turnover basis with URA / a qualified adviser.' : 'This workspace is not UGX-denominated; the screen does not convert foreign-currency sales into UGX.'}</p></div>
            <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 10 }}><strong>EFRIS sector review</strong><p style={{ margin: '6px 0', fontSize: 20 }}>{efrisPossible ? 'Review likely required' : 'Review profile and rule'}</p><p style={{ margin: 0, color: '#64748b', fontSize: 11 }}>{profile.vatRegistered ? 'VAT registration has been flagged by your profile.' : vatThresholdSignal ? 'Recorded turnover crossed the configured VAT threshold; verify VAT registration and related EFRIS obligations.' : efrisPossibleBySector ? 'Sector and turnover crossed the configurable signal from the concept.' : 'The provisional sector/turnover signal did not trigger; this does not prove no obligation exists.'}</p></div></div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 11 }}>This is a turnover proxy derived from local sale and return records. VAT/EFRIS signals are evaluated only for UGX workspaces unless you convert turnover yourself; no foreign-exchange rates are applied. It does not determine taxable turnover, tax liability, legal sector coverage, exceptions or penalties.</p>
        </div></section>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><FileText size={18} /></div><div><h3>Manual EFRIS / supplier document register</h3><p>Keep entered references together; no external request is sent.</p></div></div><form onSubmit={saveComplianceNote} style={{ padding: '0 22px 20px', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: 12 }}><label className="field-label">Document type<select value={documentType} onChange={(event)=>setDocumentType(event.target.value)}><option>Sales invoice</option><option>Sales receipt</option><option>Purchase invoice</option><option>Expense receipt</option></select></label><label className="field-label">Internal reference<input value={internalReference} onChange={(event)=>setInternalReference(event.target.value)} placeholder="INV-001 / receipt ref" required /></label><label className="field-label">FDN / supplier e-document reference<input value={fdn} onChange={(event)=>setFdn(event.target.value)} placeholder="Enter manually; optional" /></label><label className="field-label">Document status<select value={fdnStatus} onChange={(event)=>setFdnStatus(event.target.value)}><option>Pending</option><option>Recorded</option><option>Not required</option><option>Missing</option><option>None available</option><option>Needs verification</option></select></label></div>
          <label className="field-label">Notes<textarea value={complianceNoteText} onChange={(event)=>setComplianceNoteText(event.target.value)} rows={2} placeholder="Supplier evidence, verification date, exception or follow-up" /></label>
          <button type="submit" className="button button-primary"><Check size={15} /> Save manual reference</button>
        </form><div style={{ padding: '0 22px 22px', overflowX: 'auto' }}>{complianceNotes.length === 0 ? <p style={{ color: '#64748b' }}>No manual tax references saved for this business yet.</p> : <table style={{ width: '100%', minWidth: 580, borderCollapse: 'collapse' }}><thead><tr>{['Date','Type','Internal ref','FDN / supplier ref','Status'].map((label)=><th key={label} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0', fontSize: 11 }}>{label}</th>)}</tr></thead><tbody>{complianceNotes.slice(0,20).map((note)=><tr key={note.id}>{[note.date,note.documentType,note.internalReference,note.fdn || '—',note.status].map((value,index)=><td key={index} style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>{value}</td>)}</tr>)}</tbody></table>}</div></section>
      </>}

      {tab === 'data' && <>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><DatabaseBackup size={18} /></div><div><h3>Core database backup & restore</h3><p>Versioned JSON backup of all current core IndexedDB tables.</p></div></div><div style={{ padding: '0 22px 22px', display: 'grid', gap: 13 }}><div className="warning-note"><AlertTriangle size={17} /><span>Restore replaces all core records in this browser's LEXA database, across every local workspace. Download a backup first. This core backup does not include separate photo attachments, tool preferences or module-preview datasets.</span></div><div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}><button className="button button-primary" disabled={busy} onClick={() => void handleBackup()}><Download size={15} /> Download full core backup</button><button className="button button-secondary" disabled={busy} onClick={() => backupImportRef.current?.click()}><Upload size={15} /> Validate / restore backup</button><input ref={backupImportRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(event) => void handleBackupFile(event)} /></div><p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>Restore validates all expected table names, array shapes and duplicate IDs before making changes; it then restores all core tables in one IndexedDB transaction. Keep a copy outside this device.</p></div></section>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><FileSpreadsheet size={18} /></div><div><h3>CSV export (Excel-compatible)</h3><p>Export current core records for analysis or external backup.</p></div></div><div style={{ padding: '0 22px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>{[
          ['products','Products'],['sales','Sales'],['returns','Sales returns'],['payments','Payment lines'],['stock','Stock movements'],
        ].map(([kind,label])=><button key={kind} className="button button-secondary" onClick={()=>exportCsv(kind as 'products'|'sales'|'returns'|'payments'|'stock')}><Download size={14} /> Export {label}</button>)}</div></section>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Upload size={18} /></div><div><h3>Import products / opening stock from CSV</h3><p>Each import is validated before writing and committed in one IndexedDB transaction.</p></div></div><div style={{ padding: '0 22px 22px', display: 'grid', gap: 14 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}><div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 10 }}><strong>Product CSV</strong><p style={{ color: '#64748b', fontSize: 12 }}>Required headers: name, sku, sellingPrice. Optional: barcode, brand, unitOfMeasure, categoryName, costPrice, lowStockThreshold, trackStock. Prices use the selected currency's major units unless the column ends in Minor.</p><button className="button button-primary" disabled={busy} onClick={()=>productImportRef.current?.click()}><Upload size={14} /> Select product CSV</button><input ref={productImportRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={(event)=>void handleCsvImport(event,'products')} /></div><div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 10 }}><strong>Opening stock CSV</strong><p style={{ color: '#64748b', fontSize: 12 }}>Required headers: sku, quantity. Optional: reason. Opening quantities must be positive whole numbers and can only be imported for products/branches with no earlier movements.</p><button className="button button-primary" disabled={busy} onClick={()=>stockImportRef.current?.click()}><Upload size={14} /> Select stock CSV</button><input ref={stockImportRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={(event)=>void handleCsvImport(event,'stock')} /></div></div><p style={{ margin: 0, color: '#64748b', fontSize: 11 }}>Customer/supplier opening balances and the broader preview-module data use their own records and import workflow; they are not merged into core customer/payables ledgers here.</p></div></section>
      </>}

      {tab === 'capture' && <>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Search size={18} /></div><div><h3>Universal search · core records</h3><p>Search product names, SKUs, barcodes, brands, receipt numbers and customer names currently saved in this browser.</p></div></div><div style={{ padding: '0 22px 22px', display: 'grid', gap: 14 }}><label className="field-label">Search<input value={searchValue} onChange={(event)=>setSearchValue(event.target.value)} placeholder="Product, SKU, barcode, customer or receipt number" /></label>{searchValue.trim() && <><p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>{matchesCount} result(s) from core products and sales.</p><div style={{ display: 'grid', gap: 8 }}>{matchedProducts.map((product)=> <div key={product.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #e2e8f0', borderRadius: 9 }}><div><strong>{product.name}</strong><div style={{ color: '#64748b', fontSize: 12 }}>SKU {product.sku} · barcode {product.barcode || '—'} · {product.active ? 'Active' : 'Inactive'}</div></div><button className="button button-secondary" onClick={()=>navigate('/products')}><ArrowRight size={14} /> Open products</button></div>)}{matchedSales.map((sale)=> <div key={sale.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #e2e8f0', borderRadius: 9 }}><div><strong>{sale.receiptNumber}</strong><div style={{ color: '#64748b', fontSize: 12 }}>{sale.customerName || 'Walk-in customer'}{sale.customerPhone ? ` · ${sale.customerPhone}` : ''} · {new Date(sale.createdAt).toLocaleString()} · {formatMinorAmount(sale.totalMinor,workspace.currency)}</div></div><button className="button button-secondary" onClick={()=>navigate('/sales/'+sale.id)}><ArrowRight size={14} /> Open receipt</button></div>)}</div></>}</div></section>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Barcode size={18} /></div><div><h3>Camera barcode scanner</h3><p>Uses the device camera when supported and permission is granted.</p></div></div><div style={{ padding: '0 22px 22px', display: 'grid', gap: 12 }}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="button button-primary" onClick={()=>void startCamera()} disabled={cameraOpen}><Camera size={15} /> Start live scanner</button><button className="button button-secondary" onClick={stopCamera} disabled={!cameraOpen}><X size={15} /> Stop camera</button></div>{cameraOpen && <video ref={videoRef} muted playsInline style={{ width: '100%', maxHeight: 360, background: '#0f172a', borderRadius: 10, objectFit: 'cover' }} />}{cameraMessage && <div className="warning-note"><span>{cameraMessage}</span></div>}<label className="field-label">Barcode / code captured<input value={scanValue} onChange={(event)=>{setScanValue(event.target.value);setSearchValue(event.target.value);}} placeholder="Scan or type a code" /></label><button className="button button-secondary" onClick={()=>{setSearchValue(scanValue);setTab('capture');}}><Search size={14} /> Search code in products</button><p style={{ margin: 0, color: '#64748b', fontSize: 11 }}>Live detection depends on the browser's BarcodeDetector support. Nothing is sent to an external service.</p></div></section>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Camera size={18} /></div><div><h3>Product / receipt photo capture</h3><p>Attach a photo to an internal reference; saved in separate browser-local attachment storage.</p></div></div><form onSubmit={(event)=>void saveAttachment(event)} style={{ padding: '0 22px 20px', display: 'grid', gap: 12 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}><label className="field-label">Attachment type<select value={attachmentKind} onChange={(event)=>setAttachmentKind(event.target.value as LocalAttachment['kind'])}><option value="receipt">Receipt / supplier document</option><option value="product">Product photo</option><option value="other">Other evidence</option></select></label><label className="field-label">Reference (SKU / invoice / receipt)<input value={attachmentReference} onChange={(event)=>setAttachmentReference(event.target.value)} required placeholder="For example, SKU-001 or RCPT-100" /></label></div><label className="field-label">Capture photo / choose image<input ref={attachmentInputRef} type="file" accept="image/*" capture="environment" onChange={(event)=>setPickedFile(event.target.files?.[0] ?? null)} /></label>{pickedFile && <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{pickedFile.name} · {(pickedFile.size / 1024).toFixed(0)} KB</p>}<button className="button button-primary" type="submit" disabled={busy || !pickedFile}><Camera size={15} /> Save photo locally</button></form><div style={{ padding: '0 22px 22px' }}><strong>Recent photo attachments</strong>{attachments.length===0 ? <p style={{ color:'#64748b',fontSize:12 }}>No photo attachments saved in this browser yet.</p> : <div style={{ display:'grid', gap:8, marginTop:10 }}>{attachments.map((item)=><div key={item.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:10, border:'1px solid #e2e8f0', borderRadius:9 }}><div><strong>{item.reference}</strong><div style={{ color:'#64748b',fontSize:11 }}>{item.kind} · {item.name} · {new Date(item.capturedAt).toLocaleString()}</div></div><button className="button button-secondary" onClick={()=>openAttachment(item)}><Download size={14} /> Download</button></div>)}</div>}</div></section>
      </>}

      {tab === 'profile' && <>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Building2 size={18} /></div><div><h3>Extended local business profile</h3><p>Supplemental local fields not currently stored in the core workspace schema.</p></div></div><form onSubmit={saveTaxProfile} style={{ padding: '0 22px 22px', display: 'grid', gap: 13 }}><label className="field-label">Business name<input value={workspace.businessName} readOnly /></label><label className="field-label">TIN / registration reference<input value={profile.tin} onChange={(event)=>setProfile({...profile,tin:event.target.value})} placeholder="Business TIN (if applicable)" /></label><label className="field-label">VAT registration status<select value={profile.vatRegistered?'yes':'no'} onChange={(event)=>setProfile({...profile,vatRegistered:event.target.value==='yes'})}><option value="no">Not registered / unsure</option><option value="yes">VAT registered</option></select></label><label className="field-label">Sector<select value={profile.sector} onChange={(event)=>setProfile({...profile,sector:event.target.value})}>{TAX_SECTORS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className="button button-primary" type="submit"><Check size={15} /> Save profile</button></form></section>
        <section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Smartphone size={18} /></div><div><h3>Interface preferences</h3><p>Simple mode keeps the primary tasks visible; advanced mode restores all navigation sections.</p></div></div><div style={{ padding:'0 22px 22px', display:'flex', gap:10, flexWrap:'wrap' }}><button className={uiMode==='simple'?'button button-primary':'button button-secondary'} onClick={()=>setUiMode('simple')}>Simple mode</button><button className={uiMode==='advanced'?'button button-primary':'button button-secondary'} onClick={()=>setUiMode('advanced')}>Advanced mode</button></div></section>
      </>}

      {snapshotQuery.isLoading && <div className="local-disclaimer"><RefreshCw size={15} /> Loading local business records…</div>}
      {snapshotQuery.isError && <div className="warning-note"><AlertTriangle size={16} /> Could not read business records. {snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'Please refresh and retry.'}</div>}
      <div className="local-disclaimer"><span className="disclaimer-icon"><Clock3 size={16} /></span><div><strong>Storage and trust boundary</strong><span>Core records are stored in browser IndexedDB. Cash-up entries, tax profile and manual document notes use local browser storage; photo attachments use a separate local IndexedDB database. None of this is shared with staff or other devices, and local activity notes are not tamper-resistant audit records.</span></div></div>
    </div>
  );
}
