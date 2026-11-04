
# LEXA Inventory — Solar Volt Release

## Release contents

This full repository ZIP includes the previously approved Selling and Logistics work and now adds ten Inventory screens backed by the shared tenant-scoped LEXA product, stock, purchasing, finance, manufacturing and fulfilment records.

1. Products: Product catalogue, barcode matching, buying and selling prices, stock thresholds, optional batch and serial tracking settings, and live inventory intelligence.
2. Stock & Movements: True on-hand movement history, reserved quantities, estimated cost-based inventory, shortages, inward/outward trends, ageing/slow-selling inventory and expiry risk. Opening stock remains the existing audited flow; controlled physical corrections are routed through Stock Counts.
3. Goods Receiving: Select actual outstanding purchase orders and a storage area, enter accepted and rejected quantities and batch/expiry/serials, and post using the existing authoritative receipt/finance workflow.
4. Stock Counts: Blind entry of physical quantities, followed by existing submission, review and approval. Approved differences are posted by the supply-chain backend with applicable financial entries.
5. Batch & Lot Tracking: Trace real supplier lots, storage location, serial-controlled product eligibility, dates and sales history. Authorised inventory staff may quarantine or release an inspected non-expired lot, with audit reasons and reservation checks.
6. Replenishment: Existing backend suggestions combine stock available, reserved, quarantined and already ordered quantities, demand history, safety levels and supplier lead times. Separate approval is still required for supplier purchasing.
7. Stock Transfers: Source/destination are storage areas within one business, with actual dispatch and receiving movements, support for lot and serial selection, no creation of business branches.
8. Warehouses & Locations: Real storage areas, shelves/bins and ownership within one business, linked to the existing catalogue warehouses and movement history.
9. Picklists: Create picking tasks linked to confirmed customer orders, scan catalogue barcodes and confirm products with the existing reservations workflow; use Packages to complete packing.
10. Item Bundles: Save structured bills of materials with actual component quantities, estimated unit component costs and possible assemblies. Approved work orders perform stock changes for assembled products.

### Cross-business connections

- Products and their unique IDs are shared by Checkout, Sales Orders, Supplier Purchases, Customer Returns, Packages and Finance.
- Purchases and approved goods receipts add stock once, with appropriate accounting journal entries.
- Completed sales and sales-order dispatch remove goods once at the applicable recorded costs. Picking and packing are not sales.
- Approved stock counts use the existing inventory movement and finance adjustment process.
- Warehouse transfers move goods internally without creating new business inventory.
- Inventory Intelligence uses actual movement history, sales records, product purchase-cost estimates, reservations and expiry dates. A stock estimate does **not** replace the formally reconciled Finance inventory balance.
- Reorder suggestions are recommendations, not purchases or supplier payments.

### Deployment

1. Download and keep the archive as a ZIP on your phone. Use the existing clean-repository GitHub refresh workflow. There is no extra README_FIRST.md at the ZIP root.
2. Allow Render to finish the previously added finance/logistics migrations (if not already applied) before redeploying the Vercel frontend.
3. Verify an existing CEO can access all ten Inventory modules, add a product, create a storage area and record opening stock.
4. Create a purchase order, receive accepted goods, and verify on-hand stock and Finance changed exactly once.
5. Confirm a customer sale, dispatch an order and verify stock decreases exactly once. Test picking and packing first.
6. Physically count a product and test submit → review → approve. Compare the resulting quantity and financial valuation.
7. Test warehouse-to-warehouse transfer dispatch and receiving, and check that total company inventory remains unchanged.
8. Test lot expiry and restricted status. Quarantine an unreserved lot and verify it is not sellable, then test release only after inspection.
9. Set a reorder policy, inspect suggested purchase quantity, and confirm it does not create an unapproved purchase order.
10. Test batch/serial receiving with a real valid barcode and ensure the browser grants camera permission on HTTPS.

### Important limitations

- The business's existing authorised permissions determine staff access. A CEO/Owner continues to have full control.
- Product image uploads and file storage, supplier WhatsApp/SMS automation, advanced forecasting with seasonal prediction, offline stock syncing, and URA EFRIS inventory synchronisation are **not claimed as connected** by this release.
- A virtual checkout bundle with direct component deduction is not implemented. **Physical assembled bundles** are connected through the existing manufacturing BOM and approved work-order process.
- Item costs shown on the Inventory dashboard are an *estimate at the currently recorded purchase cost*. Use Finance for authoritative posted valuation; this is not a replacement for an accounting valuation method or cost-layer reconciliation.
- New inventory screens show real records; a new business may legitimately have no movements, products or graphs. Empty-state messages are not failures.
- Automated approval tiers for every type of adjustment and predictive purchase ordering require business-defined policies. Manual stock-count approval is the safe correction workflow in this release.
- Integration/build tests and read-only database plan checks are not proof that the live phone browser, real camera or provider accounts are operational. Test after uploading and deploying.
- Live production data and hosted services were not altered as part of packaging this release.

## Source integrity and testing

- Backend and frontend TypeScript compilation.
- Existing frontend and backend automated tests, including new inventory regression checks.
- Exact OpenAPI path/HTTP-method coverage including new stock intelligence and lot actions.
- Database SQL read-only EXPLAIN checks on a cloned Neon branch, including correction of one existing `inventory_lots` sorting assumption.
- Complete repository structure validation and ZIP test. No automatically generated dependency folders, environment secrets or extra root files.

