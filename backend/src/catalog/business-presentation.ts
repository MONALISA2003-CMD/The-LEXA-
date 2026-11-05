/** Read-only industry presentation policy. Never grants role or write permissions. */
export function recommendedNavigationSections(industries:readonly string[]):readonly string[]{
  const active=new Set(industries);
  const groups=['WORKSPACE','BUSINESS REPORTS & ADVICE','CUSTOMERS & GROWTH','SELLING','INVENTORY','PURCHASING','FINANCE','TEAM & PAYROLL','ADMINISTRATION'];
  if(['wholesale_distribution','retail_trade','mobile_phones','electronics','fashion_beauty','perfumes_cosmetics','construction','household_goods','bakery'].some(code=>active.has(code)))groups.push('LOGISTICS');
  if(['bakery','food_hospitality','perfumes_cosmetics','construction','repair_services'].some(code=>active.has(code)))groups.push('PRODUCTION & QUALITY');
  if(['repair_services','construction','household_goods','education','food_hospitality'].some(code=>active.has(code)))groups.push('PROJECTS & SERVICE');
  return groups;
}
