import { BusinessAssortmentSelector, useBusinessAssortment } from '../../components/business/BusinessAssortmentSelector';
import { apiCatalogInventory } from '../../data/remote/apiWorkstream03';
import { dataProviderMode } from '../../data/remote/runtimeConfig';
import AdaptiveProductFields, { CategoryManager, ProductVariantsManager, ProductPackagingManager } from './AdaptiveProductFields';
import {DeviceBrandModelSelector,AccessoryCompatibilityManager} from './DeviceCatalogExperiences';
import ElectronicsCatalogueDirectory from './ElectronicsCatalogueDirectory';
import {ElectronicsProductIdentityAndPackages} from './ElectronicsStockOperations';
import { initialProductPreset, validateProductDraft, presetFor, CATALOGUE_VERSION } from '../../domain/catalog/industryCatalog';
import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Edit3, Package, Plus, Power, Search, X } from '../../components/LexaIcon';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { inventory, products } from '../../data/repositories';
import { formatMinorAmount, minorUnitFactor, parseMajorAmount } from '../../domain/money/money';
import type { Product } from '../../domain/shared/types';
import { StandardDataTable, type DataTableColumn } from '../../components/tables/StandardDataTable';
import { BarcodeCapture } from '../../components/barcode/BarcodeCapture';
import {InventoryFrame} from '../inventory/InventoryFrame';
import ProductDivisionsPanel from './ProductDivisionsPanel';
import InventoryIntelligencePanel from '../inventory/InventoryIntelligencePanel';

type ProductForm = {
  name: string; sku: string; barcode: string; brand: string; catalogBrandId:string;catalogModelId:string; unitOfMeasure: string; supplierSku: string; categoryName: string; categoryId: string; productType: string; attributes: Record<string,string>; costPrice: string; sellingPrice: string; lowStockThreshold: string; trackStock: boolean; trackLot:boolean;trackSerial:boolean;
};
const blankForm: ProductForm = { name: '', sku: '', barcode: '', brand: '', catalogBrandId:'',catalogModelId:'', unitOfMeasure: 'Each', supplierSku: '', categoryName: '', categoryId:'', productType:'general', attributes:{}, costPrice: '0', sellingPrice: '', lowStockThreshold: '3', trackStock: true, trackLot:false,trackSerial:false };

export default function ProductsPage() {
  const { workspace, branch } = useWorkspace();
  const assortment=useBusinessAssortment(workspace.id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [statusFilter, setStatusFilter] = useState('All products');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(blankForm);
  const [saving, setSaving] = useState(false);
  const [formStep,setFormStep] = useState<1|2|3>(1);

  const productQuery = useQuery({ queryKey: ['products', workspace.id], queryFn: () => products.list({ workspaceId: workspace.id, activeOnly: false }) });
  const identitySearch = useQuery({queryKey:['catalogue-identity-search',workspace.id,search.trim()],queryFn:()=>apiCatalogInventory.searchProductsByIdentity(workspace.id,search.trim()),enabled:dataProviderMode==='api'&&search.trim().length>=2,staleTime:30000,retry:0});
  const categoryQuery = useQuery({ queryKey: ['categories', workspace.id], queryFn: () => products.listCategories(workspace.id) });
  const businessQuery = useQuery({queryKey:['industry-catalogue',workspace.id],queryFn:()=>apiCatalogInventory.industryConfig(workspace.id),enabled:dataProviderMode==='api',staleTime:120000,retry:0});
  const unitsQuery = useQuery({queryKey:['catalog-units',workspace.id],queryFn:()=>apiCatalogInventory.units(workspace.id),enabled:dataProviderMode==='api',staleTime:120000,retry:0});
  const balanceQuery = useQuery({ queryKey: ['inventory-balances', workspace.id, branch.id], queryFn: () => inventory.getBalances({ workspaceId: workspace.id, branchId: branch.id }) });
  const categoryMap = useMemo(() => new Map((categoryQuery.data ?? []).map((item) => [item.id, item.name])), [categoryQuery.data]);
  const filteredProducts = useMemo(() => {
    const all = productQuery.data ?? [];
    const query = search.trim().toLocaleLowerCase();
    const matchedIdentifiers=new Set((identitySearch.data??[]).map(item=>item.id));
    return all.filter((item) => {
      const matchesSearch = !query || item.name.toLocaleLowerCase().includes(query) || item.sku.toLocaleLowerCase().includes(query) || (item.barcode ?? '').toLocaleLowerCase().includes(query) || (item.brand ?? '').toLocaleLowerCase().includes(query) || (item.supplierSku ?? '').toLocaleLowerCase().includes(query) || matchedIdentifiers.has(item.id);
      const category = item.categoryId ? (categoryMap.get(item.categoryId) ?? 'Uncategorised') : 'Uncategorised';
      const matchesCategory = categoryFilter === 'All categories' || category === categoryFilter;
      const matchesStatus = statusFilter === 'All products' || (statusFilter === 'Active only' ? item.active : !item.active);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [productQuery.data, identitySearch.data, search, categoryFilter, statusFilter, categoryMap]);

  function openNew() {const selected=initialProductPreset(businessQuery.data?.industries??[],assortment.focus?[assortment.focus.code]:businessQuery.data?.subActivityCodes??[]);setEditing(null);setFormStep(1);setForm({...blankForm,productType:selected.key,unitOfMeasure:selected.unit,trackStock:selected.stock!=='none',trackLot:selected.stock==='batch',trackSerial:selected.stock==='serial'});setFormOpen(true);}
  function openEdit(product: Product) {
    setEditing(product);setFormStep(1);
    setForm({ name: product.name, sku: product.sku, barcode: product.barcode ?? '', brand: product.brand ?? '', catalogBrandId:product.catalogBrandId??'',catalogModelId:product.catalogModelId??'', unitOfMeasure: product.unitOfMeasure ?? 'Each', supplierSku: product.supplierSku ?? '', categoryName: product.categoryId ? (categoryMap.get(product.categoryId) ?? '') : '', categoryId:product.categoryId??'', productType:product.productType??'general', attributes:Object.fromEntries(Object.entries(product.attributes??{}).map(([key,value])=>[key,String(value)])), costPrice: String(product.costPriceMinor / factor()), sellingPrice: String(product.sellingPriceMinor / factor()), lowStockThreshold: String(product.lowStockThreshold), trackStock: product.trackStock, trackLot:product.trackLot??false, trackSerial:product.trackSerial??false });
    setFormOpen(true);
  }
  function factor() { return minorUnitFactor(workspace.currency); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      if(dataProviderMode==='api'&&businessQuery.data?.schemaVersion!==CATALOGUE_VERSION)throw new Error('Industry catalogue is not yet synchronized. Reload this page after the backend upgrade.');
      if(form.trackLot&&!form.trackStock)throw new Error('Batch tracking needs stock tracking.');
      if(form.trackSerial&&!form.trackStock)throw new Error('Serial tracking needs stock tracking.');
      if(!editing||form.productType!==editing.productType){const problems=validateProductDraft(form.productType,form.attributes,{trackStock:form.trackStock,trackLot:form.trackLot,trackSerial:form.trackSerial},businessQuery.data?.industries??[]);if(problems.length)throw new Error(problems.join(' '));}
      const costPriceMinor = parseMajorAmount(form.costPrice, workspace.currency);
      const sellingPriceMinor = parseMajorAmount(form.sellingPrice, workspace.currency);
      const lowStockThreshold = Number(form.lowStockThreshold);
      if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) throw new Error('Low-stock threshold must be a whole number of zero or more.');
      const barcode = form.barcode.trim();
      const brand = form.brand.trim();
      const catalogBrandId=form.catalogBrandId||undefined,catalogModelId=form.catalogModelId||undefined;
      const supplierSku = form.supplierSku.trim();
      const unitOfMeasure = form.unitOfMeasure.trim() || 'Each';
      if (editing) {
        const nextProduct: Product = { ...editing, name: form.name, sku: form.sku, ...(catalogBrandId?{catalogBrandId}:{}),...(catalogModelId?{catalogModelId}:{}), unitOfMeasure, costPriceMinor, sellingPriceMinor, lowStockThreshold, trackStock: form.trackStock,trackLot:form.trackLot,trackSerial:form.trackSerial,productType:form.productType,attributes:form.attributes,...(form.categoryId?{categoryId:form.categoryId}:{}), updatedAt: new Date().toISOString() };
        if (!form.categoryId) delete nextProduct.categoryId;
        if (!catalogBrandId) delete nextProduct.catalogBrandId;
        if (!catalogModelId) delete nextProduct.catalogModelId;
        if (barcode) nextProduct.barcode = barcode; else delete nextProduct.barcode;
        if (brand) nextProduct.brand = brand; else delete nextProduct.brand;
        if (supplierSku) nextProduct.supplierSku = supplierSku; else delete nextProduct.supplierSku;
        const updated=await products.update(nextProduct, form.categoryId?'':form.categoryName);
        setEditing(updated);toast.success('Product updated. Continue with variants and stock setup.');
      } else {
        const created=await products.create({ workspaceId: workspace.id, name: form.name, sku: form.sku, ...(barcode ? { barcode } : {}), ...(brand ? { brand } : {}),...(catalogBrandId?{catalogBrandId}:{}),...(catalogModelId?{catalogModelId}:{}), unitOfMeasure, ...(supplierSku ? { supplierSku } : {}), ...(form.categoryId?{categoryId:form.categoryId}:{categoryName:form.categoryName}),productType:form.productType,attributes:form.attributes,costPriceMinor, sellingPriceMinor, lowStockThreshold, trackStock: form.trackStock,trackLot:form.trackLot,trackSerial:form.trackSerial });
        setEditing(created);toast.success('Product saved', { description: 'Now configure variants, packaging and individual identifiers, then receive real stock.' });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products', workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ['categories', workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      ]);
      setFormStep(3);
    } catch (error) {
      toast.error('Could not save product', { description: error instanceof Error ? error.message : 'Check the fields and try again.' });
    } finally { setSaving(false); }
  }

  async function toggleActive(product: Product) {
    try {
      const nextProduct = { ...product, active: !product.active, updatedAt: new Date().toISOString() };
      await products.update(nextProduct, product.categoryId ? (categoryMap.get(product.categoryId) ?? '') : '');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products', workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      ]);
      toast.success(product.active ? 'Product deactivated' : 'Product activated', { description: product.active ? 'It remains in the catalogue but is no longer active for sales.' : 'It is available to the active product workflows again.' });
    } catch (error) {
      toast.error('Could not change product status', { description: error instanceof Error ? error.message : 'Try again.' });
    }
  }


  const visibleProducts = assortment.filter(filteredProducts, item=>item.productType);
  const visibleAllProducts = assortment.filter(productQuery.data??[], item=>item.productType);
  const visibleCategories = ['All categories', ...new Set(visibleAllProducts.map(item => item.categoryId ? categoryMap.get(item.categoryId) ?? 'Uncategorised' : 'Uncategorised'))];
  const productColumns: DataTableColumn<Product>[] = [
    { key: 'name', header: 'Product', cell: (item) => <div className="product-cell"><div className="product-avatar"><Package size={16} /></div><div><strong>{item.name}</strong>{item.productType&&item.productType!=='general'&&<small>{item.productType.replaceAll('_',' ')}</small>}<span>{item.trackStock ? 'Stock tracked' : 'Service / non-stock'}</span></div></div>, sortValue: (item) => item.name, exportValue: (item) => item.name },
    { key: 'sku', header: 'SKU / Barcode', cell: (item) => <><span className="sku-label">{item.sku}</span>{item.barcode && <div className="subtle-line">Barcode: {item.barcode}</div>}</>, sortValue: (item) => `${item.sku} ${item.barcode ?? ''}`, exportValue: (item) => `${item.sku}${item.barcode ? ' / ' + item.barcode : ''}` },
    { key: 'categoryId', header: 'Category', cell: (item) => item.categoryId ? (categoryMap.get(item.categoryId) ?? 'Uncategorised') : 'Uncategorised', sortValue: (item) => item.categoryId ? (categoryMap.get(item.categoryId) ?? 'Uncategorised') : 'Uncategorised', exportValue: (item) => item.categoryId ? (categoryMap.get(item.categoryId) ?? 'Uncategorised') : 'Uncategorised' },
    { key: 'unitOfMeasure', header: 'Unit', cell: (item) => item.unitOfMeasure || 'Each', sortValue: (item) => item.unitOfMeasure || 'Each' },
    { key: 'sellingPriceMinor', header: 'Selling price', cell: (item) => <span className="amount-cell">{formatMinorAmount(item.sellingPriceMinor, workspace.currency)}</span>, sortValue: (item) => item.sellingPriceMinor, exportValue: (item) => formatMinorAmount(item.sellingPriceMinor, workspace.currency) },
    { key: 'onHand', header: 'On hand', cell: (item) => { const stock = balanceQuery.data?.get(item.id) ?? 0; const low = item.trackStock && stock <= item.lowStockThreshold; return <span className={`stock-number ${low ? 'stock-low' : ''}`}>{item.trackStock ? stock : '—'}</span>; }, sortValue: (item) => item.trackStock ? (balanceQuery.data?.get(item.id) ?? 0) : -1, exportValue: (item) => item.trackStock ? (balanceQuery.data?.get(item.id) ?? 0) : '' },
    { key: 'status', header: 'Status', cell: (item) => { const low = item.trackStock && (balanceQuery.data?.get(item.id) ?? 0) <= item.lowStockThreshold; return item.active ? (low ? <span className="status-pill status-warning">Low stock</span> : <span className="status-pill status-good">Active</span>) : <span className="status-pill">Inactive</span>; }, sortValue: (item) => !item.active ? 'Inactive' : item.trackStock && (balanceQuery.data?.get(item.id) ?? 0) <= item.lowStockThreshold ? 'Low stock' : 'Active' },
    { key: 'actions', header: 'Actions', cell: (item) => <div className="product-row-actions"><button className="icon-button table-action" aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}><Edit3 size={16} /></button><button className="icon-button table-action" aria-label={item.active ? `Deactivate ${item.name}` : `Activate ${item.name}`} title={item.active ? 'Deactivate product' : 'Activate product'} onClick={() => void toggleActive(item)}><Power size={15} /></button></div>, exportValue: (item) => item.active ? 'Active' : 'Inactive' },
  ];

  return (
    <InventoryFrame title="Your products" subtitle="The shared catalogue for sales, purchasing, storage, packing and reports." action={<button className="solar-button" onClick={openNew}><Plus size={16}/> Add product</button>}><InventoryIntelligencePanel compact/>
      <BusinessAssortmentSelector workspaceId={workspace.id} context="products"/>
      <ProductDivisionsPanel products={visibleAllProducts}/>
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">PRODUCT CATALOGUE</div><h2>Products</h2><p>Manage the items your team sells and the rules used at checkout.</p></div><button className="button button-primary" onClick={openNew}><Plus size={17} /> Add product</button></div>
      <div className="metric-strip three-metrics"><div className="mini-metric"><span>Products in this view</span><strong>{visibleAllProducts.length}</strong><small>{productQuery.data?.length ?? 0} across the full business</small></div><div className="mini-metric"><span>Stock tracked</span><strong>{visibleAllProducts.filter((item) => item.trackStock && item.active).length}</strong><small>Inventory-managed items</small></div><div className="mini-metric"><span>Low-stock alerts</span><strong className={visibleAllProducts.filter((item) => item.trackStock && (balanceQuery.data?.get(item.id) ?? 0) <= item.lowStockThreshold).length ? 'warning-value' : ''}>{visibleAllProducts.filter((item) => item.trackStock && (balanceQuery.data?.get(item.id) ?? 0) <= item.lowStockThreshold).length}</strong><small>At {branch.name}</small></div></div>

      <section className="section-card table-card">
        <div className="table-toolbar product-table-toolbar"><div><h3>Catalogue</h3><p>{visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'} in this view</p></div><div className="product-table-filters"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, supplier code, GTIN, brand or model" aria-label="Search products" /></label><label className="field-label product-filter-label"><span className="sr-only">Filter by category</span><select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>{visibleCategories.map((option) => <option key={option}>{option}</option>)}</select></label><label className="field-label product-filter-label"><span className="sr-only">Filter by product status</span><select aria-label="Filter by product status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All products</option><option>Active only</option><option>Inactive only</option></select></label></div></div>
        {productQuery.isError ? <div className="inline-error" role="alert"><strong>Could not load products.</strong><span>{productQuery.error instanceof Error ? productQuery.error.message : 'Check the connection and retry.'}</span><button className="button button-secondary button-small" onClick={() => void productQuery.refetch()}>Retry</button></div> : productQuery.isLoading ? <div className="loading-state">Loading products…</div> : visibleProducts.length === 0 ? <div className="empty-state"><div className="empty-icon"><Package size={23} /></div><h3>{search ? 'No matching products' : 'Your catalogue is ready to begin'}</h3><p>{search ? 'Try a different product name or SKU.' : 'Add your first product. Then record opening stock before selling it from checkout.'}</p>{!search && <button className="button button-primary" onClick={openNew}><Plus size={16} /> Add first product</button>}</div> : <StandardDataTable rows={visibleProducts} columns={productColumns} enableSearch={false} rowLabel="products" emptyTitle="Your catalogue is ready to begin" emptyDescription="Add your first product." />}
      </section>

      {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title"><div className="modal-heading"><div><div className="eyebrow eyebrow-blue">PRODUCT DETAILS</div><h3 id="product-form-title">{editing ? 'Edit product' : 'Add a product'}</h3><p>Prices use {workspace.currency}; prices are recorded in the selected currency.</p></div><button className="icon-button" aria-label="Close form" onClick={() => setFormOpen(false)}><X size={19} /></button></div><form onSubmit={submit} className="form-stack">
      <nav className="lexa-product-steps" aria-label="Product creation steps">
        {(['1 · Classify','2 · Prices & tracking','3 · Variants & compatibility'] as const).map((title,index)=><button type="button" key={title} className={formStep===index+1?'lexa-step-active':''} aria-current={formStep===index+1?'step':undefined} disabled={index===2&&!editing} onClick={()=>setFormStep((index+1) as 1|2|3)}>{title}</button>)}
      </nav>
      {formStep===1&&<><div className="lexa-product-hint">Choose what you sell and its category. LEXA will show the relevant fields for your industry. You can refine a category without affecting existing stock.</div><div className="form-two-col"><label className="field-label">Product name <span className="required-mark">*</span><input required autoFocus maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Rice 5kg" /></label><label className="field-label">SKU / internal code <span className="required-mark">*</span><input required maxLength={64} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="e.g. RICE-005" /></label></div><AdaptiveProductFields workspaceId={workspace.id} industries={businessQuery.data?.industries??[]} subActivityCodes={assortment.focus?[assortment.focus.code]:businessQuery.data?.subActivityCodes??[]} categories={categoryQuery.data??[]} productType={form.productType} categoryId={form.categoryId} categoryName={form.categoryName} attributes={form.attributes} onChange={next=>setForm(current=>({...current,...(next.productType!==undefined?{productType:next.productType,...(next.productType!==current.productType?{catalogModelId:''}:{})}:{}),...(next.categoryId!==undefined?{categoryId:next.categoryId}:{}),...(next.categoryName!==undefined?{categoryName:next.categoryName}:{}),...(next.attributes!==undefined?{attributes:next.attributes}:{}),...(next.unit!==undefined?{unitOfMeasure:next.unit}:{}),...(next.tracking!==undefined?{trackStock:next.tracking!=='none',trackSerial:next.tracking==='serial',trackLot:next.tracking==='batch'}:{})}))}/><DeviceBrandModelSelector workspaceId={workspace.id} productType={form.productType} brandId={form.catalogBrandId} modelId={form.catalogModelId} onChange={next=>setForm(current=>({...current,catalogBrandId:next.brandId,catalogModelId:next.modelId,...(next.brandName!==undefined?{brand:next.brandName}:{}),...(next.modelName!==undefined&&presetFor(current.productType).fields.some(f=>f.key==='model')?{attributes:{...current.attributes,model:next.modelName}}:{})}))}/><CategoryManager workspaceId={workspace.id} categories={categoryQuery.data??[]} industries={businessQuery.data?.industries??[]}/><ElectronicsCatalogueDirectory workspaceId={workspace.id} industries={editing?businessQuery.data?.industries??[]:assortment.visibleIndustries} onCategoryChosen={(categoryId,legacyType)=>{if(!legacyType){setForm(current=>({...current,categoryId,categoryName:''}));return;}const selected=presetFor(legacyType);setForm(current=>({...current,categoryId,categoryName:'',productType:legacyType,catalogModelId:'',attributes:{},unitOfMeasure:selected.unit,trackStock:selected.stock!=='none',trackSerial:selected.stock==='serial',trackLot:selected.stock==='batch'}));}}/></>}
      {formStep===3&&<><div className="lexa-product-hint"><strong>Product saved.</strong> Configure sellable variations, purchasing packs and verified accessory fitment here. Receiving physical devices and assembling kits belong in Inventory, after product setup is finished.</div>{editing&&<ProductVariantsManager workspaceId={workspace.id} product={editing} currency={workspace.currency}/>} {editing&&form.trackStock&&<ProductPackagingManager workspaceId={workspace.id} product={editing}/>} {editing&&<AccessoryCompatibilityManager workspaceId={workspace.id} product={editing}/>} {editing&&<ElectronicsProductIdentityAndPackages workspaceId={workspace.id} product={editing}/>} <div className="lexa-product-hint">Ready to receive stock? <a href="/inventory">Open stock control</a> or use Purchasing → Receiving for supplier deliveries.</div></>}
      {formStep===2&&<><div className="lexa-product-hint">Set prices, units of measure and tracking before saving. The server enforces tracking rules for every API client, not just this screen.</div><BarcodeCapture compact label="Scan a barcode into the product record" onCode={(code) => setForm((current) => ({ ...current, barcode: code }))} /><div className="form-two-col"><label className="field-label">Barcode (optional)<input maxLength={80} value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} placeholder="Scan or enter barcode" /></label><label className="field-label">Brand (optional)<input maxLength={80} value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} placeholder="Brand / manufacturer" /></label></div><div className="form-two-col"><label className="field-label">Unit of measure<select value={form.unitOfMeasure} onChange={(event) => setForm({ ...form, unitOfMeasure: event.target.value })}><option>Each</option><option>Piece</option><option>Pair</option><option>Bottle</option><option>Loaf</option><option>Tray</option><option>Pack</option><option>Box</option><option>Carton</option><option>Crate</option><option>Dozen</option><option>Kg</option><option>Gram</option><option>Litre</option><option>Ml</option><option>Metre</option><option>Roll</option><option>Sack</option><option>Bundle</option><option>Service</option><option>Hour</option>{(unitsQuery.data??[]).filter(row=>typeof row.name==='string' && !['Each','Piece','Pair','Bottle','Loaf','Tray','Pack','Box','Carton','Crate','Dozen','Kg','Gram','Litre','Ml','Metre','Roll','Sack','Bundle','Service','Hour'].includes(String(row.name))).map(row=><option key={String(row.id)} value={String(row.name)}>{String(row.name)}</option>)}</select><small className="field-help">Core checkout quantities currently use whole units.</small></label><label className="field-label">Supplier item code (optional)<input maxLength={80} value={form.supplierSku} onChange={(event) => setForm({ ...form, supplierSku: event.target.value })} placeholder="Supplier SKU / catalogue code" /></label></div><div className="form-two-col"><label className="field-label">Cost price ({workspace.currency})<input required inputMode="decimal" min="0" step={factor() === 1 ? '1' : '0.01'} type="number" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} /></label><label className="field-label">Selling price ({workspace.currency}) <span className="required-mark">*</span><input required inputMode="decimal" min="0" step={factor() === 1 ? '1' : '0.01'} type="number" value={form.sellingPrice} onChange={(event) => setForm({ ...form, sellingPrice: event.target.value })} /></label></div><div className="form-two-col"><label className="field-label">Low-stock threshold<input required type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(event) => setForm({ ...form, lowStockThreshold: event.target.value })} /></label><label className="checkbox-field"><input type="checkbox" disabled={form.productType!=='general'} checked={form.trackStock} onChange={(event) => setForm({ ...form, trackStock: event.target.checked, ...(event.target.checked?{}:{trackLot:false,trackSerial:false}) })} /><span><strong>Track inventory</strong><small>Require available stock at checkout</small></span></label><label className="checkbox-field"><input type="checkbox" disabled={presetFor(form.productType).stock==='batch'} checked={form.trackLot}
   onChange={e=>setForm({...form,trackLot:e.target.checked,trackSerial:e.target.checked?form.trackSerial:false,trackStock:e.target.checked?true:form.trackStock})}/><span><strong>Track batches and expiry</strong><small>Recommended for expiry-controlled goods and batches</small></span></label>
   <label className="checkbox-field"><input type="checkbox" disabled={!form.trackStock||presetFor(form.productType).stock==='serial'} checked={form.trackSerial}
    onChange={e=>setForm({...form,trackSerial:e.target.checked})}/><span><strong>Unique serial numbers</strong><small>For phones and individually tracked equipment; no batch required</small></span></label>
   </div></>}
      <div className="form-modal-actions"><button type="button" className="button button-secondary" onClick={() => {setFormOpen(false);setFormStep(1);}}>Close</button>
       {formStep>1&&<button type="button" className="button button-secondary" onClick={()=>setFormStep(formStep===3?2:1)}>Back</button>}
       {formStep===1?<button type="button" className="button button-primary" onClick={()=>{if(!form.name.trim()||!form.sku.trim()){toast.error('Enter product name and SKU before continuing.');return;}setFormStep(2);}}>Continue to prices</button>:
        formStep===2?<button type="submit" className="button button-primary" disabled={saving}>{saving?'Saving…':editing?'Save changes & continue':'Save product & continue'} <Check size={16}/></button>:
        <button type="button" className="button button-primary" onClick={()=>{setFormOpen(false);setFormStep(1);setEditing(null);setForm(blankForm);}}>Finish setup <Check size={16}/></button>}
      </div></form></section></div>}
    </InventoryFrame>
  );
}
