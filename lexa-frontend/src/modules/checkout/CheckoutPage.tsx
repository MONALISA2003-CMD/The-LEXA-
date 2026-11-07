import { useBusinessAssortment } from '../../components/business/useBusinessAssortment';
import { apiCatalogInventory } from '../../data/remote/apiWorkstream03';
import { moduleAccentForPath } from '../../domain/shared/moduleAccents';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Barcode, CheckCircle2, Minus, Plus, Search, ShoppingBag, Trash2, Wallet } from '../../components/LexaIcon';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { inventory, products } from '../../data/repositories';
import { salesWorkflow } from '../../data/providers';
import { formatMinorAmount, minorUnitFactor, parseMajorAmount } from '../../domain/money/money';
import type { PaymentMethod } from '../../domain/shared/types';
import { dataProviderMode } from '../../data/remote/runtimeConfig';
import { BarcodeCapture } from '../../components/barcode/BarcodeCapture';
import { businessSetupApi } from '../../data/remote/businessSetup';
import { apiCustomerGrowth } from '../../data/remote/apiCustomerGrowth';
import { apiSellingPrices } from '../../data/remote/apiSellingPrices';
import SellingNav from '../selling/SellingNav';

const fallbackPaymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'mobile_money', label: 'Mobile money (manual record)' },
  { value: 'bank_transfer', label: 'Bank transfer / deposit (manual record)' },
  { value: 'card', label: 'Card (manual record)' }, { value: 'cheque', label: 'Cheque' }, { value: 'other', label: 'Other / custom' },
];

type PaymentLineDraft = { id: string; method: PaymentMethod; amount: string; reference: string; methodLabel: string; notes: string };

export default function CheckoutPage() {
  const { workspace, branch } = useWorkspace();
  const assortment=useBusinessAssortment(workspace.id);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedLots,setSelectedLots] = useState<Record<string,string>>({});
  const [selectedSerials,setSelectedSerials] = useState<Record<string,string[]>>({});
  const [customerName, setCustomerName] = useState('');
  const [paymentLines, setPaymentLines] = useState<PaymentLineDraft[]>([{ id: 'payment-line-initial', method: 'cash', amount: '0', reference: '', methodLabel: '', notes: '' }]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedPriceListId,setSelectedPriceListId]=useState('');
  const [cashTendered,setCashTendered]=useState('');
  const priceListsQuery=useQuery({queryKey:['checkout-approved-prices',workspace.id],
    queryFn:()=>apiSellingPrices.active(workspace.id),staleTime:60000,retry:1});

  const [customerRecordId,setCustomerRecordId]=useState('');
  const [opportunityRecordId,setOpportunityRecordId]=useState('');
  const [salespersonEmployeeId,setSalespersonEmployeeId]=useState('');
  const growthChoices=useQuery({queryKey:['checkout-growth-choices',workspace.id,branch.id],
    queryFn:()=>apiCustomerGrowth.choices(workspace.id,branch.id),staleTime:60000,retry:0});

  const [promisedPaymentDate, setPromisedPaymentDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentReceiptConfirmed, setPaymentReceiptConfirmed] = useState(false);
  const methodsQuery = useQuery({ queryKey: ['business-payment-methods', workspace.id], enabled: dataProviderMode === 'api', queryFn: () => businessSetupApi.read(workspace.id) });
  const paymentMethods: Array<{ value: PaymentMethod; label: string }> = methodsQuery.data?.completedAt
    ? methodsQuery.data.paymentMethods.filter(m => m.enabled).map(m => ({ value: m.code as PaymentMethod, label: m.label }))
    : fallbackPaymentMethods;
  const defaultPaymentMethod = paymentMethods[0]?.value ?? 'cash';

  const productQuery = useQuery({ queryKey: ['products', workspace.id], queryFn: () => products.list({ workspaceId: workspace.id, activeOnly: true }) });
  const balanceQuery = useQuery({ queryKey: ['inventory-balances', workspace.id, branch.id], queryFn: () => inventory.getBalances({ workspaceId: workspace.id, branchId: branch.id }) });
  const productsList = productQuery.data ?? [];
  const variantsQuery=useQuery({queryKey:['all-variants',workspace.id],queryFn:()=>apiCatalogInventory.allVariants(workspace.id),enabled:dataProviderMode==='api',staleTime:30000,retry:1});
  const variantBalancesQuery=useQuery({queryKey:['checkout-variant-balances',workspace.id,branch.id],queryFn:()=>apiCatalogInventory.variantBalances(workspace.id,branch.id),enabled:dataProviderMode==='api',staleTime:10000,retry:1});
  const choices=useMemo(()=>productsList.flatMap(product=>{
    const variants=(variantsQuery.data??[]).filter(v=>v.productId===product.id);
    if(!variants.length)return [{key:product.id,product,variant:null as (typeof variants)[number]|null,name:product.name,sku:product.sku,barcode:product.barcode??''}];
    return variants.map(variant=>({key:`${product.id}:${variant.id}`,product,variant,name:`${product.name} · ${Object.values(variant.attributes??{}).filter(v=>v!==null&&v!==undefined&&v!=='').join(' · ')}`,sku:variant.sku,barcode:variant.barcode??''}));
  }),[productsList,variantsQuery.data]);
  const choiceBalance=(choice:(typeof choices)[number])=>{
    if(dataProviderMode==='api'){
      const match=variantBalancesQuery.data?.find(x=>x.productId===choice.product.id && x.variantId===(choice.variant?.id??null));
      return match?.quantity??0;
    }
    return balanceQuery.data?.get(choice.product.id)??0;
  };
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return choices.filter(choice=>{
      const matches=!needle||[choice.name,choice.sku,choice.barcode,choice.product.brand??''].some(value=>value.toLocaleLowerCase().includes(needle));
      const stock=dataProviderMode==='api' ? (variantBalancesQuery.data?.find(x=>x.productId===choice.product.id&&x.variantId===(choice.variant?.id??null))?.quantity??0) : (balanceQuery.data?.get(choice.product.id)??0);
      return matches&&(!choice.product.trackStock||stock>0);
    });
  },[choices,search,variantBalancesQuery.data,balanceQuery.data]);
  const visibleChoices=assortment.filter(filtered,choice=>choice.product.productType);
  const approvedPriceList=priceListsQuery.data?.find(list=>list.id===selectedPriceListId);
  const cartLines=useMemo(()=>Object.entries(cart).map(([key,quantity])=>{
    const choice=choices.find(item=>item.key===key);
    if(!choice)return null;
    const product=choice.product,variant=choice.variant;
    const approvedPrice=approvedPriceList?.items?.find(item=>item.productId===product.id&&item.variantId===(variant?.id??null))?.unitPriceMinor;
    const unitPriceMinor=approvedPrice??variant?.sellingPriceMinor??product.sellingPriceMinor;
    const stock=dataProviderMode==='api'?(variantBalancesQuery.data?.find(x=>x.productId===product.id&&x.variantId===(variant?.id??null))?.quantity??0):(balanceQuery.data?.get(product.id)??0);
    return {key,product,variant,name:choice.name,sku:choice.sku,quantity,unitPriceMinor,lineTotalMinor:unitPriceMinor*quantity,stock};
  }).filter(item=>item!==null),[cart,choices,approvedPriceList,variantBalancesQuery.data,balanceQuery.data]);
  // Only verified model compatibility can generate a checkout suggestion.
  // Match existing variant choices and branch stock before offering an item.
  const modelIdKey=[...new Set(cartLines.map(line=>line.product.catalogModelId).filter((id):id is string=>Boolean(id)))].sort().join('|');
  // Only offer specific SKUs approved for this device and available at this branch.
  // Product-level compatibility is never permission to recommend every possible variant.
  const accessorySuggestionsQuery=useQuery({queryKey:['checkout-model-accessories',workspace.id,branch.id,modelIdKey],enabled:dataProviderMode==='api'&&Boolean(modelIdKey),staleTime:10000,retry:1,queryFn:async()=>{
    const ids=modelIdKey.split('|').filter(Boolean);
    const responses=await Promise.all(ids.map(id=>apiCatalogInventory.availableCompatibleAccessories(workspace.id,branch.id,id)));
    return [...new Set(responses.flatMap(items=>items.filter(item=>item.available>0).map(item=>item.variantId?`${item.product.id}:${item.variantId}`:item.product.id)))];
  }});
  const compatibleChoices=choices.filter(choice=>accessorySuggestionsQuery.data?.includes(choice.key)&&!cart[choice.key]&&choiceBalance(choice)>0);
  const trackedLines=cartLines.filter(l=>l.product.trackLot||l.product.trackSerial);
  const traceQuery=useQuery({queryKey:['checkout-tracked-stock',workspace.id,branch.id,trackedLines.map(l=>l.key).join('|')],enabled:dataProviderMode==='api'&&trackedLines.length>0,staleTime:10000,retry:1,queryFn:async()=>Promise.all(trackedLines.map(async line=>({
    key:line.key,
    lots:line.product.trackLot?await apiCatalogInventory.availableLots(workspace.id,branch.id,line.product.id,line.variant?.id):[],
    serials:line.product.trackSerial?await apiCatalogInventory.availableSerials(workspace.id,branch.id,line.product.id,line.variant?.id):[],
  })))});
  const totalMinor = cartLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const factor = minorUnitFactor(workspace.currency);
  const paymentAllocatedMinor = paymentLines.reduce((sum, line) => { try { return sum + parseMajorAmount(line.amount || '0', workspace.currency); } catch { return sum; } }, 0);
  const creditDueMinor = totalMinor - paymentAllocatedMinor;
  const cashDueMinor=paymentLines.filter(line=>line.method==='cash').reduce((sum,line)=>{
    try{return sum+parseMajorAmount(line.amount||'0',workspace.currency);}catch{return sum;}
  },0);
  let cashTenderedMinor:number|null=null;
  try{cashTenderedMinor=cashTendered.trim()?parseMajorAmount(cashTendered,workspace.currency):null;}catch{cashTenderedMinor=null;}
  const cashChangeMinor=cashTenderedMinor===null?0:Math.max(0,cashTenderedMinor-cashDueMinor);


  useEffect(() => { setPaymentLines((current) => current.length === 1 && current[0] ? [{ ...current[0], amount: String(totalMinor / factor) }] : current); }, [totalMinor, factor]);
  useEffect(() => { setCart({});setSelectedLots({});setSelectedSerials({}); setCustomerName(''); setCustomerPhone(''); setCustomerRecordId(''); setOpportunityRecordId(''); setSalespersonEmployeeId(''); setCashTendered(''); setSelectedPriceListId(''); setPromisedPaymentDate(''); setPaymentReceiptConfirmed(false); setPaymentLines([{ id: 'payment-line-' + Date.now(), method: 'cash', amount: '0', reference: '', methodLabel: '', notes: '' }]); }, [workspace.id, branch.id]);
  useEffect(() => { if (!methodsQuery.data?.completedAt || !paymentMethods.length) return; setPaymentLines(lines => lines.map(line => paymentMethods.some(m => m.value === line.method) ? line : { ...line, method: defaultPaymentMethod })); }, [methodsQuery.data, defaultPaymentMethod]);


  async function handleScannedProduct(code: string) {
    setSearch(code);
    const normalized=code.trim().toLocaleLowerCase();
    const exact=choices.filter(choice=>choice.product.active&&(choice.barcode.trim().toLocaleLowerCase()===normalized||choice.sku.trim().toLocaleLowerCase()===normalized));
    if(exact.length===1){addToCart(exact[0]!.key);return;}
    if(exact.length>1){toast.error('Product barcode is ambiguous',{description:'Resolve duplicate barcodes before checkout.'});return;}
    if(dataProviderMode==='api'){
      try {
        // IMEI1, IMEI2 or a manufacturer's serial resolves to the exact unit.
        // Never infer a unit from a product name or SKU alone.
        const unit=await apiCatalogInventory.lookupSerial(workspace.id,branch.id,code);
        if(unit.status!=='available'){toast.error('This device cannot be sold',{description:`Current stock status: ${unit.status}`});return;}
        const choice=choices.find(c=>c.product.id===unit.productId&&(c.variant?.id??null)===unit.variantId);
        if(!choice||!choice.product.trackSerial){toast.error('Registered device product is unavailable',{description:'Review its product and variant status in Inventory.'});return;}
        if(choice.product.trackLot&&!unit.lotId){toast.error('Device has no required stock batch');return;}
        if(choice.product.trackLot&&selectedLots[choice.key]&&selectedLots[choice.key]!==unit.lotId){toast.error('Devices from different batches must be sold on separate sale lines.');return;}
        if(Object.values(selectedSerials).some(ids=>ids.includes(unit.id))){toast.error('This device is already in the current cart.');return;}
        const current=cart[choice.key]??0;
        if(current+1>choiceBalance(choice)){toast.error('There is no remaining stock for this device variant.');return;}
        addToCart(choice.key);
        setSelectedSerials(previous=>({...previous,[choice.key]:[...(previous[choice.key]??[]),unit.id]}));
        if(choice.product.trackLot&&unit.lotId)setSelectedLots(previous=>({...previous,[choice.key]:unit.lotId!}));
        toast.success('Exact device selected',{description:unit.serialNumber});
        setSearch('');
        return;
      } catch(error){
        toast.error('Scanned code not found in this branch',{description:error instanceof Error?error.message:'Scan a valid product SKU or a registered IMEI/serial.'});
        return;
      }
    }
    toast.error('Product code not found',{description:'Try a different barcode or SKU.'});
  }

  function addToCart(key:string){
    const choice=choices.find(x=>x.key===key);if(!choice)return;
    const current=cart[key]??0,available=choiceBalance(choice);
    if(choice.product.trackStock&&current+1>available){toast.error('Not enough stock',{description:`${choice.name} has ${Math.max(0,available-current)} more available.`});return;}
    setCart(value=>({...value,[key]:(value[key]??0)+1}));
  }

  function setQuantity(key:string,nextQuantity:number){
    if(nextQuantity<=0){setCart(value=>{const next={...value};delete next[key];return next;});setSelectedSerials(x=>({...x,[key]:[]}));return;}
    const choice=choices.find(x=>x.key===key);if(!choice)return;
    const available=choiceBalance(choice);
    if(choice.product.trackStock&&nextQuantity>available){toast.error(`Only ${available} available`,{description:choice.name});return;}
    setCart(value=>({...value,[key]:nextQuantity}));
  }

  function addPaymentLine() {
    const currentTotal = paymentLines.reduce((sum, line) => { try { return sum + parseMajorAmount(line.amount || '0', workspace.currency); } catch { return sum; } }, 0);
    const remaining = Math.max(0, totalMinor - currentTotal);
    setPaymentLines((current) => [...current, { id: 'payment-line-' + Date.now() + '-' + current.length, method: paymentMethods.find(p => p.value !== 'cash')?.value ?? defaultPaymentMethod, amount: String(remaining / factor), reference: '', methodLabel: '', notes: '' }]);
  }

  function updatePaymentLine(lineId: string, changes: Partial<PaymentLineDraft>) {
    setPaymentLines((current) => current.map((line) => line.id === lineId ? { ...line, ...changes } : line));
  }

  function removePaymentLine(lineId: string) {
    setPaymentLines((current) => current.length > 1 ? current.filter((line) => line.id !== lineId) : current);
  }

  async function completeSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cartLines.length) { toast.error('Your cart is empty. Add an item first.'); return; }
    if(dataProviderMode==='api' && (variantsQuery.isError||variantBalancesQuery.isError)){toast.error('Product availability could not be verified. Refresh and try again.');return;}
    const invalidTracked=cartLines.find(line=>(line.product.trackLot&&!selectedLots[line.key])||(line.product.trackSerial&&(selectedSerials[line.key]??[]).length!==line.quantity));
    if(invalidTracked){toast.error('Select the exact stock being sold',{description:`Choose ${invalidTracked.product.trackLot?'the batch and ':''}${invalidTracked.product.trackSerial?'one serial number per unit':'the lot'} for ${invalidTracked.name}.`});return;}
    let payments: Array<{ method: PaymentMethod; amountMinor: number; reference?: string; methodLabel?: string; notes?: string }>;
    try {
      payments = paymentLines.map((line) => ({
        method: line.method,
        amountMinor: parseMajorAmount(line.amount || '0', workspace.currency),
        ...(line.reference.trim() ? { reference: line.reference.trim() } : {}),
        ...(line.methodLabel.trim() ? { methodLabel: line.methodLabel.trim() } : {}),
        ...(line.notes.trim() ? { notes: line.notes.trim() } : {}),
      })).filter((payment) => payment.amountMinor > 0);
    } catch (error) {
      toast.error('Check payment amounts', { description: error instanceof Error ? error.message : 'One of the payment amounts is invalid.' });
      return;
    }
    const allocatedMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
    if (allocatedMinor > totalMinor) { toast.error('Recorded payments cannot exceed the sale total.'); return; }
    if (methodsQuery.data?.completedAt && payments.some(p => !paymentMethods.some(m => m.value === p.method))) { toast.error('Select one of your owner-approved payment recording methods.'); return; }
    if (allocatedMinor > 0 && !paymentReceiptConfirmed) { toast.error('Confirm payment receipt', { description: 'Check the actual money received independently before recording a payment.' }); return; }
    if(cashTendered.trim()&&cashTenderedMinor===null){toast.error('Enter a valid cash amount received.');return;}
    const appliedCash=payments.filter(payment=>payment.method==='cash').reduce((sum,p)=>sum+p.amountMinor,0);
    if(cashTenderedMinor!==null&&cashTenderedMinor<appliedCash){toast.error('Cash received is less than the amount due in cash.');return;}
    const creditMinor = totalMinor - allocatedMinor;
    if (creditMinor > 0 && (!customerName.trim() || !customerPhone.trim())) {
      toast.error('Credit sales need a named customer and phone number', { description: 'Record the customer details before saving any unpaid balance.' });
      return;
    }
    if (creditMinor > 0 && promisedPaymentDate && promisedPaymentDate < new Date().toISOString().slice(0, 10)) {
      toast.error('Promised payment date cannot be in the past.'); return;
    }
    setSubmitting(true);
    try {
      const result = await salesWorkflow.completeSale({
        workspaceId: workspace.id,
        branchId: branch.id,
        items: cartLines.map((line) => ({ productId: line.product.id, quantity: line.quantity,...(line.variant?{variantId:line.variant.id}:{}),...(line.product.trackLot?{lotId:selectedLots[line.key]}:{}),...(line.product.trackSerial?{serialIds:selectedSerials[line.key]??[]}:{}),...(selectedPriceListId?{priceListId:selectedPriceListId}:{}) })),
        ...(cashTenderedMinor!==null?{cashTenderedMinor}:{}),
        payments,
        ...(customerRecordId?{customerRecordId}:{}),
        ...(opportunityRecordId?{opportunityRecordId}:{}),
        ...(salespersonEmployeeId?{salespersonEmployeeId}:{}),
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
        ...(creditMinor > 0 && customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
        ...(creditMinor > 0 ? { promisedPaymentDate: promisedPaymentDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) } : {}),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['products', workspace.id] }),
        client.invalidateQueries({ queryKey: ['inventory-balances', workspace.id, branch.id] }),
        client.invalidateQueries({ queryKey: ['checkout-variant-balances',workspace.id,branch.id] }),
        client.invalidateQueries({ queryKey: ['checkout-tracked-stock',workspace.id,branch.id] }),
        client.invalidateQueries({ queryKey: ['inventory-movements', workspace.id, branch.id] }),
        client.invalidateQueries({ queryKey: ['sales', workspace.id] }),
        client.invalidateQueries({ queryKey: ['dashboard', workspace.id, branch.id] }),
      ]);
      setCart({});setSelectedLots({});setSelectedSerials({}); setCustomerName(''); setCustomerPhone(''); setCustomerRecordId(''); setOpportunityRecordId(''); setSalespersonEmployeeId(''); setPromisedPaymentDate(''); setPaymentReceiptConfirmed(false);
      setPaymentLines([{ id: 'payment-line-' + Date.now(), method: defaultPaymentMethod, amount: '0', reference: '', methodLabel: '', notes: '' }]);
      toast.success('Sale recorded', { description: `Receipt ${result.sale.receiptNumber} ${dataProviderMode === 'api' ? 'saved to LEXA' : 'saved on this device'}${creditMinor > 0 ? '; customer credit remains outstanding.' : '.'}` });
      navigate(`/sales/${result.sale.id}`);
    } catch (error) {
      toast.error('Sale was not completed', { description: error instanceof Error ? error.message : 'No sale records were committed. Check the cart and try again.' });
    } finally { setSubmitting(false); }
  }

  return (
    <div className="page-stack checkout-page" data-module-accent={moduleAccentForPath("/checkout")}>
      <SellingNav compact/>

      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">POINT OF SALE</div><h2>Checkout</h2><p>Build a cart, record payment received, and save a traceable receipt.</p></div><div className="soft-badge"><span className="status-dot" /> {branch.name}</div></div>
      <div className="checkout-layout">
        <section className="section-card product-picker-card"><div className="checkout-section-heading"><div><h3>Choose products</h3><p>Only products with stock are shown when inventory is tracked.</p></div><span className="round-icon"><ShoppingBag size={17} /></span></div><label className="search-field product-search"><Search size={17} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or scan SKU" aria-label="Search products for checkout" /><Barcode size={16} className="search-trailing-icon" /></label>
          <BarcodeCapture compact autoResolve label="Scan an item into checkout" onCode={handleScannedProduct} />
          {variantsQuery.isError&&dataProviderMode==='api'&&<p className="inline-warning" role="alert">We could not load product variants. Refresh before completing sales of variant-tracked products.</p>}
          {productQuery.isLoading ? <div className="loading-state">Loading product catalogue…</div> : visibleChoices.length === 0 ? <div className="empty-state"><div className="empty-icon"><PackageIcon /></div><h3>{productsList.length === 0 ? 'No products yet' : 'No products match'}</h3><p>{productsList.length === 0 ? 'Add a product from the catalogue, then record opening stock before checkout.' : 'No available item matches this view. Choose Search all existing products to find another business’s stock.'}</p><button type="button" className="button button-secondary" onClick={() => navigate('/products')}>{productsList.length === 0 ? 'Open products' : 'Manage products'}</button></div> : <div className="checkout-product-grid">{visibleChoices.map((choice) => { const stock = choiceBalance(choice); return <button key={choice.key} className="checkout-product" onClick={() => addToCart(choice.key)}><span className="checkout-product-icon"><PackageIcon /></span><span className="checkout-product-name">{choice.name}</span><span className="checkout-product-sku">{choice.sku}</span><span className="checkout-product-bottom"><strong>{formatMinorAmount(choice.variant?.sellingPriceMinor??choice.product.sellingPriceMinor, workspace.currency)}</strong><small>{choice.product.trackStock ? `${stock} in stock` : 'Non-stock item'}</small></span><span className="add-product-plus"><Plus size={16} /></span></button>; })}</div>}
          {compatibleChoices.length>0&&<div className="lexa-variant-manager"><h4>Verified compatible accessories</h4><p>These accessories are approved for the selected device and available at this branch.</p><div className="checkout-product-grid">{compatibleChoices.slice(0,8).map(choice=><button type="button" className="checkout-product" key={choice.key} onClick={()=>addToCart(choice.key)}><span className="checkout-product-name">{choice.name}</span><span className="checkout-product-sku">{choice.sku}</span><span className="checkout-product-bottom"><strong>{formatMinorAmount(choice.variant?.sellingPriceMinor??choice.product.sellingPriceMinor,workspace.currency)}</strong><small>{choice.product.trackStock?`${choiceBalance(choice)} in stock`:'Non-stock'}</small></span></button>)}</div></div>}
        </section>
        <section className="section-card cart-card"><div className="checkout-section-heading"><div><h3>Current sale</h3><p>{cartLines.length} {cartLines.length === 1 ? 'line item' : 'line items'}</p></div><span className="cart-count">{cartLines.reduce((sum, line) => sum + line.quantity, 0)}</span></div>
          {cartLines.length === 0 ? <div className="cart-empty"><div className="cart-empty-icon"><ShoppingBag size={22} /></div><strong>Your cart is empty</strong><span>Select a product to begin a sale.</span></div> : <div className="cart-line-list">{cartLines.map(line=>{
            const trace=traceQuery.data?.find(t=>t.key===line.key);
            const selectedLot=selectedLots[line.key]??'';
            const availableSerials=(trace?.serials??[]).filter(serial=>!line.product.trackLot||serial.lotId===selectedLot);
            return <div className="cart-line" key={line.key}>
              <div className="cart-line-main"><strong>{line.name}</strong><span>{line.sku} · {formatMinorAmount(line.unitPriceMinor,workspace.currency)} / {line.product.unitOfMeasure??'each'}</span>
              {line.product.trackLot&&<label className="field-label">Stock batch<select value={selectedLot} onChange={e=>{setSelectedLots(prev=>({...prev,[line.key]:e.target.value}));setSelectedSerials(prev=>({...prev,[line.key]:[]}));}}><option value="">Choose actual batch</option>{(trace?.lots??[]).map(lot=><option value={lot.id} key={lot.id}>{lot.lotNumber} · {lot.available} available{lot.expiryDate?' · exp '+lot.expiryDate:''}</option>)}</select></label>}
              {line.product.trackSerial&&<label className="field-label">Serial / IMEI — select {line.quantity} unit{line.quantity===1?'':'s'}
                <select multiple size={Math.min(5,Math.max(2,availableSerials.length))} value={selectedSerials[line.key]??[]} onChange={e=>setSelectedSerials(prev=>({...prev,[line.key]:Array.from(e.currentTarget.selectedOptions).map(opt=>opt.value)}))}>
                  {availableSerials.map(serial=><option key={serial.id} value={serial.id}>{serial.serialNumber}{serial.identifiers?.imei2?` / ${serial.identifiers.imei2}`:''}</option>)}
                </select><small className="field-help">Select one unique device identifier for each unit. LEXA verifies availability again when you complete the sale.</small>
              </label>}
              </div>
              <div className="quantity-control"><button type="button" aria-label={`Remove one ${line.name}`} onClick={()=>setQuantity(line.key,line.quantity-1)}><Minus size={13}/></button><span>{line.quantity}</span><button type="button" aria-label={`Add one ${line.name}`} onClick={()=>setQuantity(line.key,line.quantity+1)}><Plus size={13}/></button></div>
              <strong className="cart-line-total">{formatMinorAmount(line.lineTotalMinor,workspace.currency)}</strong>
              <button type="button" className="icon-button remove-line" aria-label={`Remove ${line.name}`} onClick={()=>setQuantity(line.key,0)}><Trash2 size={15}/></button>
            </div>;
          })}</div>}
          <form onSubmit={completeSale} className="checkout-form">
            <label className="field-label">Approved selling price list
              <select value={selectedPriceListId} onChange={event=>setSelectedPriceListId(event.target.value)}>
                <option value="">Normal selling prices</option>
                {(priceListsQuery.data??[]).map(list=><option key={list.id} value={list.id}>{list.name}</option>)}
              </select>
            </label>
            {selectedPriceListId&&<p className="selling-field-help">The approved prices for this list are applied automatically. Products not listed keep their normal price.</p>}

            <div className="checkout-customer-links">
              <strong>Link this sale to a customer</strong>
              <p>Choose an existing customer or leave as a walk-in. Linking helps keep customer history and sales reports accurate.</p>
              {growthChoices.isError&&<small>Customer choices are temporarily unavailable. You can still record a sale manually.</small>}
              <label className="field-label">Existing customer
                <select value={customerRecordId} onChange={e=>{
                  const id=e.target.value;setCustomerRecordId(id);
                  const selected=growthChoices.data?.customers.find(x=>x.id===id);
                  if(selected){setCustomerName(selected.name);setCustomerPhone(selected.phone);}
                  setOpportunityRecordId('');
                }}>
                  <option value="">Walk-in / enter details manually</option>
                  {(growthChoices.data?.customers??[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <label className="field-label">Won deal (optional)
                <select value={opportunityRecordId} onChange={e=>{
                  setOpportunityRecordId(e.target.value);
                  const selected=growthChoices.data?.opportunities.find(x=>x.id===e.target.value);
                  if(selected?.customerId){setCustomerRecordId(selected.customerId);const customer=growthChoices.data?.customers.find(x=>x.id===selected.customerId);if(customer){setCustomerName(customer.name);setCustomerPhone(customer.phone);}}
                }}>
                  <option value="">No linked deal</option>
                  {(growthChoices.data?.opportunities??[]).filter(x=>!x.customerId||!customerRecordId||x.customerId===customerRecordId).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <label className="field-label">Salesperson credited (optional)
                <select value={salespersonEmployeeId} onChange={e=>setSalespersonEmployeeId(e.target.value)}>
                  <option value="">No salesperson assigned</option>
                  {(growthChoices.data?.salespeople??[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            </div><div className="total-row"><span>Sale total</span><strong>{formatMinorAmount(totalMinor, workspace.currency)}</strong></div><label className="field-label">Customer name {creditDueMinor > 0 ? <span className="required-mark">REQUIRED FOR CREDIT</span> : <span className="optional-label">OPTIONAL</span>}<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in customer" required={creditDueMinor > 0} /></label><label className="field-label">Customer phone {creditDueMinor > 0 && <span className="required-mark">REQUIRED FOR CREDIT</span>}<input type="tel" inputMode="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="e.g. 07XX XXX XXX" required={creditDueMinor > 0} /></label><div style={{ display: 'grid', gap: 10 }}><div><strong>Payment lines</strong><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 11 }}>Split a sale between cash, manually recorded mobile money, bank, card, cheque or other methods.</p></div>{paymentLines.map((line, index) => <div key={line.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><strong>Payment {index + 1}</strong>{paymentLines.length > 1 && <button type="button" className="button button-secondary button-small" onClick={() => removePaymentLine(line.id)}>Remove line</button>}</div><div className="form-two-col"><label className="field-label">Method<select value={line.method} onChange={(event) => updatePaymentLine(line.id, { method: event.target.value as PaymentMethod })}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label><label className="field-label">Amount received ({workspace.currency})<input inputMode="decimal" type="number" min="0" step={factor === 1 ? '1' : '0.01'} value={line.amount} onChange={(event) => updatePaymentLine(line.id, { amount: event.target.value })} required /></label></div><label className="field-label">Payment reference <span className="optional-label">OPTIONAL</span><input value={line.reference} onChange={(event) => updatePaymentLine(line.id, { reference: event.target.value })} placeholder="Transaction ID / receipt ref" /></label><div className="form-two-col"><label className="field-label">Provider / bank label <span className="optional-label">OPTIONAL</span><input value={line.methodLabel} onChange={(event) => updatePaymentLine(line.id, { methodLabel: event.target.value })} placeholder="e.g. MTN, Airtel, bank name" /></label><label className="field-label">Notes <span className="optional-label">OPTIONAL</span><input value={line.notes} onChange={(event) => updatePaymentLine(line.id, { notes: event.target.value })} placeholder="Additional receipt detail" /></label></div></div>)}<button type="button" className="button button-secondary" onClick={addPaymentLine}><Plus size={14} /> Add split-payment line</button><div className="payment-footnote"><Wallet size={16} /><span>Recorded payments: {formatMinorAmount(paymentAllocatedMinor, workspace.currency)} · {creditDueMinor > 0 ? `Credit due: ${formatMinorAmount(creditDueMinor, workspace.currency)}` : creditDueMinor < 0 ? `Overpaid by ${formatMinorAmount(Math.abs(creditDueMinor), workspace.currency)} — reduce the payment lines.` : 'Fully paid'}. LEXA records what the business says it received; it does not verify payments with providers.</span></div>{creditDueMinor > 0 && <label className="field-label">Promised payment date <span className="optional-label">OPTIONAL</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={promisedPaymentDate} onChange={(event) => setPromisedPaymentDate(event.target.value)} /></label>}</div>{cashDueMinor>0&&<div className="selling-cash-change"><label className="field-label">Cash handed to the cashier ({workspace.currency})
              <input type="number" min={cashDueMinor/factor} step={factor===1?'1':'0.01'} placeholder={String(cashDueMinor/factor)} value={cashTendered}
                onChange={event=>setCashTendered(event.target.value)}/>
              </label><div><span>Change to give back</span><strong>{formatMinorAmount(cashChangeMinor,workspace.currency)}</strong></div></div>}
            <div className="payment-footnote"><Wallet size={16} /><span>LEXA records the amount you say was received. It does not initiate or confirm an external transfer. Unpaid balance remains visible on the sale.</span></div>{paymentAllocatedMinor > 0 && <label className="bs-checkline bs-owner-confirm"><input type="checkbox" required checked={paymentReceiptConfirmed} onChange={event => setPaymentReceiptConfirmed(event.target.checked)}/><span>I have independently verified the money received (cash count, official mobile-money confirmation, bank statement or card receipt). LEXA only records this payment.</span></label>}<button className="button button-primary button-wide complete-sale-button" type="submit" disabled={submitting || cartLines.length === 0}>{submitting ? 'Saving sale…' : 'Complete sale & create receipt'} <CheckCircle2 size={17} /></button><div className="checkout-secure-note">Sale, items, payment record and stock movements save together.</div></form>
        </section>
      </div>
    </div>
  );
}

function PackageIcon() {
  return <ShoppingBag size={18} strokeWidth={1.8} />;
}
