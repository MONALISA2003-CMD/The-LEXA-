import { BadRequestException } from '@nestjs/common';
/** Resolve fields only through tenant-owned ancestors, never by trusting a category's name. */
export async function resolveCategoryFields(db:any, tenantId:string, categoryId:string|null|undefined):Promise<{templateKey:string|null;customKeys:string[]}> {
 if(!categoryId)return {templateKey:null,customKeys:[]};
 const visited=new Set<string>(), customKeys=new Set<string>();
 let current:string|null=categoryId,templateKey:string|null=null;
 while(current){
  if(visited.has(current)||visited.size>=20)throw new BadRequestException('Category hierarchy is not valid.');
  visited.add(current);
  const category: { parentId: string | null; templateKey: string | null; attributeSchema: unknown } | null = await db.category.findFirst({where:{tenantId,id:current},select:{id:true,parentId:true,templateKey:true,attributeSchema:true}});
  if(!category)throw new BadRequestException('Category does not belong to this business.');
  if(!templateKey&&typeof category.templateKey==='string')templateKey=category.templateKey;
  if(Array.isArray(category.attributeSchema))for(const field of category.attributeSchema){
    if(field&&typeof field==='object'&&typeof field.key==='string')customKeys.add(field.key);
  }
  current=category.parentId;
 }
 return {templateKey,customKeys:[...customKeys]};
}
