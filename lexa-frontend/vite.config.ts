import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Adds the dedicated AR workflow to the existing module shell without replacing the
 * operational-workflows component. Also makes sales invoices read-only in the generic
 * register so invoice state can only be changed through the typed backend endpoints.
 */
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
        if (!source.includes(importMarker) || !source.includes(renderMarker)) {
          throw new Error('LEXA receivables integration could not find the expected CommerceWorkflowPanel extension points.');
        }
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
        if (end < 0) throw new Error('LEXA receivables integration could not locate the sales-invoices module definition boundary.');
        let block = source.slice(start, end);
        if (!block.includes('readOnly: true')) {
          block = block.replace('icon: ReceiptText,', 'icon: ReceiptText, readOnly: true,');
          const fieldsStart = block.indexOf('    fields: ');
          const columnsStart = block.indexOf('\n    columns:', fieldsStart);
          if (fieldsStart < 0 || columnsStart < 0) throw new Error('LEXA receivables integration could not find the sales invoice field metadata.');
          const oldFields = block.slice(fieldsStart, columnsStart).trim().replace(/,$/, '');
          const oldArray = oldFields.replace(/^fields:\s*/, '');
          if (!oldArray.startsWith('[') || !oldArray.endsWith(']')) throw new Error('LEXA receivables integration found an unexpected sales invoice field declaration.');
          block = `${block.slice(0, fieldsStart)}    fields: [],\n    detailFields: ${oldArray},${block.slice(columnsStart)}`;
        }
        return { code: `${source.slice(0, start)}${block}${source.slice(end)}`, map: null };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [lexaReceivablesIntegration(), react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
});
