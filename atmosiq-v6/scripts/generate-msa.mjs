import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Tab, TabStopType, TabStopPosition } from 'docx'
import { writeFileSync } from 'fs'

const FONT = 'Times New Roman'
const SIZE = 24 // 12pt
const SMALL = 22 // 11pt

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONT, size: opts.size || SIZE, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 200 },
  ...(opts.heading ? { heading: opts.heading } : {}),
  indent: opts.indent ? { left: opts.indent } : undefined,
})

const bold = (text, size) => new TextRun({ text, font: FONT, size: size || SIZE, bold: true })
const normal = (text, size) => new TextRun({ text, font: FONT, size: size || SIZE })
const italic = (text, size) => new TextRun({ text, font: FONT, size: size || SIZE, italics: true })
const caps = (text, size) => new TextRun({ text, font: FONT, size: size || SIZE, bold: true, allCaps: true })

const section = (title, children) => [
  new Paragraph({ children: [bold(title)], spacing: { before: 400, after: 200 } }),
  ...children,
]

const bullet = (text) => new Paragraph({
  children: [normal(text)],
  bullet: { level: 0 },
  spacing: { after: 100 },
})

const doc = new Document({
  sections: [{
    properties: {
      page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    },
    children: [
      // Title
      new Paragraph({ children: [bold('Prudence Safety & Environmental Consulting, LLC', 28)], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
      new Paragraph({ children: [bold('Master Services Agreement', 28)], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),

      // Preamble
      new Paragraph({
        children: [
          normal('This Master Services Agreement ("'),
          bold('MSA'),
          normal('") is made and entered into as of the date of the first executed Order Form between the parties ("'),
          bold('Effective Date'),
          normal('") by and between:'),
        ],
        spacing: { after: 200 },
      }),

      new Paragraph({
        children: [
          bold('Prudence Safety & Environmental Consulting, LLC'),
          normal(', a Maryland limited liability company with its principal place of business at 19625 Club Lake Road, Montgomery Village, MD 20886 ("'),
          bold('PSEC'),
          normal('"); and'),
        ],
        spacing: { after: 200 },
      }),

      new Paragraph({
        children: [
          normal('[Customer Name], a [State of Incorporation] [Entity Type] with its principal place of business at [Customer Address] ("'),
          bold('Customer'),
          normal('").'),
        ],
        spacing: { after: 200 },
      }),

      p('PSEC and Customer are each a "Party" and collectively the "Parties."'),

      // RECITALS
      new Paragraph({ children: [bold('RECITALS')], spacing: { before: 400, after: 200 } }),

      new Paragraph({
        children: [
          bold('WHEREAS'),
          normal(', PSEC provides access to AtmosFlow, a proprietary software-as-a-service platform for the conduct of indoor air quality assessments and the generation of associated assessment reports; and'),
        ],
        spacing: { after: 200 },
      }),

      new Paragraph({
        children: [
          bold('WHEREAS'),
          normal(', Customer desires to procure subscription-based access to PSEC\'s services, subject to the terms and conditions set forth in this MSA and one or more Order Forms.'),
        ],
        spacing: { after: 200 },
      }),

      new Paragraph({
        children: [
          bold('NOW, THEREFORE'),
          normal(', in consideration of the mutual covenants contained herein, the Parties agree as follows:'),
        ],
        spacing: { after: 400 },
      }),

      // 1. DEFINITIONS
      new Paragraph({ children: [bold('1. DEFINITIONS')], spacing: { before: 300, after: 200 } }),

      new Paragraph({ children: [bold('1.1. '), normal('"'), bold('Agreement'), normal('" means this MSA together with all exhibits and all Order Forms executed by the Parties.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('1.2. '), normal('"'), bold('Authorized User'), normal('" means an employee or authorized contractor of Customer who is authorized by Customer to access and use the Services, for whom a subscription has been purchased.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('1.3. '), normal('"'), bold('Confidential Information'), normal('" has the meaning set forth in Section 7.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('1.4. '), normal('"'), bold('Customer Data'), normal('" means all electronic data or information submitted by or for Customer to the Services.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('1.5. '), normal('"'), bold('Documentation'), normal('" means the official user manuals, help files, and other technical documentation for the Services provided by PSEC.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('1.6. '), normal('"'), bold('Fees'), normal('" means the amounts payable by Customer for the Services and any related Professional Services as specified in an Order Form.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('1.7. '), normal('"'), bold('Order Form'), normal('" means a written or electronic ordering document, mutually executed by the Parties, that specifies the Services being purchased, Fees, Subscription Term, and other commercial terms, and which is governed by this MSA.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('1.8. '), normal('"'), bold('PSEC IP'), normal('" means the Services, the Software, the Documentation, and all other PSEC-owned technology, software, and intellectual property, including all modifications, derivative works, and improvements thereto.')], spacing: { after: 150 } }),

      // 1.9 — Integrated definition
      new Paragraph({
        children: [
          bold('1.9. '),
          normal('"'),
          bold('Services'),
          normal('" means PSEC\'s AtmosFlow software-as-a-service product, an indoor air quality assessment platform that supports the conduct of indoor air quality surveys and the generation of associated assessment reports for review by Customer\'s qualified personnel, as identified in an Order Form. The Services do not provide professional opinions, regulatory determinations, certifications, or compliance assessments.'),
        ],
        spacing: { after: 150 },
      }),

      new Paragraph({ children: [bold('1.10. '), normal('"'), bold('Software'), normal('" means the underlying proprietary software code that powers the Services.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('1.11. '), normal('"'), bold('Subscription Term'), normal('" means the period of time during which Customer is authorized to access the Services, as specified in an Order Form.')], spacing: { after: 200 } }),

      // 2. SERVICES AND LICENSE
      new Paragraph({ children: [bold('2. SERVICES AND LICENSE')], spacing: { before: 300, after: 200 } }),

      new Paragraph({ children: [bold('2.1. Provision of Services. '), normal('Subject to the terms of this Agreement, PSEC will make the Services available to Customer and its Authorized Users during the Subscription Term.')], spacing: { after: 150 } }),

      new Paragraph({ children: [bold('2.2. License Grant. '), normal('PSEC hereby grants to Customer a non-exclusive, non-sublicensable, non-transferable right for its Authorized Users to access and use the Services and Documentation during the Subscription Term, solely for Customer\'s internal business operations.')], spacing: { after: 150 } }),

      // 2.3 — with integrated (g)
      new Paragraph({
        children: [
          bold('2.3. Restrictions. '),
          normal('Customer shall not, and shall not permit any third party to: (a) reverse engineer, decompile, or otherwise attempt to discover the source code of the Software; (b) sell, rent, lease, or sublicense the Services; (c) use the Services for service bureau or time-sharing purposes; (d) modify or create derivative works of the PSEC IP; (e) remove any proprietary notices from the PSEC IP; (f) use the Services to store or transmit infringing, libelous, or otherwise unlawful material, or to store or transmit material in violation of third-party privacy rights; or (g) represent to any third party that the Services or PSEC have provided a professional opinion, regulatory determination, certification, or compliance assessment.'),
        ],
        spacing: { after: 200 },
      }),

      // 3. OBLIGATIONS
      new Paragraph({ children: [bold('3. OBLIGATIONS')], spacing: { before: 300, after: 200 } }),
      new Paragraph({ children: [bold('3.1. PSEC Obligations. '), normal('PSEC will: (a) provide the Services in a professional manner and in accordance with the Service Level Agreement attached as Exhibit A; and (b) provide standard customer support for the Services to Customer at no additional charge.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('3.2. Customer Obligations. '), normal('Customer will: (a) be responsible for its Authorized Users\' compliance with this Agreement; (b) be responsible for the accuracy, quality, and legality of Customer Data; (c) use commercially reasonable efforts to prevent unauthorized access to the Services and notify PSEC promptly of any such unauthorized access; and (d) use the Services only in accordance with the Documentation and applicable laws.')], spacing: { after: 200 } }),

      // 4. FEES AND PAYMENT
      new Paragraph({ children: [bold('4. FEES AND PAYMENT')], spacing: { before: 300, after: 200 } }),
      new Paragraph({ children: [bold('4.1. Fees. '), normal('Customer shall pay all Fees specified in all Order Forms. Except as otherwise specified herein, Fees are non-cancelable and non-refundable.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('4.2. Invoicing and Payment. '), normal('PSEC will invoice Customer in accordance with the relevant Order Form. Unless otherwise stated, invoiced Fees are due net thirty (30) days from the invoice date.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('4.3. Overdue Charges. '), normal('If any invoiced amount is not received by PSEC by the due date, then without limiting PSEC\'s rights, PSEC may charge interest on the past due amount at the rate of 1.5% per month or the maximum rate permitted by law, whichever is lower.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('4.4. Suspension of Service. '), normal('If Customer\'s account is thirty (30) or more days overdue, PSEC may, without limiting its other rights, suspend Services until such amounts are paid in full.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('4.5. Taxes. '), normal('Fees do not include any taxes, levies, or duties. Customer is responsible for paying all such taxes, excluding only taxes based on PSEC\'s net income.')], spacing: { after: 200 } }),

      // 5. TERM AND TERMINATION
      new Paragraph({ children: [bold('5. TERM AND TERMINATION')], spacing: { before: 300, after: 200 } }),
      new Paragraph({ children: [bold('5.1. Term of MSA. '), normal('This MSA commences on the Effective Date and continues until all Subscription Terms under all Order Forms have expired or been terminated.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('5.2. Term of Subscriptions. '), normal('The Subscription Term shall be as specified in the applicable Order Form. Except as otherwise specified, subscriptions will automatically renew for additional periods equal to the expiring Subscription Term, unless either Party gives the other written notice of non-renewal at least sixty (60) days before the end of the relevant term.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('5.3. Termination for Cause. '), normal('A Party may terminate this Agreement for cause: (a) upon thirty (30) days written notice to the other Party of a material breach if such breach remains uncured at the expiration of such period; or (b) if the other Party becomes the subject of a petition in bankruptcy or any other proceeding relating to insolvency.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('5.4. Effect of Termination. '), normal('Upon termination for any reason, Customer shall immediately cease all use of the Services and pay any unpaid Fees. Upon Customer request made within thirty (30) days after termination, PSEC will make Customer Data available for export. After such 30-day period, PSEC will have no obligation to maintain any Customer Data and will thereafter delete it.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('5.5. Survival. '), normal('Sections 4, 5.4, 5.5, and 6 through 12 shall survive any termination or expiration of this Agreement.')], spacing: { after: 200 } }),

      // 6. INTELLECTUAL PROPERTY
      new Paragraph({ children: [bold('6. INTELLECTUAL PROPERTY')], spacing: { before: 300, after: 200 } }),
      new Paragraph({ children: [bold('6.1. PSEC IP. '), normal('PSEC retains all right, title, and interest in and to the PSEC IP. No rights are granted to Customer hereunder other than as expressly set forth herein.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('6.2. Customer Data. '), normal('Customer retains all right, title, and interest in and to the Customer Data. Customer grants PSEC a limited, worldwide, royalty-free license to host, copy, transmit, and display Customer Data as necessary for PSEC to provide the Services.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('6.3. Feedback. '), normal('Customer may voluntarily provide suggestions, ideas, or other feedback ("Feedback") to PSEC. Customer grants PSEC a perpetual, irrevocable, worldwide, royalty-free license to use, implement, and commercialize any such Feedback without any obligation to Customer.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('6.4. Aggregated Data. '), normal('PSEC shall have the right to collect and analyze data related to the provision and use of the Services and may use such data (in an aggregated and anonymized form) to improve its products and services.')], spacing: { after: 200 } }),

      // 7. CONFIDENTIALITY
      new Paragraph({ children: [bold('7. CONFIDENTIALITY')], spacing: { before: 300, after: 200 } }),
      p('Each Party agrees to hold the other\'s Confidential Information in strict confidence and not to use or disclose it except as necessary to perform its obligations under this Agreement. This obligation shall survive termination of the Agreement for a period of five (5) years, provided that for information qualifying as a trade secret, the obligation shall continue indefinitely.'),

      // 8. DATA SECURITY
      new Paragraph({ children: [bold('8. DATA SECURITY')], spacing: { before: 300, after: 200 } }),
      p('PSEC will maintain administrative, physical, and technical safeguards for the protection of the security, confidentiality, and integrity of Customer Data that are consistent with industry standards. Where applicable, the Parties agree to execute PSEC\'s standard Data Processing Addendum.'),

      // 9. WARRANTIES AND DISCLAIMERS
      new Paragraph({ children: [bold('9. WARRANTIES AND DISCLAIMERS')], spacing: { before: 300, after: 200 } }),
      new Paragraph({ children: [bold('9.1. PSEC Warranty. '), normal('PSEC warrants that the Services will perform materially in accordance with the Documentation. For any breach of this warranty, Customer\'s exclusive remedy shall be for PSEC to use reasonable efforts to correct the non-conformity, or if PSEC cannot do so, terminate the subscription and refund any prepaid, unused Fees.')], spacing: { after: 150 } }),
      new Paragraph({
        children: [
          bold('9.2. DISCLAIMER. '),
          caps('EXCEPT AS EXPRESSLY PROVIDED HEREIN, THE SERVICES ARE PROVIDED "AS IS." PSEC MAKES NO OTHER WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, AND SPECIFICALLY DISCLAIMS ALL IMPLIED WARRANTIES, INCLUDING ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.'),
        ],
        spacing: { after: 200 },
      }),

      // 10. INDEMNIFICATION
      new Paragraph({ children: [bold('10. INDEMNIFICATION')], spacing: { before: 300, after: 200 } }),
      new Paragraph({ children: [bold('10.1. By PSEC. '), normal('PSEC will defend Customer against any third-party claim that the Services infringe a U.S. patent or copyright and will pay damages finally awarded against Customer, provided Customer promptly notifies PSEC of the claim and gives PSEC sole control of the defense.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('10.2. By Customer. '), normal('Customer will defend PSEC against any claim arising from (a) the Customer Data or (b) Customer\'s use of the Services in breach of this Agreement, and will pay damages finally awarded against PSEC.')], spacing: { after: 200 } }),

      // 11. LIMITATION OF LIABILITY
      new Paragraph({ children: [bold('11. LIMITATION OF LIABILITY')], spacing: { before: 300, after: 200 } }),
      new Paragraph({
        children: [
          bold('11.1. EXCLUSION OF DAMAGES. '),
          caps('IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY LOST PROFITS, REVENUES, OR INDIRECT, SPECIAL, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, HOWEVER CAUSED, WHETHER IN CONTRACT, TORT, OR UNDER ANY OTHER THEORY OF LIABILITY.'),
        ],
        spacing: { after: 150 },
      }),
      new Paragraph({
        children: [
          bold('11.2. LIABILITY CAP. '),
          caps('EXCEPT FOR CUSTOMER\'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY\'S AGGREGATE LIABILITY ARISING OUT OF THIS AGREEMENT EXCEED THE TOTAL FEES PAID OR PAYABLE BY CUSTOMER TO PSEC DURING THE TWELVE (12) MONTHS PRECEDING THE CLAIM.'),
        ],
        spacing: { after: 200 },
      }),

      // 12. GENERAL PROVISIONS
      new Paragraph({ children: [bold('12. GENERAL PROVISIONS')], spacing: { before: 300, after: 200 } }),
      new Paragraph({ children: [bold('12.1. Governing Law. '), normal('This Agreement shall be governed by and construed in accordance with the laws of the State of Maryland, without regard to its conflict of law principles.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('12.2. Entire Agreement. '), normal('This Agreement constitutes the entire agreement between the Parties and supersedes all prior agreements concerning its subject matter.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('12.3. Assignment. '), normal('Neither Party may assign this Agreement without the other\'s prior written consent, except in connection with a merger, acquisition, or sale of all or substantially all of its assets.')], spacing: { after: 150 } }),
      new Paragraph({ children: [bold('12.4. Notices. '), normal('All notices shall be in writing and sent to the addresses set forth above.')], spacing: { after: 400 } }),

      // EXHIBIT A
      new Paragraph({ children: [bold('Exhibit A to Master Services Agreement')], alignment: AlignmentType.CENTER, spacing: { before: 600, after: 100 } }),
      new Paragraph({ children: [bold('Service Level Agreement (SLA)')], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),

      new Paragraph({ children: [bold('1. Service Availability. '), normal('PSEC will use commercially reasonable efforts to make the Services available with an Uptime Percentage of at least 99.5% during any calendar month. "Uptime Percentage" is calculated as: (Total minutes in a month - Downtime minutes) / Total minutes in a month.')], spacing: { after: 150 } }),

      new Paragraph({ children: [bold('2. Exclusions. '), normal('Downtime does not include unavailability resulting from: (a) Scheduled Maintenance; (b) force majeure events; (c) Customer\'s or any third party\'s equipment, software, or other technology; or (d) Customer\'s or its Authorized Users\' misuse of the Services. "Scheduled Maintenance" means maintenance for which PSEC provides at least 48 hours prior notice.')], spacing: { after: 150 } }),

      new Paragraph({ children: [bold('3. Service Credits. '), normal('If PSEC fails to meet the 99.5% Uptime Percentage in any calendar month, Customer will be eligible to receive a service credit as follows:')], spacing: { after: 100 } }),

      bullet('99.0% to 99.49% Uptime: 5% of the monthly subscription Fee for the affected Service.'),
      bullet('Less than 99.0% Uptime: 10% of the monthly subscription Fee for the affected Service.'),

      p('This SLA states Customer\'s sole and exclusive remedy for any failure by PSEC to meet the Uptime Percentage.'),
    ],
  }],
})

const buffer = await Packer.toBuffer(doc)
writeFileSync('docs/AtmosFlow_MSA_integrated_v2.docx', buffer)
console.log('Written: docs/AtmosFlow_MSA_integrated_v2.docx')
