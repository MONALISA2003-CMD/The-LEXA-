import { BadRequestException } from '@nestjs/common';
import type {CategoryFieldPolicy} from './product-attribute-validation';
/** Resolve fields only through tenant-owned ancestors, never by trusting a category's name. */
export async function resolveCategoryFields(db:any, tenantId:string, categoryId:string|null|undefined):Promise<{templateKey:string|null;customKeys:string[];customFields:CategoryFieldPolicy[]}> {
 if(!categoryId)return {templateKey:null,customKeys:[],customFields:[]};
 const visited=new Set<string>(), customFields=new Map<string,CategoryFieldPolicy>();
 let current:string|null=categoryId,templateKey:string|null=null;
 while(current){
  if(visited.has(current)||visited.size>=20)throw new BadRequestException('Category hierarchy is not valid.');
  visited.add(current);
  const category: { parentId: string | null; templateKey: string | null; attributeSchema: unknown } | null = await db.category.findFirst({where:{tenantId,id:current},select:{id:true,parentId:true,templateKey:true,attributeSchema:true}});
  if(!category)throw new BadRequestException('Category does not belong to this business.');
  if(!templateKey&&typeof category.templateKey==='string')templateKey=category.templateKey;
  if(Array.isArray(category.attributeSchema))for(const field of category.attributeSchema){
    if(field&&typeof field==='object'&&typeof field.key==='string'&&typeof field.label==='string'&&['text','number','select'].includes(field.kind??'text')&&!customFields.has(field.key))customFields.set(field.key,{key:field.key,label:field.label,kind:field.kind??'text',required:field.required===true,...(Array.isArray(field.options)?{options:field.options.filter((v:unknown)=>typeof v==='string')}: {})});
  }
  current=category.parentId;
 }
 return {templateKey,customKeys:[...customFields.keys()],customFields:[...customFields.values()]};
}
