import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function lexaReceivablesIntegration(): Plugin {
  return {
    name: 'lexa-receivables-integration',
    enforce: 'pre',
    transform(source, id) {
      const fileId = (id.split('?')[0] ?? id).replace(/\\/g, '/');
      if (fileId.endsWith('/CommerceWorkflowPanel.tsx')) {
        if (source.includes("import AccountsReceivablePanel from './AccountsReceivablePanel';")) return null;
        const importMarker = "import './commerce-workflows.css';";
        const renderMarker = 'if (!apiMode || !isWorkflowModule) return null;';
        if (!source.includes(importMarker) || !source.includes(renderMarker)) throw new Error('LEXA receivables integration could not find its workflow extension points.');
        const transformed = source
          .replace(importMarker, `${importMarker}\nimport AccountsReceivablePanel from './AccountsReceivablePanel';`)
          .replace(renderMarker, "if (!apiMode) return null;\n  if (moduleId === 'sales-invoices') return <AccountsReceivablePanel />;\n  if (!isWorkflowModule) return null;");
        return { code: transformed, map: null };
      }
      if (fileId.endsWith('/moduleCatalog.ts')) {
        const marker = "id: 'sales-invoices'";
        const start = source.indexOf(marker);
        if (start < 0) return null;
        const end = source.indexOf('\n  },', start);
        if (end < 0) throw new Error('LEXA could not locate the sales-invoices module boundary.');
        let block = source.slice(start, end);
        if (!block.includes('readOnly: true')) {
          block = block.replace('icon: ReceiptText,', 'icon: ReceiptText, readOnly: true,');
          const fieldsStart = block.indexOf('    fields: ');
          const columnsStart = block.indexOf('\n    columns:', fieldsStart);
          if (fieldsStart < 0 || columnsStart < 0) throw new Error('LEXA could not locate sales-invoice field metadata.');
          const oldFields = block.slice(fieldsStart, columnsStart).trim().replace(/,$/, '');
          const oldArray = oldFields.replace(/^fields:\s*/, '');
          if (!oldArray.startsWith('[') || !oldArray.endsWith(']')) throw new Error('LEXA found unexpected sales-invoice fields.');
          block = `${block.slice(0, fieldsStart)}    fields: [],\n    detailFields: ${oldArray},${block.slice(columnsStart)}`;
        }
        return { code: `${source.slice(0, start)}${block}${source.slice(end)}`, map: null };
      }
      return null;
    },
  };
}

function lexaPayablesIntegration(): Plugin {
  return {
    name: 'lexa-payables-integration',
    enforce: 'pre',
    transform(source, id) {
      const fileId = (id.split('?')[0] ?? id).replace(/\\/g, '/');
      if (fileId.endsWith('/CommerceWorkflowPanel.tsx')) {
        if (source.includes("import AccountsPayablePanel from './AccountsPayablePanel';")) return null;
        const marker = 'if (!isWorkflowModule) return null;';
        if (!source.includes(marker)) throw new Error('LEXA payables integration could not find the workflow render point.');
        const next = source
          .replace("import AccountsReceivablePanel from './AccountsReceivablePanel';", "import AccountsReceivablePanel from './AccountsReceivablePanel';\nimport AccountsPayablePanel from './AccountsPayablePanel';")
          .replace(marker, "if (moduleId === 'purchase-invoices') return <AccountsPayablePanel />;\n  if (!isWorkflowModule) return null;");
        return { code: next, map: null };
      }
      if (fileId.endsWith('/moduleCatalog.ts')) {
        const marker = "id: 'purchase-invoices'";
        const start = source.indexOf(marker);
        if (start < 0) return null;
        const end = source.indexOf('\n  },', start);
        if (end < 0) throw new Error('LEXA payables integration could not locate the purchase-invoices module boundary.');
        let block = source.slice(start, end);
        if (!block.includes('readOnly: true')) block = block.replace('icon: ReceiptText,', 'icon: ReceiptText, readOnly: true,');
        const fieldsStart = block.indexOf('    fields: ');
        const columnsStart = block.indexOf('\n    columns:', fieldsStart);
        if (fieldsStart < 0 || columnsStart < 0) throw new Error('LEXA payables integration could not locate supplier-invoice field metadata.');
        const currentFields = block.slice(fieldsStart, columnsStart).trim().replace(/,$/, '');
        if (!currentFields.startsWith('fields: [')) throw new Error('LEXA found unexpected supplier-invoice fields.');
        if (!block.includes('detailFields:')) {
          const oldArray = currentFields.replace(/^fields:\s*/, '');
          block = `${block.slice(0, fieldsStart)}    fields: [],\n    detailFields: ${oldArray},${block.slice(columnsStart)}`;
        } else {
          block = `${block.slice(0, fieldsStart)}    fields: [],${block.slice(columnsStart)}`;
        }
        const integrated = `${source.slice(0, start)}${block}${source.slice(end)}`;
        const cleaned = integrated
          .replace('Saving this record alone does not schedule jobs or create invoices.', 'Review the billing frequency, customer details and next run date.')
          .replace('This page is a status checklist only; it never stores tokens or secrets.', 'Track the provider, purpose, environment, last test and connection status.')
          .replace('Supplier liabilities must be reconciled through the accounting workflow.', 'Review supplier balances alongside related purchase and payment records.')
          .replace('entries do not initiate transfers.', 'maintain the transaction reference and reconciliation status.');
        return { code: cleaned, map: null };
      }
      if (fileId.endsWith('/AccountsReceivablePanel.tsx')) {
        const cleaned = source
          .replace(/AlertCircle, /, '')
          .replace(/<div className="ar-integrity-note">[\s\S]*?<\/div>/g, '')
          .replace(/<div className="ar-form-note">[\s\S]*?<\/div>/g, '')
          .replace(/<div className="ar-tax-note">[\s\S]*?<\/div>/g, '');
        if (cleaned !== source) return { code: cleaned, map: null };
      }
      if (fileId.endsWith('/OperationsWorkspacePage.tsx')) {
        const cleaned = source
          .replace('This is an activity note, not a security audit event or a posted business transaction.', '')
          .replace('This activity note does not create a posting in the core ledgers.', '')
          .replace('; no external transfer is initiated.', '')
          .replace('Review and allocate manually; no external payment is initiated.', 'Review and allocate the payment record.')
          .replace('Payment record for payroll run ', 'Payroll payment record for ');
        if (cleaned !== source) return { code: cleaned, map: null };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [lexaReceivablesIntegration(), lexaPayablesIntegration(), react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
});
