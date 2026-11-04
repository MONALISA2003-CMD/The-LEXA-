import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiProcurement } from '../../data/remote/apiProcurement';
import { apiWorkstream6 } from '../../data/remote/apiWorkstream6';
import { products } from '../../data/repositories';
import { businessErrorMessage } from '../../data/remote/businessMessages';

/** Owner-controlled actions. AI never executes arbitrary tool output or bypasses approvals. */
export default function OwnerActions({ enabled }: { enabled: boolean }) {
  const { workspace, branch } = useWorkspace();
  const client = useQueryClient();
  const [kind, setKind] = useState<'purchase'|'task'>('purchase');
  const [title, setTitle] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [projectId, setProjectId] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState('');
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const projects = useQuery({ queryKey:['lexa-assistant-projects', workspace.id,branch.id], queryFn:()=>apiWorkstream6.projects(workspace.id,branch.id), enabled:enabled&&kind==='task', retry:false });
  const catalogue = useQuery({ queryKey:['lexa-assistant-products',workspace.id], queryFn:()=>products.list({workspaceId:workspace.id,activeOnly:true}), enabled:enabled&&kind==='purchase', retry:false });
  const chosenProduct = catalogue.data?.find(x=>x.id===productId);
  const chosenProject = projects.data?.find(x=>x.id===projectId);
  const number = Number(quantity);
  const valid = title.trim().length>2 && title.trim().length<=160 && (kind==='purchase' ? Boolean(chosenProduct) && Number.isFinite(number) && number>0 && number<=1000000 : Boolean(chosenProject));
  function switchTo(next:'purchase'|'task') { setKind(next); setReview(false);setTitle('');setDetails('');setDue('');setProductId('');setProjectId('');setQuantity('1'); }
  function preview(e:FormEvent<HTMLFormElement>) { e.preventDefault(); if(!valid)return;setReview(true); }
  async function execute() {
    if(!enabled||!review||!valid||saving)return;
    setSaving(true);
    try {
      if(kind==='purchase') {
        await apiProcurement.createRequest({workspaceId:workspace.id,branchId:branch.id},{title:title.trim(),notes:details.trim()||undefined,lines:[{productId,quantity:number}]});
        toast.success('Draft purchase request created. Submit it through Purchasing when ready.');
      } else {
        await apiWorkstream6.createProjectTask(workspace.id,branch.id,projectId,{taskCode:`TASK-${crypto.randomUUID().slice(0,8).toUpperCase()}`,title:title.trim(),description:details.trim()||undefined,dueAt:due||undefined});
        toast.success('Project task created.');
      }
      await client.invalidateQueries({predicate:({queryKey})=>queryKey.includes(workspace.id)});
      switchTo(kind);
    } catch(err) { toast.error('Nothing was saved', {description:businessErrorMessage(err)}); }
    finally {setSaving(false);}
  }
  if(!enabled)return null;
  return <section className="lexa-owner-actions" aria-labelledby="owner-actions-heading">
    <div className="lexa-owner-actions-head"><div><h2 id="owner-actions-heading">Prepare a business action</h2><p>Create a purchasing request or assign project work. You review every detail before it is saved.</p></div></div>
    <div className="lexa-owner-action-tabs" role="group" aria-label="Business action"><button className={kind==='purchase'?'selected':''} type="button" onClick={()=>switchTo('purchase')}>Purchase request</button><button className={kind==='task'?'selected':''} type="button" onClick={()=>switchTo('task')}>Project task</button></div>
    {!review?<form className="lexa-owner-form" onSubmit={preview}>
      <label>{kind==='purchase'?'Purchase requirement':'Task title'}<input required maxLength={160} minLength={3} value={title} onChange={e=>setTitle(e.target.value)} placeholder={kind==='purchase'?'What items does the business need?':'What needs to be done?'}/></label>
      {kind==='purchase'?<><label>Catalogue item<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Choose an existing product</option>{catalogue.data?.map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label><label>Quantity<input type="number" min="0.001" max="1000000" step="0.001" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>{catalogue.isError&&<p role="alert">Product catalogue is unavailable. <button type="button" onClick={()=>void catalogue.refetch()}>Retry</button></p>}</>:
      <><label>Existing project<select required value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">Select a project</option>{projects.data?.filter(x=>['planning','active','on_hold'].includes(x.status)).map(p=><option key={p.id} value={p.id}>{p.projectCode} · {p.name}</option>)}</select></label><label>Due date<input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>{projects.isError&&<p role="alert">Projects are unavailable. <button type="button" onClick={()=>void projects.refetch()}>Retry</button></p>}</>}
      <label>Details (optional)<textarea rows={2} maxLength={1000} value={details} onChange={e=>setDetails(e.target.value)}/></label><button className="lexa-intel-ask" type="submit" disabled={!valid}>Review {kind==='purchase'?'purchase request':'project task'}</button>
    </form>:<div className="lexa-owner-review" aria-live="polite"><strong>Confirm before saving</strong><dl><div><dt>Action</dt><dd>{kind==='purchase'?'Create draft purchase request':'Create project task'}</dd></div><div><dt>Title</dt><dd>{title.trim()}</dd></div><div><dt>{kind==='purchase'?'Product':'Project'}</dt><dd>{kind==='purchase'?chosenProduct?.name:chosenProject?.name}</dd></div>{kind==='purchase'&&<div><dt>Quantity</dt><dd>{number}</dd></div>}{details.trim()&&<div><dt>Details</dt><dd>{details.trim()}</dd></div>}</dl><p>{kind==='purchase'?'The purchase request will remain a draft; no purchase order or payment will be approved.':'The task will be added to the selected project.'}</p><div className="lexa-owner-review-buttons"><button type="button" onClick={()=>setReview(false)} disabled={saving}>Edit details</button><button type="button" className="lexa-intel-ask" onClick={()=>void execute()} disabled={saving||!valid}>{saving?'Saving…':'Confirm and save'}</button></div></div>}
    <div className="lexa-owner-shortcuts"><Link to="/modules/purchase-requests">Open Purchasing</Link><Link to="/modules/tasks">Open Tasks</Link></div>
  </section>;
}
