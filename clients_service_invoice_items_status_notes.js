// clients-service.js direction:
// When attaching invoice_items to invoices, preserve invoice/item status fields.
// Do not remove canceled rows at service level if the frontend needs an option to show/hide them.

attachInvoiceItems(invoices = [], invoiceItems = []) {
  const byInvoiceKey = new Map();

  const add = (key, item) => {
    const normalized = String(key || '').trim();
    if (!normalized) return;
    if (!byInvoiceKey.has(normalized)) byInvoiceKey.set(normalized, []);
    byInvoiceKey.get(normalized).push(item);
  };

  invoiceItems.forEach(item => {
    add(item.invoice_id, item);
    add(item.invoiceId, item);
    add(item.invoice_number, item);
    add(item.invoiceNumber, item);
  });

  return invoices.map(invoice => {
    const keys = [
      invoice.id,
      invoice.invoice_id,
      invoice.invoiceId,
      invoice.invoice_number,
      invoice.invoiceNumber
    ].map(value => String(value || '').trim()).filter(Boolean);

    const seen = new Set();
    const items = [];

    keys.forEach(key => {
      (byInvoiceKey.get(key) || []).forEach(item => {
        const itemKey = String(item.id || `${item.invoice_id}-${item.line_no}-${item.location_name}`).trim();
        if (seen.has(itemKey)) return;
        seen.add(itemKey);
        items.push({
          ...item,
          invoice_status: invoice.status || invoice.invoice_status || '',
          invoice_payment_status: invoice.payment_status || '',
          invoice_number: item.invoice_number || invoice.invoice_number || invoice.invoiceNumber || '',
          agreement_number: item.agreement_number || invoice.agreement_number || '',
          agreement_id: item.agreement_id || invoice.agreement_id || ''
        });
      });
    });

    return {
      ...invoice,
      items,
      invoice_items: items
    };
  });
},
