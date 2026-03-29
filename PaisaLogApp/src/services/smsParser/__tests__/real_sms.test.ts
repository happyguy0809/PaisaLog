// ─────────────────────────────────────────────────────────────
// real_sms.test.ts — runs actual SMS from device through parser
// Generated from adb dump — 75 financial SMS
// ─────────────────────────────────────────────────────────────

import { parseSMS, traceSummary, isFinancialSms } from '../index'

const cases = [
  {
    id: 'REAL_000',
    sender: "AX-SBICRD-P",
    body: "Get Simply SAVE UPI SBI Credit Card at Zero Joining Fee & enjoy Reward points on UPI Spends! Apply before 31 MAR 2026: https://shrtsms.in/SBICRD/c77y4W TnC",
  },
  {
    id: 'REAL_001',
    sender: "VD-BOBCRD-P",
    body: "Pre-approved instant money on your BOBCARD xx0971. No paperwork, quick disbursal! Avail Now: https://bobcrd.in/BOBCRD/xdJbXU Get Cash in a Flash! TCA.",
  },
  {
    id: 'REAL_002',
    sender: "VM-BOBCRD-S",
    body: "Dear Utkarsh Kumar, your BOBCARD Credit Card xx0971 is enabled for outstanding conversion to EMI.  Check details: bobc.in/BOBCRD/MdEGtEjaPQ - BOBCARD",
  },
  {
    id: 'REAL_003',
    sender: "JD-SBIUPI-S",
    body: "Dear UPI user A/C X9803 debited by 130.00 on date 28Mar26 trf to CAFE AMUDHAM Refno 608716998101 If not u? call-1800111109 for other services-18001234-SBI",
  },
  {
    id: 'REAL_004',
    sender: "VM-SBICRD-S",
    body: "Rs.679.38 spent on your SBI Credit Card ending 5212 at CLEARTRIPPRIVATELIMI on 28/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_005',
    sender: "VK-SBICRD-T",
    body: "269417 is the OTP for Trxn. of INR 679.38 at CLEARTRIP  with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_006',
    sender: "VM-BINDAL-P",
    body: "Hello From Bindals! This Summer Season Get Amazing offers on MANY BRANDS  LEVIS PEPE Shop For Rs 6999 Get 1000 OFF  MUFTI SPYKAR Shop For Rs 7000 Get 1000 OFF",
  },
  {
    id: 'REAL_007',
    sender: "VM-SBICRD-S",
    body: "Rs.6,119.00 spent on your SBI Credit Card ending 5212 at InfRashiEcoTourism on 28/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_008',
    sender: "VK-SBICRD-T",
    body: "045316 is the OTP for Trxn. of INR 6119.00 at Rashi Eco  with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_009',
    sender: "VA-SBICRD-S",
    body: "Rs.18,500.00 spent on your SBI Credit Card ending 5212 at RAZRASHIECOTOURISMPRI on 28/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_010',
    sender: "VM-SBICRD-T",
    body: "127425 is the OTP for Trxn. of INR 18500.00 at RASHI ECO  with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_011',
    sender: "VD-BOBCRD-P",
    body: "Boost Your Buying Power! Instantly enhance your BOBCARD XX0971 credit limit to Rs. 94500! No paperwork, click now: https://bobcrd.in/BOBCRD/YBGZTJ *T&C Apply",
  },
  {
    id: 'REAL_012',
    sender: "AX-SBICRD-P",
    body: "Get Simply SAVE UPI SBI Credit Card at Zero Joining Fee & enjoy Reward points on UPI Spends! Apply before 31 MAR 2026: https://shrtsms.in/SBICRD/c6PNVV TnC",
  },
  {
    id: 'REAL_013',
    sender: "JD-BOBCRD-S",
    body: "ALERT: INR 20.00 is spent on your BOBCARD ending 0971 at Upi-rashi Eco Tourism on 27-03-2026. Available credit limit is Rs 58,547.22, Current outstanding is Rs 11,432.78. Not you?  Call 18002090 (toll-free)",
  },
  {
    id: 'REAL_014',
    sender: "VM-BOBCRD-S",
    body: "Dear Utkarsh Kumar, your BOBCARD Credit Card xx0971 is enabled for outstanding conversion to EMI.  Check details: bobc.in/BOBCRD/MKwOYRlUuQ - BOBCARD",
  },
  {
    id: 'REAL_015',
    sender: "AX-SBICRD-P",
    body: "Get Simply SAVE UPI SBI Credit Card at Zero Joining Fee & enjoy Reward points on UPI Spends! Apply before 31 MAR 2026: https://shrtsms.in/SBICRD/c6xYfp TnC",
  },
  {
    id: 'REAL_016',
    sender: "AD-RBISAY-S",
    body: "Digital Rupee (e\u20b9) is India's Central Bank Digital Currency. Cash, but digital. Issued by RBI and can be held in a wallet. Works on any QR, including UPI QR. -RBI",
  },
  {
    id: 'REAL_017',
    sender: "VM-BOBCRD-S",
    body: "ALERT: INR 70.00 is spent on your BOBCARD ending 0971 at Upi-raveesha R C on 26-03-2026. Available credit limit is Rs 58,567.22, Current outstanding is Rs 11,338.78. Not you?  Call 18002090 (toll-free)",
  },
  {
    id: 'REAL_018',
    sender: "VD-SBICRD-S",
    body: "Dear Cardholder, to avoid transaction decline over and above the Credit Limit on your SBI Credit Card, please enable Overlimit facility at https://sbicard.com/ovlconsent. TnC Apply.",
  },
  {
    id: 'REAL_019',
    sender: "AX-BOBCRD-S",
    body: "Dear Utkarsh Kumar, your BOBCARD Credit Card xx0971 is enabled for outstanding conversion to EMI.  Check details: bobc.in/BOBCRD/M4ivvTHuXQ - BOBCARD",
  },
  {
    id: 'REAL_020',
    sender: "AX-iCROCS-P",
    body: "Your Iconic CROCS comfort is waiting! We have a special Rs.750 off GV just for you! Discover fresh new collections with CROCS! Use code TU6DCQ at your nearest store xxxxxxxxxxx T&C",
  },
  {
    id: 'REAL_021',
    sender: "AX-ICICIT-S",
    body: "Manage spends effectively by increasing the limit on ICICI Bank Credit Card XX0003 from Rs500000 to Rs600000. SMS CRLIM 0003 to 5676766 to raise the limit",
  },
  {
    id: 'REAL_022',
    sender: "VM-BOBCRD-S",
    body: "ALERT: INR 24.00 is spent on your BOBCARD ending 0971 at Upi-ravi Stores on 26-03-2026. Available credit limit is Rs 58,637.22, Current outstanding is Rs 11,338.78. Not you?  Call 18002090 (toll-free)",
  },
  {
    id: 'REAL_023',
    sender: "AX-SBICRD-S",
    body: "Rs.346.00 spent on your SBI Credit Card ending 5212 at ZEPTOMARKETPLACEPRIVATE on 26/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_024',
    sender: "VK-SBICRD-T",
    body: "694015 is the OTP for Trxn. of INR 346.00 at ZEPTO MARK with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_025',
    sender: "VM-BOBCRD-S",
    body: "ALERT: INR 100.00 is spent on your BOBCARD ending 0971 at Upi-raveesha R C on 25-03-2026. Available credit limit is Rs 58,661.22, Current outstanding is Rs 10,561.78. Not you?  Call 18002090 (toll-free)",
  },
  {
    id: 'REAL_026',
    sender: "VD-BOBCRD-S",
    body: "ALERT: INR 548.00 is spent on your BOBCARD ending 0971 at Upi-parameshwari Trade on 25-03-2026. Available credit limit is Rs 58,761.22, Current outstanding is Rs 10,561.78. Not you?  Call 18002090 (toll-free)",
  },
  {
    id: 'REAL_027',
    sender: "VD-BOBCRD-S",
    body: "ALERT: INR 129.00 is spent on your BOBCARD ending 0971 at Upi-meesho on 25-03-2026. Available credit limit is Rs 59,309.22, Current outstanding is Rs 10,561.78. Not you?  Call 18002090 (toll-free)",
  },
  {
    id: 'REAL_028',
    sender: "AX-SBICRD-S",
    body: "Dear SBI Cardholder, payment of Rs. 55200.00 for your SBI Credit Card has been successfully processed. ref no : CHD57131FMRUTM.",
  },
  {
    id: 'REAL_029',
    sender: "AD-SBICRD-S",
    body: "Rs.9,123.38 spent on your SBI Credit Card ending 5212 at ONLINEGNN on 25/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_030',
    sender: "VK-SBICRD-T",
    body: "434609 is the OTP for Trxn. of INR 9123.38 at ONLINEGNN  with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_031',
    sender: "AD-SBICRD-S",
    body: "We have received payment of Rs.55,200.00 via UPI & the same has been credited to your SBI Credit Card. Your available limit is Rs.60,863.40.",
  },
  {
    id: 'REAL_032',
    sender: "AX-SBIUPI-S",
    body: "Dear UPI user A/C X9803 debited by 55200.00 on date 25Mar26 trf to SBI CARDS Refno 608433689275 If not u? call-1800111109 for other services-18001234-SBI",
  },
  {
    id: 'REAL_033',
    sender: "VM-SBIPSG-S",
    body: "Dear Customer, INR 18,000.00 credited to your A/c No XX9803 on 25/03/2026 through NEFT with UTR HSBCN08430770534 by MR UTKARSH KUMAR, INFO: BATCHID:0028 /ACC/NEFT-SBI",
  },
  {
    id: 'REAL_034',
    sender: "AX-ICICIT-S",
    body: "ICICI Bank Acct XX480 debited with Rs 40,000.00 on 25-Mar-26 & Acct XX803 credited.IMPS:608413456333. Call 18002662 for dispute or SMS BLOCK 480 to 9215676766",
  },
  {
    id: 'REAL_035',
    sender: "AD-SBIPSG-T",
    body: "Dear Customer, Your a/c no. XXXXXXXX9803 is credited by Rs.40000.00 on 25-03-26 by a/c linked to mobile 8XXXXXX628-UTKARSH KU (IMPS Ref# 608413456333)-SBI",
  },
  {
    id: 'REAL_036',
    sender: "VM-SBIUPI-S",
    body: "Dear UPI user A/C X9803 debited by 1646.00 on date 25Mar26 trf to Google India Dig Refno 608433204760 If not u? call-1800111109 for other services-18001234-SBI",
  },
  {
    id: 'REAL_037',
    sender: "AX-SBICRD-S",
    body: "Dear Cardholder, your transaction of Rs.9,123.38 at ONLINEGNN on 25-03-26 was declined due to insufficient Credit Limit on your SBI Credit Card XXXX5212. However, you can avail a temporary increase in your Credit Limit from Rs.100,000.00 to Rs. 105,000.00 and complete your transaction. To avail, visit https://wa.me/message/JM2ODGXUSX5YG1 by 26-03-26. TnC Apply",
  },
  {
    id: 'REAL_038',
    sender: "VK-SBICRD-T",
    body: "776343 is the OTP for Trxn. of INR 9123.38 at ONLINEGNN  with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_039',
    sender: "AD-SBICRD-P",
    body: "Enjoy Zero Processing Fee and up to 1% lower interest rate on Flexipay EMI! Simply convert your SBI Credit Card spends into easy EMIs for 24 months or more. Hurry! Offer valid till 26 Mar'26. Book Now: https://app.sbicard.com/SBICRD/FPTxn. T&C",
  },
  {
    id: 'REAL_040',
    sender: "AX-SBICRD-S",
    body: "Dear Cardholder, with the Balance Transfer on EMI facility on your credit card, you can avoid high interest rates! Simply transfer your other bank credit card's outstanding to your SBI Credit Card and pay in easy EMIs. Visit https://app.sbicard.com/SBICRD/BTEMI - SBI Card",
  },
  {
    id: 'REAL_041',
    sender: "AX-JUICHE-P",
    body: "Your Juicy Chemistry cart is waiting. Enjoy Free Shipping on orders over Rs.499. Code: FREESHIPPING. Valid for 48 hrs only. https://d.bik.ai/JUICHE/y/noLRzb",
  },
  {
    id: 'REAL_042',
    sender: "AX-BOBCRD-P",
    body: "Make every spend count! Use BOBCARD0971 this month & earn 2000 Bonus Reward Points on a total spend of Rs 15,000+ Offer valid till  6-31st Mar'26. T&Cs: bobcard.io/SpendNWin2000RP",
  },
  {
    id: 'REAL_043',
    sender: "AD-SBICRD-P",
    body: "First Year Free! Get SimplySAVE UPI SBI Credit Card at No Joining Fee and enjoy up to 10X Reward Points on UPI spends. TnC. Apply by 31 MAR 2026: https://1kx.in/SBICRD/y6WSnG",
  },
  {
    id: 'REAL_044',
    sender: "VA-BOBCRD-P",
    body: "School/college fees due? Pay Rs 25,000+ using your BOBCARD 0971 and earn 3000 Bonus Reward Points on education spends. T&Cs apply bobcard.io/Educampaign3",
  },
  {
    id: 'REAL_045',
    sender: "AX-SBICRD-S",
    body: "Alert! You have consumed 80% Credit Limit. Balance Limit: Rs.5,663.40. Avoid trxn. decline with Overlimit facility. Visit https://sbicard.com/ovl. T&C-SBI Card",
  },
  {
    id: 'REAL_046',
    sender: "AX-SBICRD-S",
    body: "Rs.3,423.00 spent on your SBI Credit Card ending 5212 at Flipkart on 24/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_047',
    sender: "VK-SBICRD-T",
    body: "762427 is the OTP for Trxn. of INR 3423.00 at Flipkart with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_048',
    sender: "AX-SBICRD-P",
    body: "Enjoy Zero Processing Fee and up to 1% lower interest rate on Flexipay EMI! Simply convert your SBI Credit Card spends into easy EMIs for 24 months or more. Hurry! Offer valid till 26 Mar'26. Book Now: https://app.sbicard.com/SBICRD/FPTxn. T&C",
  },
  {
    id: 'REAL_049',
    sender: "AX-BOBCRD-S",
    body: "Dear Utkarsh Kumar, your BOBCARD Credit Card xx0971 is enabled for outstanding conversion to EMI.  Check details: bobc.in/BOBCRD/MoHpR61g5Q - BOBCARD",
  },
  {
    id: 'REAL_050',
    sender: "AX-SBICRD-P",
    body: "Get Simply SAVE UPI SBI Credit Card at Zero Joining Fee & enjoy Reward points on UPI Spends! Apply before 31 MAR 2026: https://1kx.in/SBICRD/r3uACK TnC",
  },
  {
    id: 'REAL_051',
    sender: "VM-SBICRD-S",
    body: "Alert! You have consumed 80% Credit Limit. Balance Limit: Rs.9,077.25. Avoid trxn. decline with Overlimit facility. Visit https://sbicard.com/ovl. T&C-SBI Card",
  },
  {
    id: 'REAL_052',
    sender: "VM-SBICRD-S",
    body: "Rs.266.00 spent on your SBI Credit Card ending 5212 at SwiggyLimited on 22/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_053',
    sender: "VK-SBICRD-T",
    body: "812256 is the OTP for Trxn. of INR 266.00 at Swiggy Lim with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_054',
    sender: "VD-BOBCRD-P",
    body: "Alert! Convert your recent BOBCARD XX0971 statement into EMI with 36 or 48 months tenure @12% p.a. Hurry! Avail now at https://bobcrd.in/BOBCRD/Z7SKY5",
  },
  {
    id: 'REAL_055',
    sender: "AD-BOBCRD-S",
    body: "Dear Utkarsh Kumar, instant funds available on BOBCARD Credit Card 0971. Get loan by clicking: bobc.in/BOBCRD/MQXxvJvUvQ - BOBCARD",
  },
  {
    id: 'REAL_056',
    sender: "AX-SBICRD-P",
    body: "Dear Cardholder, you are eligible for up to 3 complimentary Add-on cards for your family members. Apply now : https://app.sbicard.com/MYSBIC TnC - SBI Card",
  },
  {
    id: 'REAL_057',
    sender: "CP-HOABL-P",
    body: "ACT FAST! G.O.A.A. premium residences @Rs.1.22CR. Prices go up this Sunday. Limited inventory left! House of Abhinandan Lodha 02269098042 xm1.in/HOABL/xl/17tv86",
  },
  {
    id: 'REAL_058',
    sender: "VA-SBICRD-S",
    body: "Alert! You have consumed 80% Credit Limit. Balance Limit: Rs.9,343.25. Avoid trxn. decline with Overlimit facility. Visit https://sbicard.com/ovl. T&C-SBI Card",
  },
  {
    id: 'REAL_059',
    sender: "VM-SBICRD-S",
    body: "Rs.4,882.00 spent on your SBI Credit Card ending 5212 at MEESHO on 22/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_060',
    sender: "VK-SBICRD-T",
    body: "690342 is the OTP for Trxn. of INR 4882.00 at MEESHO with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_061',
    sender: "VM-BOBCRD-S",
    body: "ALERT: INR 440.00 is spent on your BOBCARD ending 0971 at Upi-meghala on 21-03-2026. Available credit limit is Rs 59,438.22, Current outstanding is Rs 9,321.78. Not you?  Call 18002090 (toll-free)",
  },
  {
    id: 'REAL_062',
    sender: "VM-BOBCRD-S",
    body: "ALERT: INR 390.00 is spent on your BOBCARD ending 0971 at Upi-vidyanand Kumar on 21-03-2026. Available credit limit is Rs 59,878.22, Current outstanding is Rs 9,321.78. Not you?  Call 18002090 (toll-free)",
  },
  {
    id: 'REAL_063',
    sender: "VM-BOBCRD-P",
    body: "Pre-approved instant money on your BOBCARD xx0971. No paperwork, quick disbursal! Avail Now: https://bobcrd.in/BOBCRD/6c9Nzl Get Cash in a Flash! TCA.",
  },
  {
    id: 'REAL_064',
    sender: "VM-SBICRD-P",
    body: "Dear SBI Cardholder, your current available limit is Rs.14,234.41. Your card is eligible for an enhanced credit limit of Rs.250,000.00. To avail, SMS INCR 5212 to 5676791. Avail service by 21-03-2026.",
  },
  {
    id: 'REAL_065',
    sender: "VM-SBICRD-S",
    body: "Rs.2,376.00 spent on your SBI Credit Card ending 5212 at Flipkart on 21/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_066',
    sender: "VK-SBICRD-T",
    body: "936498 is the OTP for Trxn. of INR 2376.00 at Flipkart with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_067',
    sender: "VM-SBICRD-P",
    body: "Dear SBI Cardholder, your current available limit is Rs.16,610.41. Your card is eligible for an enhanced credit limit of Rs.250,000.00. To avail, SMS INCR 5212 to 5676791. Avail service by 21-03-2026.",
  },
  {
    id: 'REAL_068',
    sender: "VM-SBICRD-S",
    body: "Rs.2,313.00 spent on your SBI Credit Card ending 5212 at Flipkart on 21/03/26. Trxn. not done by you? Report at https://sbicard.com/Dispute",
  },
  {
    id: 'REAL_069',
    sender: "VK-SBICRD-T",
    body: "858793 is the OTP for Trxn. of INR 2313.00 at Flipkart with your credit card ending 5212. OTP is valid for 10 mins. Do not share it with anyone - SBI Card",
  },
  {
    id: 'REAL_070',
    sender: "VD-BOBCRD-P",
    body: "Boost Your Buying Power! Instantly enhance your BOBCARD XX0971 credit limit to Rs. 94500! No paperwork, click now: https://bobcrd.in/BOBCRD/912w3P *T&C Apply",
  },
  {
    id: 'REAL_071',
    sender: "AX-SBICRD-P",
    body: "First Year Free! Get SimplySAVE UPI SBI Credit Card at No Joining Fee and enjoy up to 10X Reward Points on UPI spends. TnC. Apply by 31 MAR 2026: https://1kx.in/SBICRD/cEQG72",
  },
  {
    id: 'REAL_072',
    sender: "AX-BOBCRD-P",
    body: "School/college fees due? Pay Rs 25,000+ using your BOBCARD 0971 and earn 3000 Bonus Reward Points on education spends. T&Cs apply bobcard.io/Educampaign3",
  },
  {
    id: 'REAL_073',
    sender: "VM-BOBCRD-S",
    body: "ALERT: INR 160.00 is spent on your BOBCARD ending 0971 at Upi-sundhar Fruits on 21-03-2026. Available credit limit is Rs 60,268.22, Current outstanding is Rs 9,321.78. Not you?  Call 18002090 (toll-free)",
  },
  {
    id: 'REAL_074',
    sender: "JK-BOBCRD-S",
    body: "ALERT: INR 180.00 is spent on your BOBCARD ending 0971 at Upi-b Kavi Priya on 21-03-2026. Available credit limit is Rs 60,428.22, Current outstanding is Rs 9,321.78. Not you?  Call 18002090 (toll-free)",
  },
]

describe('parseSMS — real device SMS', () => {
  // Stats
  let high = 0, mid = 0, low = 0, mandFail = 0

  afterAll(() => {
    console.log('\n=== REAL SMS PARSE RESULTS ===')
    console.log(`High conf (≥80%): ${high}/${cases.length}`)
    console.log(`Mid  conf (60-79%): ${mid}/${cases.length}`)
    console.log(`Low  conf (<60%): ${low}/${cases.length}`)
    console.log(`Mandatory field failures: ${mandFail}/${cases.length}`)
  })

  test.each(cases)('$id', ({ sender, body }) => {
    if (!isFinancialSms(body, sender)) {
      console.log(`⚪ SKIPPED (non-financial) | ${sender} | ${body.slice(0, 60)}...`)
      return
    }
    const result = parseSMS(body, sender)
    const { parsed: p, trace: t } = result

    const conf = t.overall_confidence
    if (conf >= 80) high++
    else if (conf >= 60) mid++
    else low++
    if (t.mandatory_missing.length > 0) mandFail++

    // Log every result so we can see what's failing
    console.log([
      conf >= 80 ? '🟢' : conf >= 60 ? '🟡' : '🔴',
      `${conf}%`,
      sender.padEnd(15),
      `amt=${p.amount ?? '?'}`,
      `action=${p.action ?? '?'}`,
      `acct=${p.account ?? '?'}`,
      `merchant=${p.merchant ?? '?'}`,
      `bank=${p.bank_name ?? '?'}`,
      t.mandatory_missing.length ? `⚠ MISSING:[${t.mandatory_missing.join(',')}]` : '',
    ].filter(Boolean).join(' | '))

    // Only hard-assert that we don't crash
    expect(result).toBeDefined()
    expect(result.parsed).toBeDefined()
    expect(result.trace).toBeDefined()
  })
})
