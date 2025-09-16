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
    TxnDate: payload.txnDate,
    PrivateNote: payload.privateNote,
    PaymentType: payload.paymentType, // Cash or CreditCard
    AccountRef: payload.accountRef,
    EntityRef: payload.vendorRef, // Vendor
    Line: Lines,
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

/**
 * Fetch account by Id and return minimal info (Id, Name, AccountType).
 * @param {string} realmId
 * @param {string} id
 */
export async function getAccountById(realmId, id) {
  const q = `SELECT Id, Name, AccountType FROM Account WHERE Id = '${String(id).replace(/'/g, "''")}'`;
  const res = await qboQuery(realmId, q);
  const rows = res?.QueryResponse?.Account || [];
  return Array.isArray(rows) && rows.length ? rows[0] : undefined;
}

/**
 * Find vendor by exact DisplayName.
 * @param {string} realmId
 * @param {string} name
 */
export async function findVendorByName(realmId, name) {
  const q = `SELECT Id, DisplayName FROM Vendor WHERE DisplayName = '${String(name).replace(/'/g, "''")}'`;
  const res = await qboQuery(realmId, q);
  const rows = res?.QueryResponse?.Vendor || [];
  return Array.isArray(rows) && rows.length ? rows[0] : undefined;
}

/**
 * Create a vendor with minimal fields. Returns the created vendor.
 * @param {string} realmId
 * @param {{ displayName: string, email?: string, phone?: string, billAddr?: any }} v
 */
export async function createVendor(realmId, v) {
  const token = await getAccessToken(realmId);
  const u = new URL(`${QBO_BASE}/${encodeURIComponent(realmId)}/vendor`);
  u.searchParams.set('minorversion', MINOR_VERSION);
  // QBO expects the entity object directly for JSON payloads (no "Vendor" wrapper)
  const body = {
    DisplayName: v.displayName,
    CompanyName: v.displayName,
    PrimaryEmailAddr: v.email ? { Address: v.email } : undefined,
    PrimaryPhone: v.phone ? { FreeFormNumber: v.phone } : undefined,
    BillAddr: v.billAddr || undefined,
  };
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
 * Upsert vendor by DisplayName; returns { id, displayName }.
 * @param {string} realmId
 * @param {{ displayName: string, email?: string, phone?: string, billAddr?: any }} v
 */
export async function upsertVendorByName(realmId, v) {
  const existing = await findVendorByName(realmId, v.displayName);
  if (existing) return { id: existing.Id, displayName: existing.DisplayName, raw: existing };
  const created = await createVendor(realmId, v);
  const vend = created?.Vendor || created;
  return { id: vend?.Id, displayName: vend?.DisplayName, raw: vend };
}

/**
 * Find account by exact Name.
 * @param {string} realmId
 * @param {string} name
 */
export async function findAccountByName(realmId, name) {
  const q = `SELECT Id, Name, AccountType FROM Account WHERE Name = '${String(name).replace(/'/g, "''")}'`;
  const res = await qboQuery(realmId, q);
  const rows = res?.QueryResponse?.Account || [];
  return Array.isArray(rows) && rows.length ? rows[0] : undefined;
}

/**
 * Create an account. Defaults to Expense/Supplies for expense categories.
 * @param {string} realmId
 * @param {{ name: string, type?: string, detailType?: string, parentRef?: { value: string } }} a
 */
export async function createAccount(realmId, a) {
  const token = await getAccessToken(realmId);
  const u = new URL(`${QBO_BASE}/${encodeURIComponent(realmId)}/account`);
  u.searchParams.set('minorversion', MINOR_VERSION);
  const body = {
    Name: a.name,
    AccountType: a.type || 'Expense',
    AccountSubType: a.detailType || 'Supplies',
    ParentRef: a.parentRef || undefined,
  };
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
 * Upsert account by Name. Returns { id, name, accountType }.
 * @param {string} realmId
 * @param {{ name: string, type?: string, detailType?: string, parentRef?: { value: string } }} a
 */
export async function upsertAccountByName(realmId, a) {
  const existing = await findAccountByName(realmId, a.name);
  if (existing) {
    return { id: existing.Id, name: existing.Name, accountType: existing.AccountType, raw: existing };
  }
  const created = await createAccount(realmId, a);
  const acc = created?.Account || created;
  return { id: acc?.Id, name: acc?.Name, accountType: acc?.AccountType, raw: acc };
}
