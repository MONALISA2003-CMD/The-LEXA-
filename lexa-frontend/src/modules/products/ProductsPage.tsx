import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Edit3, Package, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { inventory, products } from '../../data/repositories';
import { formatMinorAmount, minorUnitFactor, parseMajorAmount } from '../../domain/money/money';
import type { Product } from '../../domain/shared/types';

type ProductForm = {
  name: string; sku: string; categoryName: string; costPrice: string; sellingPrice: string; lowStockThreshold: string; trackStock: boolean;
};
const blankForm: ProductForm = { name: '', sku: '', categoryName: '', costPrice: '0', sellingPrice: '', lowStockThreshold: '3', trackStock: true };

export default function ProductsPage() {
  const { workspace, branch } = useWorkspace();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(blankForm);
  const [saving, setSaving] = useState(false);

  const productQuery = useQuery({ queryKey: ['products', workspace.id], queryFn: () => products.list({ workspaceId: workspace.id, activeOnly: false }) });
  const categoryQuery = useQuery({ queryKey: ['categories', workspace.id], queryFn: () => products.listCategories(workspace.id) });
  const balanceQuery = useQuery({ queryKey: ['inventory-balances', workspace.id, branch.id], queryFn: () => inventory.getBalances({ workspaceId: workspace.id, branchId: branch.id }) });
  const filteredProducts = useMemo(() => {
    const all = productQuery.data ?? [];
    const query = search.trim().toLocaleLowerCase();
    return all.filter((item) => !query || item.name.toLocaleLowerCase().includes(query) || item.sku.toLocaleLowerCase().includes(query));
  }, [productQuery.data, search]);
  const categoryMap = useMemo(() => new Map((categoryQuery.data ?? []).map((item) => [item.id, item.name])), [categoryQuery.data]);

  function openNew() { setEditing(null); setForm(blankForm); setFormOpen(true); }
  function openEdit(product: Product) {
    setEditing(product);
    setForm({ name: product.name, sku: product.sku, categoryName: product.categoryId ? (categoryMap.get(product.categoryId) ?? '') : '', costPrice: String(product.costPriceMinor / factor()), sellingPrice: String(product.sellingPriceMinor / factor()), lowStockThreshold: String(product.lowStockThreshold), trackStock: product.trackStock });
    setFormOpen(true);
  }
  function factor() { return minorUnitFactor(workspace.currency); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const costPriceMinor = parseMajorAmount(form.costPrice, workspace.currency);
      const sellingPriceMinor = parseMajorAmount(form.sellingPrice, workspace.currency);
      const lowStockThreshold = Number(form.lowStockThreshold);
      if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) throw new Error('Low-stock threshold must be a whole number of zero or more.');
      if (editing) {
        const nextProduct: Product = { ...editing, name: form.name, sku: form.sku, costPriceMinor, sellingPriceMinor, lowStockThreshold, trackStock: form.trackStock, updatedAt: new Date().toISOString() };
        const categoryId = (categoryQuery.data ?? []).find((item) => item.name.toLocaleLowerCase() === form.categoryName.trim().toLocaleLowerCase())?.id;
        const resolvedCategoryId = categoryId ?? editing.categoryId;
        if (form.categoryName.trim() && resolvedCategoryId) nextProduct.categoryId = resolvedCategoryId;
        else delete nextProduct.categoryId;
        await products.update(nextProduct);
        toast.success('Product updated');
      } else {
        await products.create({ workspaceId: workspace.id, name: form.name, sku: form.sku, categoryName: form.categoryName, costPriceMinor, sellingPriceMinor, lowStockThreshold, trackStock: form.trackStock });
        toast.success('Product saved', { description: 'Add opening stock from Inventory to make it available for tracked sales.' });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products', workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ['categories', workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      ]);
      setFormOpen(false); setEditing(null); setForm(blankForm);
    } catch (error) {
      toast.error('Could not save product', { description: error instanceof Error ? error.message : 'Check the fields and try again.' });
    } finally { setSaving(false); }
  }

  return (
    <div className="page-stack">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">PRODUCT CATALOGUE</div><h2>Products</h2><p>Manage the items your team sells and the rules used at checkout.</p></div><button className="button button-primary" onClick={openNew}><Plus size={17} /> Add product</button></div>
      <div className="metric-strip three-metrics"><div className="mini-metric"><span>Total products</span><strong>{productQuery.data?.length ?? '—'}</strong><small>In this workspace</small></div><div className="mini-metric"><span>Stock tracked</span><strong>{(productQuery.data ?? []).filter((item) => item.trackStock && item.active).length}</strong><small>Inventory-managed items</small></div><div className="mini-metric"><span>Low-stock alerts</span><strong className={(productQuery.data ?? []).filter((item) => item.trackStock && (balanceQuery.data?.get(item.id) ?? 0) <= item.lowStockThreshold).length ? 'warning-value' : ''}>{(productQuery.data ?? []).filter((item) => item.trackStock && (balanceQuery.data?.get(item.id) ?? 0) <= item.lowStockThreshold).length}</strong><small>At {branch.name}</small></div></div>

      <section className="section-card table-card">
        <div className="table-toolbar"><div><h3>Catalogue</h3><p>{filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}</p></div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU" aria-label="Search products" /><kbd>/</kbd></label></div>
        {productQuery.isLoading ? <div className="loading-state">Loading products…</div> : filteredProducts.length === 0 ? <div className="empty-state"><div className="empty-icon"><Package size={23} /></div><h3>{search ? 'No matching products' : 'Your catalogue is ready to begin'}</h3><p>{search ? 'Try a different product name or SKU.' : 'Add your first product. Then record opening stock before selling it from checkout.'}</p>{!search && <button className="button button-primary" onClick={openNew}><Plus size={16} /> Add first product</button>}</div> : <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>SELLING PRICE</th><th>ON HAND</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredProducts.map((item) => {
          const stock = balanceQuery.data?.get(item.id) ?? 0;
          const low = item.trackStock && stock <= item.lowStockThreshold;
          return <tr key={item.id}><td><div className="product-cell"><div className="product-avatar"><Package size={16} /></div><div><strong>{item.name}</strong><span>{item.trackStock ? 'Stock tracked' : 'Service / non-stock'}</span></div></div></td><td><span className="sku-label">{item.sku}</span></td><td>{item.categoryId ? (categoryMap.get(item.categoryId) ?? 'Uncategorised') : 'Uncategorised'}</td><td className="amount-cell">{formatMinorAmount(item.sellingPriceMinor, workspace.currency)}</td><td><span className={`stock-number ${low ? 'stock-low' : ''}`}>{item.trackStock ? stock : '—'}</span></td><td>{item.active ? (low ? <span className="status-pill status-warning">Low stock</span> : <span className="status-pill status-good">Active</span>) : <span className="status-pill">Inactive</span>}</td><td><button className="icon-button table-action" aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}><Edit3 size={16} /></button></td></tr>;
        })}</tbody></table></div>}
      </section>

      {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title"><div className="modal-heading"><div><div className="eyebrow eyebrow-blue">PRODUCT DETAILS</div><h3 id="product-form-title">{editing ? 'Edit product' : 'Add a product'}</h3><p>Prices use {workspace.currency}; amounts are stored safely as integer minor units.</p></div><button className="icon-button" aria-label="Close form" onClick={() => setFormOpen(false)}><X size={19} /></button></div><form onSubmit={submit} className="form-stack"><div className="form-two-col"><label className="field-label">Product name <span className="required-mark">*</span><input required autoFocus maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Rice 5kg" /></label><label className="field-label">SKU / barcode <span className="required-mark">*</span><input required maxLength={64} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="e.g. RICE-005" /></label></div><label className="field-label">Category<input disabled={Boolean(editing)} list="product-categories" value={form.categoryName} onChange={(event) => setForm({ ...form, categoryName: event.target.value })} placeholder="e.g. Groceries" /><datalist id="product-categories">{(categoryQuery.data ?? []).map((item) => <option value={item.name} key={item.id} />)}</datalist></label><div className="form-two-col"><label className="field-label">Cost price ({workspace.currency})<input required inputMode="decimal" min="0" step={factor() === 1 ? '1' : '0.01'} type="number" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} /></label><label className="field-label">Selling price ({workspace.currency}) <span className="required-mark">*</span><input required inputMode="decimal" min="0" step={factor() === 1 ? '1' : '0.01'} type="number" value={form.sellingPrice} onChange={(event) => setForm({ ...form, sellingPrice: event.target.value })} /></label></div><div className="form-two-col"><label className="field-label">Low-stock threshold<input required type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(event) => setForm({ ...form, lowStockThreshold: event.target.value })} /></label><label className="checkbox-field"><input type="checkbox" checked={form.trackStock} onChange={(event) => setForm({ ...form, trackStock: event.target.checked })} /><span><strong>Track inventory</strong><small>Require available stock at checkout</small></span></label></div><div className="form-modal-actions"><button type="button" className="button button-secondary" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save product'} <Check size={16} /></button></div></form></section></div>}
    </div>
  );
}
