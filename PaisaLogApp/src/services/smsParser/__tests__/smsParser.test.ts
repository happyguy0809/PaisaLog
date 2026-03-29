// ─────────────────────────────────────────────────────────
// smsParser.test.ts
// Run: npx jest src/services/smsParser
// ─────────────────────────────────────────────────────────

import { parseSMS, traceSummary } from '../index'

const cases = [
  {
    id: 'HDFC_UPI_DEBIT',
    sender: 'HDFCBK',
    body: 'Rs.250.00 debited from XXXX1234 to Swiggy UPI Ref:884729372 on 28-Mar-26. Avl Bal: Rs.12,500.00',
    expect: { amount: 25000, currency: 'INR', account: 'XXXX1234', action: 'debit', merchant: 'Swiggy', reference: '884729372', date: '2026-03-28', balance: 1250000 },
  },
  {
    id: 'NO_SYMBOL_DEBITED_BY',
    sender: 'BarodaM',
    body: 'A/C X9803 debited by 130 trf to CAFE AMUDHAM UPI Ref No 429384729382 on 28-Mar-2026',
    expect: { amount: 13000, account: 'XXXX9803', action: 'debit', merchant: 'CAFE AMUDHAM', reference: '429384729382', date: '2026-03-28' },
  },
  {
    id: 'SBI_NEFT_CREDIT',
    sender: 'SBIINB',
    body: 'INR 10,000.00 credited to Acct XX9803 by NEFT. Ref No. 20260328001234. Balance: INR 55,000.00',
    expect: { amount: 1000000, currency: 'INR', account: 'XXXX9803', action: 'credit', reference: '20260328001234' },
  },
  {
    id: 'CARD_PURCHASE_AT',
    sender: 'ICICIB',
    body: 'INR 3,499.00 spent on Credit Card XX0480 at AMAZON on 28-Mar-26.',
    expect: { amount: 349900, currency: 'INR', account: 'XXXX0480', action: 'debit', merchant: 'AMAZON', date: '2026-03-28' },
  },
  {
    id: 'REFUND',
    sender: 'KOTAK',
    body: 'Rs.199.00 refunded to your account XXXX5678 by Zomato on 27-Mar-2026. Ref: TXN8827634',
    expect: { amount: 19900, action: 'refund', account: 'XXXX5678', merchant: 'Zomato', date: '2026-03-27' },
  },
  {
    id: 'VPA_HANDLE',
    sender: 'PAYTM',
    body: 'Rs.500 sent to paytm@axisbank on 28-Mar-26. UPI Ref: 329847263847. Balance: Rs.2,300',
    expect: { amount: 50000, action: 'debit', merchant: 'paytm', reference: '329847263847', balance: 230000 },
  },
  {
    id: 'LABELLED_FORMAT',
    sender: 'NEWBNK',
    body: 'Txn ID: TXN20260328001 | Amount: Rs.750 | Status: Debited | From: XXXX7890 | To: BIG BAZAAR | Date: 28/03/2026',
    expect: { amount: 75000, action: 'debit', account: 'XXXX7890', merchant: 'BIG BAZAAR', date: '2026-03-28', reference: 'TXN20260328001' },
  },
  {
    id: 'USD_FOREIGN',
    sender: 'HDFCBK',
    body: 'USD 29.99 charged on your card XX1234 at NETFLIX on 28-Mar-2026.',
    expect: { amount: 2999, currency: 'USD', account: 'XXXX1234', action: 'debit', merchant: 'NETFLIX', date: '2026-03-28' },
  },
  {
    id: 'DEAR_SALUTATION',
    sender: 'AXISBK',
    body: 'Dear Utkarsh, EMI of Rs.2,999.00 for Credit Card XXXX2233 debited on 28-Mar-2026. Avl Bal Rs.47,001',
    expect: { amount: 299900, action: 'debit', account: 'XXXX2233', date: '2026-03-28', user_name: 'Utkarsh', balance: 4700100 },
  },
]

describe('parseSMS — universal parser', () => {
  test.each(cases)('$id', ({ sender, body, expect: expected }) => {
    const result = parseSMS(body, sender)
    console.log(`  ${traceSummary(result)}`)

    for (const [field, val] of Object.entries(expected)) {
      const actual = (result.parsed as any)[field]
      const extractor = result.trace.fields[field as any]?.winning_extractor ?? 'none'
      expect(actual).toBe(val)  // if fails: check extractor name above
    }
  })
})
