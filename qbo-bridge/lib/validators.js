import { z } from 'zod';

// realmId is optional in requests; server falls back to the connected realm.
export const queryParamsSchema = z.object({
  realmId: z.string().min(1).optional(),
  q: z.string().min(1),
});

export const purchaseLineSchema = z.object({
  amount: z.number().positive(),
  description: z.string().optional(),
  expenseAccountRef: z.object({ value: z.string() }),
  customerRef: z.object({ value: z.string() }).optional(),
  classRef: z.object({ value: z.string() }).optional(),
  taxCodeRef: z.object({ value: z.string() }).optional(),
  billableStatus: z.enum(['NotBillable', 'Billable']).optional(),
});

export const purchaseSchema = z
  .object({
    realmId: z.string().min(1).optional(),
    paymentType: z.enum(['Cash', 'CreditCard']),
    accountRef: z.object({ value: z.string() }),
    vendorRef: z.object({ value: z.string() }).optional(),
    vendorName: z.string().min(1).optional(),
    txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    privateNote: z.string().optional(),
    lines: z.array(purchaseLineSchema).min(1),
  })
  .refine((v) => !!(v.vendorRef || v.vendorName), {
    path: ['vendorRef'],
    message: 'Provide vendorRef or vendorName',
  });

export const vendorUpsertSchema = z.object({
  realmId: z.string().min(1).optional(),
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  billAddr: z
    .object({
      Line1: z.string().optional(),
      City: z.string().optional(),
      CountrySubDivisionCode: z.string().optional(),
      PostalCode: z.string().optional(),
    })
    .optional(),
});

/**
 * @typedef {z.infer<typeof purchaseSchema>} PurchaseInput
 */
