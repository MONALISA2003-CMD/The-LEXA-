/** Restrained original LEXA navigation glyphs. One 24px grid, consistent stroke and visual weight. */
const names = ['Activity','ArrowDownUp','Banknote','BarChart3','BookOpen','Boxes','Building2','ClipboardList','CreditCard','FileText','Landmark','LayoutDashboard','Package','PackageCheck','ReceiptText','Settings','ShoppingCart','Sparkles','Tag','Target','Truck','Users','Wallet'] as const;
type Name = typeof names[number];
type Props = {size?:number;strokeWidth?:number};
function Shape({name}:{name:Name}) {
 switch(name){
  case 'Activity':return <><path d="M3 17h4l3-9 4 12 3-7h4"/></>;
  case 'ArrowDownUp':return <><path d="M7 3v18m0 0-4-4m4 4 4-4M17 21V3m0 0-4 4m4-4 4 4"/></>;
  case 'Banknote':return <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></>;
  case 'BarChart3':return <><path d="M3 20h18M5 16v-4h4v4m2 0V7h4v9m2 0V4h4v12"/></>;
  case 'BookOpen':return <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/></>;
  case 'Boxes':return <><path d="m3 9 5-3 5 3v6l-5 3-5-3V9Zm10-4 4-2 4 2v6l-4 2-4-2V5Zm-5 9 6-3 6 3v6l-6 3-6-3v-6"/></>;
  case 'Building2':return <><path d="M4 21V5l9-2v18M13 9h7v12M2 21h20M7 8h3M7 12h3M7 16h3M16 12h2M16 16h2"/></>;
  case 'ClipboardList':return <><rect x="5" y="5" width="14" height="17" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 15h6M9 19h4"/></>;
  case 'CreditCard':return <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h5"/></>;
  case 'FileText':return <><path d="M5 2h9l5 5v15H5V2Zm9 0v6h5M8 12h8M8 16h8M8 20h5"/></>;
  case 'Landmark':return <><path d="m2 9 10-6 10 6H2Zm2 1v9m5-9v9m6-9v9m5-9v9M2 21h20"/></>;
  case 'LayoutDashboard':return <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/></>;
  case 'Package':return <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10M8 5l9 5"/></>;
  case 'PackageCheck':return <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10m1 4 2 2 4-4"/></>;
  case 'ReceiptText':return <><path d="M5 2h14v20l-3-2-4 2-4-2-3 2V2Zm3 6h8M8 12h8M8 16h5"/></>;
  case 'Settings':return <><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.8 4.8l2.2 2.2m10 10 2.2 2.2m0-14.4L17 7m-10 10-2.2 2.2"/></>;
  case 'ShoppingCart':return <><path d="M2 4h3l3 13h12l2-9H6M9 21h.01M19 21h.01"/></>;
  case 'Sparkles':return <><path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3L12 2Z"/></>;
  case 'Tag':return <><path d="M3 3h10l8 8-10 10-8-8V3Zm4 5h.01"/></>;
  case 'Target':return <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>;
  case 'Truck':return <><path d="M2 6h12v12H2V6Zm12 4h4l4 5v3h-8v-8ZM6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></>;
  case 'Users':return <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2c0-3 2-5 6-5s6 2 6 5v2H3Zm13-14a3 3 0 0 1 0 6m1 2c3 0 4 2 4 5v1h-4"/></>;
  case 'Wallet':return <><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h3M6 6V4h12"/></>;
 }
}
const create = (name:Name) => ({size=18,strokeWidth=1.8}:Props) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><Shape name={name}/></svg>;
export const navigationIcons = Object.fromEntries(names.map(name=>[name,create(name)])) as Record<Name,ReturnType<typeof create>>;
