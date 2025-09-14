import { getAccessToken } from './oauth.js';
import { safeFetch } from './utils.js';

const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const MINOR_VERSION = '65';

/**
 * Execute a QuickBooks Query.
 * @param {string} realmId
 * @param {string} q
 */
export async function qboQuery(realmId, q) {
  const token = await getAccessToken(realmId);
  const u = new URL(`${QBO_BASE}/${encodeURIComponent(realmId)}/query`);
  u.searchParams.set('query', q);
  u.searchParams.set('minorversion', MINOR_VERSION);
  const res = await safeFetch(u.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
  return res.json();
}

/**
 * Create a Purchase in QBO.
 * @param {string} realmId
 * @param {import('../routes/qbo-purchase.js').PurchaseInput} payload
 */
export async function createPurchase(realmId, payload) {
  const token = await getAccessToken(realmId);
  // Transform simplified input lines to QBO Purchase.Line format
  const Lines = payload.lines.map((l) => ({
    Amount: Number(l.amount),
    Description: l.description,
    DetailType: 'AccountBasedExpenseLineDetail',
    AccountBasedExpenseLineDetail: {
      AccountRef: l.expenseAccountRef,
      CustomerRef: l.customerRef,
      ClassRef: l.classRef,
      TaxCodeRef: l.taxCodeRef,
      BillableStatus: l.billableStatus,
    },
  }));

  const body = {
    Purchase: {
      TxnDate: payload.txnDate,
      PrivateNote: payload.privateNote,
      PaymentType: payload.paymentType, // Cash or CreditCard
      AccountRef: payload.accountRef,
      EntityRef: payload.vendorRef, // Vendor
      Line: Lines,
    },
  };

  const u = new URL(`${QBO_BASE}/${encodeURIComponent(realmId)}/purchase`);
  u.searchParams.set('minorversion', MINOR_VERSION);
  const res = await safeFetch(u.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Upload attachment and link to a Purchase via AttachableRef.
 * @param {string} realmId
 * @param {string} metadataJson JSON string for file_metadata_01
 * @param {Buffer} fileBuffer
 * @param {string} fileName
 * @param {string} mime
 */
export async function uploadAttachment(realmId, metadataJson, fileBuffer, fileName, mime) {
  const token = await getAccessToken(realmId);
  const u = new URL(`${QBO_BASE}/${encodeURIComponent(realmId)}/upload`);
  u.searchParams.set('minorversion', MINOR_VERSION);

  const fd = new FormData();
  fd.set('file_metadata_01', new Blob([metadataJson], { type: 'application/json' }), 'metadata.json');
  fd.set('file_content_01', new Blob([fileBuffer], { type: mime || 'application/octet-stream' }), fileName || 'upload.bin');

  const res = await safeFetch(u.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
    body: fd,
  });
  return res.json();
}

