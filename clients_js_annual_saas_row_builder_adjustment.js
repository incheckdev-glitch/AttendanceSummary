// Adjustment for getInvoiceAnnualSaasRenewalRows(client = {}) in clients.js.
// Do NOT hard-skip canceled invoices here if the UI option must be able to show them.
// Instead, preserve statuses on the row and let applyRenewalUiFilters decide visibility.

getInvoiceAnnualSaasRenewalRows(client = {}) {
  const invoices = Array.isArray(client.invoices) ? client.invoices : [];
  const rows = [];

  invoices.forEach(invoice => {
    const invoiceStatus = String(invoice.status || invoice.invoice_status || '').trim();
    const paymentStatus = String(invoice.payment_status || '').trim();

    const invoiceItems = Array.isArray(invoice.items)
      ? invoice.items
      : Array.isArray(invoice.invoice_items)
        ? invoice.invoice_items
        : [];

    invoiceItems.forEach(item => {
      const section = String(item.section || item.item_section || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');

      const itemText = [
        section,
        item.category,
        item.item_type,
        item.type,
        item.item_name,
        item.product_name,
        item.description
      ].filter(Boolean).join(' ').toLowerCase();

      const isAnnualSaas = section === 'annual_saas'
        || (itemText.includes('annual') && (itemText.includes('saas') || itemText.includes('subscription') || itemText.includes('license') || itemText.includes('licence')));

      if (!isAnnualSaas) return;

      const serviceStart = String(item.service_start_date || item.serviceStartDate || '').trim();
      const serviceEnd = String(item.service_end_date || item.serviceEndDate || '').trim();
      if (!serviceEnd) return;

      rows.push({
        id: item.id || `${invoice.id || invoice.invoice_number}-${item.line_no || item.location_name}`,
        location_name: item.location_name || item.locationName || '',
        item_name: item.item_name || item.itemName || item.product_name || '',
        agreement_id: invoice.agreement_id || item.agreement_id || '',
        agreement_number: invoice.agreement_number || item.agreement_number || '',
        invoice_id: invoice.id || invoice.invoice_id || '',
        invoice_number: invoice.invoice_number || invoice.invoiceNumber || '',
        service_start_date: serviceStart,
        service_end_date: serviceEnd,
        renewal_date: serviceEnd,
        renewal_due_date: serviceEnd,
        invoice_status: invoiceStatus,
        payment_status: paymentStatus,
        renewal_status: item.renewal_status || item.status || invoice.renewal_status || '',
        agreement_status: invoice.agreement_status || item.agreement_status || '',
        cancel_status: item.cancel_status || invoice.cancel_status || '',
        cancellation_status: item.cancellation_status || invoice.cancellation_status || '',
        renewal_decision: item.renewal_decision || invoice.renewal_decision || '',
        do_not_renew: item.do_not_renew || invoice.do_not_renew || false,
        is_cancelled: item.is_cancelled || invoice.is_cancelled || false,
        is_canceled: item.is_canceled || invoice.is_canceled || false,
        cancelled_at: item.cancelled_at || invoice.cancelled_at || '',
        canceled_at: item.canceled_at || invoice.canceled_at || '',
        amount: this.toNumberSafe ? this.toNumberSafe(item.line_total || item.total || item.amount || 0) : Number(item.line_total || item.total || item.amount || 0) || 0,
        source: 'invoice_item'
      });
    });
  });

  return rows;
},
