/** Tenant-owned root category lookup. Database uniqueness protects siblings. */
export async function ensureRootCategory(db:any,tenantId:string,name:string):Promise<{id:string}> {
  const where={tenantId,parentId:null,name};
  const found=await db.category.findFirst({where,select:{id:true}});
  if(found)return found;
  // P2002 is propagated to the request. A transaction that has raised a
  // unique violation cannot safely issue a second query without a savepoint.
  return db.category.create({data:{tenantId,name,parentId:null},select:{id:true}});
}
