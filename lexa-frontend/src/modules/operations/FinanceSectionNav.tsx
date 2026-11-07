import { NavLink } from 'react-router';

const sections = [
  {to:'/modules/finance-overview',label:'Overview'},
  {to:'/modules/expenses',label:'Expenses'},
  {to:'/modules/payments',label:'Receipts & payments'},
  {to:'/modules/accounting',label:'Journals'},
  {to:'/modules/money-accounts',label:'Money accounts'},
  {to:'/modules/bank-reconciliation',label:'Reconciliation'},
  {to:'/modules/budgets',label:'Budgets'},
] as const;

/** Shortcuts for everyday finance work. All other finance destinations remain in the sidebar. */
export default function FinanceSectionNav() {
  return <nav className="fin-section-nav" aria-label="Finance modules">
    {sections.map(item=><NavLink key={item.to} to={item.to} className={({isActive})=>`fin-section-nav-link ${isActive?'is-active':''}`} aria-label={item.label}>
      {item.label}
    </NavLink>)}
  </nav>;
}
