/**
 * LEXA's own compact interface marks. These are deliberately not Lucide icons.
 * The module exports familiar semantic component names to preserve the existing
 * navigation and field markup, while drawing the marks locally as SVG paths.
 */
import { forwardRef, type ReactNode, type SVGProps } from 'react';

export type LexaIconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & {
  size?: number | string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
};
export type LexaIcon = ReturnType<typeof forwardRef<SVGSVGElement, LexaIconProps>>;
const P = ({d}: {d:string}) => <path d={d}/>;
const C = ({cx,cy,r}: {cx:number;cy:number;r:number}) => <circle cx={cx} cy={cy} r={r}/>;

function mark(name: string): ReactNode {
  if (name === 'X' || name === 'XCircle' || name === 'ShieldX' || name === 'UserX') return <><P d="M5 5l14 14M19 5L5 19"/>{name !== 'X' && <C cx={12} cy={12} r={10}/>}</>;
  if (name === 'Plus' || name === 'FilePlus2' || name === 'UserPlus' || name === 'UserRoundPlus') return <P d="M12 5v14M5 12h14"/>;
  if (name === 'Minus') return <P d="M5 12h14"/>;
  if (/^(Check|BadgeCheck|CircleCheck|CircleCheck2|CheckCircle2|CheckCircle|UserCheck|UserRoundCheck|ClipboardCheck|FileCheck2|BookOpenCheck|MailCheck|ShieldCheck|PackageCheck)$/.test(name)) return <><P d="M4.5 12.3l5 4.6L19.5 6.8"/><P d="M4 7.2a10 10 0 0 1 16-1.3M20 16.2a10 10 0 0 1-16 .8"/></>;
  if (/^(Alert|CircleAlert|AlertCircle|AlertTriangle|ShieldAlert)/.test(name)) return <><P d="M12 3l9.5 17H2.5z"/><P d="M12 9v4.7"/><C cx={12} cy={17} r={0.6}/></>;
  if (/^(Arrow|Chevron|Chevrons)/.test(name)) {
    if (/LeftRight/.test(name)) return <P d="M3 8h18l-4-4m4 4l-4 4M21 16H3l4-4m-4 4l4 4"/>;
    if (/DownLeft/.test(name)) return <P d="M18 5L6 17M6 7v10h10"/>;
    if (/UpRight/.test(name)) return <P d="M5 19L19 5M9 5h10v10"/>;
    if (/Down/.test(name)) return <P d={name.includes('Chevron')?'M5 9l7 7 7-7':'M12 4v16m-6-6l6 6 6-6'}/>;
    if (/Up/.test(name)) return <P d={name.includes('Chevron')?'M5 15l7-7 7 7':'M12 20V4M6 10l6-6 6 6'}/>;
    if (/Left/.test(name)) return <P d={name.includes('Chevron')?'M15 5l-7 7 7 7':'M20 12H4m6-6l-6 6 6 6'}/>;
    return <P d={name.includes('Chevron')?'M9 5l7 7-7 7':'M4 12h16m-6-6l6 6-6 6'}/>;
  }
  if (name === 'Search' || name === 'ScanBarcode') return <><C cx={10.5} cy={10.5} r={6.5}/><P d="M16 16l5.2 5.2"/></>;
  if (name === 'Menu') return <P d="M4 6h16M4 12h16M4 18h16"/>;
  if (name === 'Eye' || name === 'EyeOff') return <><P d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6S2.5 12 2.5 12Z"/><C cx={12} cy={12} r={2.6}/>{name==='EyeOff'&&<P d="M4 20L20 4"/>}</>;
  if (name === 'RefreshCw' || name === 'RefreshCcw' || name === 'RotateCcw' || name === 'LoaderCircle') return <><P d="M20 9a8 8 0 0 0-14-4l-3 3V3M4 15a8 8 0 0 0 14 4l3-3v5"/></>;
  if (name === 'Copy') return <><rect x={7} y={7} width={13} height={13} rx={2}/><P d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/></>;
  if (/^(ShoppingCart|ShoppingBag|ShoppingBasket)$/.test(name)) return <><P d="M2 4h3l3 12h11l3-9H6"/><C cx={9} cy={20} r={1}/><C cx={18} cy={20} r={1}/></>;
  if (/^(Package|Packages|Box|Boxes|PackageCheck|Inventory|Warehouse|Layers3)$/.test(name)) return <><P d="M12 2l9 5-9 5-9-5 9-5zM3 7v10l9 5 9-5V7M12 12v10M7.5 4.5l9 5"/></>;
  if (/^(Truck|Delivery|Store)$/.test(name)) return <><P d="M2 6h12v12H2zM14 10h4l4 4v4h-8"/><C cx={7} cy={19} r={2}/><C cx={18} cy={19} r={2}/></>;
  if (/^(Building2|Landmark|Factory|BriefcaseBusiness)$/.test(name)) return <><P d="M3 21V7l9-5 9 5v14M2 21h20M8 9h2m4 0h2M8 13h2m4 0h2M8 17h2m4 0h2"/></>;
  if (/^(Wallet|Banknote|CreditCard|CircleDollarSign|HandCoins)$/.test(name)) return <><rect x={2} y={6} width={20} height={13} rx={2}/><P d="M2 10h20M6 3h12M16 15h3"/></>;
  if (/^(ReceiptText|FileText|FileSpreadsheet|FileClock|FileCheck2|FilePlus2|Printer|ClipboardList|FilePlus)$/.test(name)) return <><P d="M5 2h10l4 4v16H5zM15 2v5h4M8 11h8M8 15h8M8 19h5"/></>;
  if (/^(BarChart3|ChartNoAxesCombined|TrendingUp|Activity)$/.test(name)) return <><P d="M3 21V4M3 21h18M7 17v-4M12 17V7M17 17v-8M7 9l5-4 5 2 4-4"/></>;
  if (/^(Users|UserRound|ContactRound|UserPlus|UserX|UserCheck|UserRoundPlus|UserRoundCheck)$/.test(name)) return <><C cx={10} cy={8} r={3.5}/><P d="M3 20v-2a7 7 0 0 1 14 0v2M17 5a3 3 0 0 1 0 6M20.5 20v-2a6 6 0 0 0-2.8-5"/></>;
  if (/^(Clock|Clock3|CalendarDays|CalendarClock|History)$/.test(name)) return <><C cx={12} cy={12} r={9}/><P d="M12 6v6l4 3"/></>;
  if (/^(LockKeyhole|KeyRound|Shield|ShieldCheck|ShieldX|ShieldAlert)$/.test(name)) return <><P d="M12 2l9 4v6c0 6-3.5 9-9 11-5.5-2-9-5-9-11V6z"/><P d="M9.5 12l2 2 4-4"/></>;
  if (/^(Mail|MailCheck|MessageCircle|Headset|Megaphone)$/.test(name)) return <><rect x={2.5} y={5} width={19} height={14} rx={2}/><P d="M3 7l9 6 9-6"/></>;
  if (/^(Settings|Settings2|SlidersHorizontal|Filter)$/.test(name)) return <><P d="M4 6h16M4 12h16M4 18h16"/><C cx={9} cy={6} r={2}/><C cx={16} cy={12} r={2}/><C cx={10} cy={18} r={2}/></>;
  if (/^(Pencil|Edit3)$/.test(name)) return <><P d="M4 16l12-12 4 4L8 20H4z"/><P d="M13 7l4 4"/></>;
  if (/^(Moon|Sun)$/.test(name)) return <><C cx={12} cy={12} r={5}/><P d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></>;
  if (/^(Download|Upload|Save|ImageUp)$/.test(name)) return <><P d="M3 16v5h18v-5M12 3v12m-5-5l5 5 5-5"/></>;
  if (/^(Trash2)$/.test(name)) return <><P d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>;
  if (/^(Play|Pause|Power|Square)$/.test(name)) return <><rect x={4} y={4} width={16} height={16} rx={3}/><P d={name==='Pause'?'M9 8v8m6-8v8':name==='Power'?'M12 2v11':'M10 8l6 4-6 4z'}/></>;
  if (/^(Pin|MapPin)$/.test(name)) return <><P d="M12 22s8-8 8-13a8 8 0 1 0-16 0c0 5 8 13 8 13z"/><C cx={12} cy={9} r={2}/></>;
  if (/^(BookOpen|HeartHandshake|HelpCircle|CircleHelp|Database|DatabaseBackup|FolderKanban)$/.test(name)) return <><P d="M12 6c-3-3-6-3-9-2v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-3-1-6-1-9 2zM12 6v15"/></>;
  if (/^(Barcode|Camera|Smartphone|Laptop2|Wifi)$/.test(name)) return <><rect x={4} y={3} width={16} height={18} rx={2}/><P d="M8 7v8M11 7v8M14 7v8M17 7v8"/></>;
  if (/^(Tag)$/.test(name)) return <><P d="M3 4h9l9 9-8 8-10-10z"/><C cx={8} cy={8} r={1}/></>;
  if (/^(Target)$/.test(name)) return <><C cx={12} cy={12} r={9}/><C cx={12} cy={12} r={5}/><C cx={12} cy={12} r={1}/></>;
  if (/^(BellRing)$/.test(name)) return <><P d="M6 18h12l-2-3V9a4 4 0 0 0-8 0v6zM10 21h4"/></>;
  // All other semantic names receive a consistent LEXA four-corner mark.
  return <><P d="M4 9V4h5m6 0h5v5M20 15v5h-5M9 20H4v-5"/><P d="M9 12h6M12 9v6"/></>;
}

function createIcon(name: string): LexaIcon {
  const Icon = forwardRef<SVGSVGElement, LexaIconProps>(function LexaMark({size=20, strokeWidth=1.8, absoluteStrokeWidth: _ignored, children, ...rest}, ref) {
    return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}
      aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" {...rest}>{mark(name)}{children}</svg>;
  });
  Icon.displayName = `Lexa${name}`;
  return Icon;
}
// Generated semantic exports below keep all existing ERP modules source-compatible.
export const Activity = createIcon('Activity');
export const AlertCircle = createIcon('AlertCircle');
export const AlertTriangle = createIcon('AlertTriangle');
export const ArrowDownLeft = createIcon('ArrowDownLeft');
export const ArrowDownToLine = createIcon('ArrowDownToLine');
export const ArrowLeft = createIcon('ArrowLeft');
export const ArrowLeftRight = createIcon('ArrowLeftRight');
export const ArrowRight = createIcon('ArrowRight');
export const ArrowUpFromLine = createIcon('ArrowUpFromLine');
export const ArrowUpRight = createIcon('ArrowUpRight');
export const BadgeCheck = createIcon('BadgeCheck');
export const Banknote = createIcon('Banknote');
export const BarChart3 = createIcon('BarChart3');
export const Barcode = createIcon('Barcode');
export const BellRing = createIcon('BellRing');
export const BookOpen = createIcon('BookOpen');
export const BookOpenCheck = createIcon('BookOpenCheck');
export const Box = createIcon('Box');
export const Boxes = createIcon('Boxes');
export const BriefcaseBusiness = createIcon('BriefcaseBusiness');
export const Building2 = createIcon('Building2');
export const CalendarClock = createIcon('CalendarClock');
export const CalendarDays = createIcon('CalendarDays');
export const Camera = createIcon('Camera');
export const ChartNoAxesCombined = createIcon('ChartNoAxesCombined');
export const Check = createIcon('Check');
export const CheckCircle2 = createIcon('CheckCircle2');
export const ChevronDown = createIcon('ChevronDown');
export const ChevronLeft = createIcon('ChevronLeft');
export const ChevronRight = createIcon('ChevronRight');
export const ChevronUp = createIcon('ChevronUp');
export const ChevronsUpDown = createIcon('ChevronsUpDown');
export const CircleAlert = createIcon('CircleAlert');
export const CircleCheck = createIcon('CircleCheck');
export const CircleDollarSign = createIcon('CircleDollarSign');
export const CircleHelp = createIcon('CircleHelp');
export const ClipboardCheck = createIcon('ClipboardCheck');
export const ClipboardList = createIcon('ClipboardList');
export const Clock = createIcon('Clock');
export const Clock3 = createIcon('Clock3');
export const ContactRound = createIcon('ContactRound');
export const Cookie = createIcon('Cookie');
export const Copy = createIcon('Copy');
export const CreditCard = createIcon('CreditCard');
export const Database = createIcon('Database');
export const DatabaseBackup = createIcon('DatabaseBackup');
export const Download = createIcon('Download');
export const Edit3 = createIcon('Edit3');
export const Eye = createIcon('Eye');
export const EyeOff = createIcon('EyeOff');
export const Factory = createIcon('Factory');
export const FileCheck2 = createIcon('FileCheck2');
export const FileClock = createIcon('FileClock');
export const FilePlus2 = createIcon('FilePlus2');
export const FileSpreadsheet = createIcon('FileSpreadsheet');
export const FileText = createIcon('FileText');
export const Filter = createIcon('Filter');
export const FolderKanban = createIcon('FolderKanban');
export const HandCoins = createIcon('HandCoins');
export const Headset = createIcon('Headset');
export const HeartHandshake = createIcon('HeartHandshake');
export const HeartPulse = createIcon('HeartPulse');
export const HelpCircle = createIcon('HelpCircle');
export const History = createIcon('History');
export const ImageUp = createIcon('ImageUp');
export const KeyRound = createIcon('KeyRound');
export const Landmark = createIcon('Landmark');
export const Laptop2 = createIcon('Laptop2');
export const Layers3 = createIcon('Layers3');
export const LayoutDashboard = createIcon('LayoutDashboard');
export const LoaderCircle = createIcon('LoaderCircle');
export const LockKeyhole = createIcon('LockKeyhole');
export const LogIn = createIcon('LogIn');
export const LogOut = createIcon('LogOut');
export const Mail = createIcon('Mail');
export const MailCheck = createIcon('MailCheck');
export const MapPin = createIcon('MapPin');
export const Megaphone = createIcon('Megaphone');
export const Menu = createIcon('Menu');
export const MessageCircle = createIcon('MessageCircle');
export const Minus = createIcon('Minus');
export const Moon = createIcon('Moon');
export const Package = createIcon('Package');
export const PackageCheck = createIcon('PackageCheck');
export const Pause = createIcon('Pause');
export const Pencil = createIcon('Pencil');
export const Pin = createIcon('Pin');
export const Play = createIcon('Play');
export const Plus = createIcon('Plus');
export const Power = createIcon('Power');
export const Printer = createIcon('Printer');
export const ReceiptText = createIcon('ReceiptText');
export const RefreshCcw = createIcon('RefreshCcw');
export const RefreshCw = createIcon('RefreshCw');
export const RotateCcw = createIcon('RotateCcw');
export const Save = createIcon('Save');
export const ScanBarcode = createIcon('ScanBarcode');
export const Search = createIcon('Search');
export const Send = createIcon('Send');
export const Settings = createIcon('Settings');
export const Settings2 = createIcon('Settings2');
export const Shield = createIcon('Shield');
export const ShieldAlert = createIcon('ShieldAlert');
export const ShieldCheck = createIcon('ShieldCheck');
export const ShieldX = createIcon('ShieldX');
export const ShoppingBag = createIcon('ShoppingBag');
export const ShoppingBasket = createIcon('ShoppingBasket');
export const ShoppingCart = createIcon('ShoppingCart');
export const SlidersHorizontal = createIcon('SlidersHorizontal');
export const Smartphone = createIcon('Smartphone');
export const Sparkles = createIcon('Sparkles');
export const Square = createIcon('Square');
export const Store = createIcon('Store');
export const Sun = createIcon('Sun');
export const Tag = createIcon('Tag');
export const Target = createIcon('Target');
export const Trash2 = createIcon('Trash2');
export const TrendingUp = createIcon('TrendingUp');
export const Truck = createIcon('Truck');
export const Upload = createIcon('Upload');
export const UserCheck = createIcon('UserCheck');
export const UserPlus = createIcon('UserPlus');
export const UserRound = createIcon('UserRound');
export const UserRoundCheck = createIcon('UserRoundCheck');
export const UserRoundPlus = createIcon('UserRoundPlus');
export const UserX = createIcon('UserX');
export const Users = createIcon('Users');
export const Wallet = createIcon('Wallet');
export const Warehouse = createIcon('Warehouse');
export const Wifi = createIcon('Wifi');
export const X = createIcon('X');
export const XCircle = createIcon('XCircle');
