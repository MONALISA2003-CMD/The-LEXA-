import { describe, expect, it } from 'vitest';
import { isEmployeeNavigationAllowed } from './staffNavigation';
describe('CEO-assigned employee navigation privacy',()=>{
 it('keeps ordinary employees on only their own profile and business overview',()=>{
  expect(isEmployeeNavigationAllowed('employee','/')).toBe(true);
  expect(isEmployeeNavigationAllowed('employee','/my-employment')).toBe(true);
  for(const route of ['/team','/settings','/modules/employees','/modules/payroll','/modules/accounting','/checkout']) expect(isEmployeeNavigationAllowed('employee',route)).toBe(false);
 });
 it('gives cashiers POS and receipts but no payroll or bank accounts',()=>{
  expect(isEmployeeNavigationAllowed('cashier','/checkout')).toBe(true);
  expect(isEmployeeNavigationAllowed('cashier','/sales')).toBe(true);
  expect(isEmployeeNavigationAllowed('cashier','/modules/payroll')).toBe(false);
  expect(isEmployeeNavigationAllowed('cashier','/modules/accounting')).toBe(false);
 });
 it('keeps bookkeepers away from HR, and storekeepers away from accounting',()=>{
  expect(isEmployeeNavigationAllowed('accountant','/modules/accounting')).toBe(true);
  expect(isEmployeeNavigationAllowed('accountant','/modules/employees')).toBe(false);
  expect(isEmployeeNavigationAllowed('inventory_operator','/inventory')).toBe(true);
  expect(isEmployeeNavigationAllowed('inventory_operator','/modules/accounting')).toBe(false);
 });
});
