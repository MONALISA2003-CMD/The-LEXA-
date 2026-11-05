#!/usr/bin/env python3
"""Preview LEXA Electronics V2 categories and optionally import approved leaves.

Dry-run is the default. Never silently re-parent existing categories or invent stock.
--apply uses an authenticated HTTPS API session + CSRF supplied ONLY by environment;
no passwords/tokens in files, command-line arguments, reports, or logs.
"""
import argparse, json, os, sys, urllib.request, urllib.error, urllib.parse, uuid
from pathlib import Path
BASE=Path(__file__).resolve().parent
catalog=json.loads((BASE/'electronics-catalogue-v2.v1.json').read_text())
entries={n['code']:n for n in catalog['nodes'] if n['selectable']}
def norm(s):return ' '.join(s.casefold().split())
def load_categories(p):
 data=json.loads(Path(p).read_text());rows=data if isinstance(data,list) else data.get('categories',[])
 assert isinstance(rows,list) and all(isinstance(x,dict) for x in rows)
 return rows

def local_preview(codes,existing):
 by_id={c['id']:c for c in existing if isinstance(c.get('id'),str)}
 def breadcrumb(c):
  chain=[];seen=set();current=c
  while current and current['id'] not in seen and len(chain)<20:
   seen.add(current['id']);chain.insert(0,current.get('name',''));current=by_id.get(current.get('parentId'))
  return ' > '.join(chain)
 results=[]
 for code in codes:
  node=entries[code];already=[c['id'] for c in existing if c.get('catalogCode')==code]
  aliases={norm(x) for x in [ ' > '.join(node['path']), *node.get('aliases',[])]}
  match=[{'categoryId':c['id'],'path':breadcrumb(c)} for c in existing if c.get('id') in by_id and c.get('catalogCode') in (None,'') and norm(breadcrumb(c)) in aliases]
  results.append({'code':code,'breadcrumb':' > '.join(node['path']),'industryCodes':node['industryCodes'],
    'familyCode':node['familyCode'],'action':'already_adopted' if already else ('link_existing_with_approval' if match else 'adopt_new_with_approval'),
    'historicalCandidates':match,'existingCategoryIds':already,'changesToExistingProducts':0})
 return results

class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  raise RuntimeError('Authenticated V2 import refuses HTTP redirects to avoid forwarding the business session')

def request(url,method='GET',body=None,csrf=None,session=None):
 headers={'accept':'application/json'}
 if method!='GET':
  headers.update({'content-type':'application/json','x-csrf-token':csrf,'cookie':f'lexa_session={session}; lexa_csrf={csrf}',
                  'idempotency-key':str(uuid.uuid4())})
 else:headers['cookie']=f'lexa_session={session}'
 req=urllib.request.Request(url,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
 try:
  with urllib.request.build_opener(NoRedirect()).open(req,timeout=20) as response:
   data=json.loads(response.read())
   return data.get('data',data) if isinstance(data,dict) else data
 except urllib.error.HTTPError as e:
  raise RuntimeError(f'Authorized API returned HTTP {e.code}; no category changes inferred as successful.') from None

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--codes',nargs='*',help='Explicit leaf codes, default all');p.add_argument('--categories-json',help='Optional existing tenant category list/export for read-only planning');
 p.add_argument('--out',help='Write JSON preview to a file');p.add_argument('--apply',action='store_true',help='Apply only fresh nodes through the audited authenticated API');
 p.add_argument('--api-base',help='HTTPS API origin including /api/v1');p.add_argument('--workspace-id');p.add_argument('--confirm-tenant',help='Must match workspace id to apply');p.add_argument('--confirm-api-host',help='Expected HTTPS API hostname, required to avoid sending session cookies to the wrong site');
 args=p.parse_args()
 codes=args.codes or list(entries)
 unknown=[x for x in codes if x not in entries]
 if unknown:p.error('Unknown or non-leaf codes: '+', '.join(unknown))
 existing=load_categories(args.categories_json) if args.categories_json else []
 plan=local_preview(codes,existing)
 if args.out:Path(args.out).write_text(json.dumps(plan,indent=2)+'\n')
 print(json.dumps({'schemaVersion':2,'policyVersion':1,'previewCount':len(plan),'proposedImports':sum(x['action']=='adopt_new_with_approval' for x in plan),'conflicts':sum(x['action']=='link_existing_with_approval' for x in plan),'preview':plan if len(plan)<=20 else plan[:20],'truncated':len(plan)>20},indent=2))
 if not args.apply:return
 if not args.api_base or not args.api_base.startswith('https://') or not args.workspace_id or args.confirm_tenant!=args.workspace_id:p.error('--apply needs an HTTPS API origin and an explicitly confirmed matching tenant ID')
 host=urllib.parse.urlparse(args.api_base).hostname
 if not host or not args.confirm_api_host or args.confirm_api_host!=host:p.error('--apply requires --confirm-api-host equal to the HTTPS origin hostname')
 if not args.codes:p.error('--apply requires explicit --codes; cannot import every category by default')
 session=os.environ.get('LEXA_SESSION_COOKIE');csrf=os.environ.get('LEXA_CSRF_TOKEN')
 if not session or not csrf or len(csrf)<32:p.error('Use LEXA_SESSION_COOKIE and LEXA_CSRF_TOKEN in the environment, never command-line arguments')
 origin=args.api_base.rstrip('/')+f'/workspaces/{args.workspace_id}/catalog/v2'
 results=[]
 for code in codes:
  res=request(origin+'/categories/preview?code='+urllib.parse.quote(code),session=session)
  if res['action']=='already_adopted':results.append({'code':code,'action':'already_adopted'});continue
  if res['action']!='adopt_new_with_approval':results.append({'code':code,'action':'manual_review_required'});continue
  created=request(origin+'/categories/adopt',method='POST',body={'code':code},session=session,csrf=csrf)
  results.append({'code':code,'action':'adopted','categoryId':created['categoryId']})
 print(json.dumps({'applied':results},indent=2))
if __name__=='__main__':
 main()
