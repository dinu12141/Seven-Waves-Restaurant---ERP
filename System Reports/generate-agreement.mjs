
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType, Header, Footer,
  UnderlineType, PageNumber
} from 'docx';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Color Palette ───────────────────────────────────────────────
const COLOR = {
  NAVY:      '0D2550',
  BLUE:      '1565C0',
  LIGHT_BLUE:'E8F0FE',
  GOLD:      'B8860B',
  GRAY:      '475569',
  LIGHT_GRAY:'F1F5F9',
  WHITE:     'FFFFFF',
  BLACK:     '0D1117',
  RED:       'DC2626',
  GREEN:     '16A34A',
  BORDER:    'CBD5E1',
};

// ─── Helpers ─────────────────────────────────────────────────────
const hr = () => new Paragraph({
  border: { bottom: { color: COLOR.BORDER, space: 1, style: BorderStyle.SINGLE, size: 6 } },
  spacing: { before: 200, after: 200 },
  children: []
});

const space = (before = 100, after = 100) => new Paragraph({ spacing: { before, after }, children: [] });

const heading1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 400, after: 160 },
  children: [new TextRun({ text, bold: true, size: 28, color: COLOR.NAVY, font: 'Calibri' })],
});

const heading2 = (text) => new Paragraph({
  spacing: { before: 300, after: 120 },
  children: [new TextRun({ text, bold: true, size: 23, color: COLOR.BLUE, font: 'Calibri' })],
});

const heading3 = (text) => new Paragraph({
  spacing: { before: 200, after: 80 },
  children: [new TextRun({ text, bold: true, size: 21, color: COLOR.NAVY, font: 'Calibri', underline: { type: UnderlineType.SINGLE } })],
});

const body = (text, opts = {}) => new Paragraph({
  alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
  spacing: { before: 80, after: 80 },
  children: [new TextRun({ text, size: 20, color: COLOR.BLACK, font: 'Calibri', ...opts })],
});

const bullet = (text) => new Paragraph({
  bullet: { level: 0 },
  spacing: { before: 60, after: 60 },
  children: [new TextRun({ text, size: 20, color: COLOR.BLACK, font: 'Calibri' })],
});



const signRow = (label, value = '') => new TableRow({
  children: [
    new TableCell({
      width: { size: 40, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.SOLID, color: COLOR.LIGHT_GRAY },
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 19, font: 'Calibri', color: COLOR.NAVY })] })],
    }),
    new TableCell({
      width: { size: 60, type: WidthType.PERCENTAGE },
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      children: [new Paragraph({ children: [new TextRun({ text: value, size: 19, font: 'Calibri', color: COLOR.BLACK })] })],
    }),
  ],
});

const infoTable = (rows) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top:    { style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
    left:   { style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
    right:  { style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
    insideH:{ style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
    insideV:{ style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
  },
  rows: rows.map(([l, v]) => signRow(l, v)),
});

// ─── Today's Date ────────────────────────────────────────────────
const today = new Date();
const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const year = today.getFullYear();

// ─── Document Sections ───────────────────────────────────────────
const sections = [
  // ══════════════════════════════════════════════════════
  // COVER PAGE
  // ══════════════════════════════════════════════════════
  new Paragraph({ spacing: { before: 800 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', size: 22, color: COLOR.GOLD, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 40 },
    children: [new TextRun({ text: 'SEVEN WAVES', bold: true, size: 52, color: COLOR.NAVY, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: 'Restaurant Management ERP System', bold: true, size: 30, color: COLOR.BLUE, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', size: 22, color: COLOR.GOLD, font: 'Calibri' })],
  }),
  space(600),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: 'SOFTWARE DELIVERY &', bold: true, size: 38, color: COLOR.NAVY, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: 'CLIENT HANDOVER AGREEMENT', bold: true, size: 38, color: COLOR.NAVY, font: 'Calibri' })],
  }),
  space(400),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 60 },
    children: [new TextRun({ text: `Date: ${dateStr}`, size: 22, color: COLOR.GRAY, font: 'Calibri', italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 60 },
    children: [new TextRun({ text: `Document Ref: SW-ERP-AGR-${year}-001`, size: 22, color: COLOR.GRAY, font: 'Calibri', italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 60 },
    children: [new TextRun({ text: 'Version: 1.0.0', size: 22, color: COLOR.GRAY, font: 'Calibri', italics: true })],
  }),
  space(800),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { color: COLOR.BORDER, style: BorderStyle.SINGLE, size: 6, space: 10 } },
    spacing: { before: 200, after: 40 },
    children: [new TextRun({ text: 'STRICTLY CONFIDENTIAL — FOR AUTHORIZED PARTIES ONLY', size: 18, color: COLOR.RED, bold: true, font: 'Calibri' })],
  }),

  // ══════════════════════════════════════════════════════
  // SECTION 1 — PARTIES
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('1. PARTIES TO THIS AGREEMENT'),
  heading2('1.1  Developer / Service Provider'),
  infoTable([
    ['Full Name',         '___________________________________'],
    ['Business / Studio', '___________________________________'],
    ['Email Address',     'kmudinusha@gmail.com'],
    ['Contact Number',    '___________________________________'],
    ['Address',          '___________________________________'],
    ['GitHub / Portfolio','___________________________________'],
  ]),
  space(200),
  heading2('1.2  Client / Recipient'),
  infoTable([
    ['Business Name',     '___________________________________'],
    ['Contact Person',    '___________________________________'],
    ['Designation',       '___________________________________'],
    ['Email Address',     '___________________________________'],
    ['Contact Number',    '___________________________________'],
    ['Business Address',  '___________________________________'],
  ]),

  // ══════════════════════════════════════════════════════
  // SECTION 2 — SYSTEM OVERVIEW
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('2. SYSTEM OVERVIEW'),
  body('The software being handed over under this Agreement is described as follows:'),
  space(100),
  infoTable([
    ['Product Name',      'Seven Waves Restaurant ERP'],
    ['Version',           '1.0.0 (Production Release)'],
    ['Platform',          'Web (PWA) · Android APK · Desktop (Windows)'],
    ['Framework',         'Vue 3 + Quasar Framework v2 (Vite)'],
    ['Database',          'Supabase (PostgreSQL 15)'],
    ['Authentication',    'Supabase Auth (Email + User Code)'],
    ['Hosting',           'Vercel (Web) · Supabase Cloud (DB)'],
    ['Delivery Date',     dateStr],
  ]),
  space(200),
  heading2('2.1  Modules Delivered'),
  bullet('Point of Sale (POS) — Full-featured cashier terminal with KOT, quick cash, receipt printing'),
  bullet('Kitchen Display System (KDS) — Real-time order management and KOT dispatch'),
  bullet('Finance Module — Journal Entries, Chart of Accounts, General Ledger, Bank Reconciliation'),
  bullet('HR & Payroll — Employee management, attendance tracking, payroll processing'),
  bullet('Procurement — Purchase Orders, GRN, AP Invoices, Supplier management'),
  bullet('Inventory Management — Stock tracking, UOM conversions, stock adjustments'),
  bullet('Waiter App — Mobile-first table ordering for floor staff (Android APK)'),
  bullet('Manager Dashboard — Real-time KPIs, analytics, AI-powered system audit alerts'),
  bullet('Delivery App — GPS-enabled driver navigation with real-time routing'),
  bullet('Customer Portal — QR-based table menu, order tracking, loyalty programme'),
  bullet('Admin Panel — User management, branch settings, RBAC, AI system health monitor'),
  bullet('Reports & Analytics — Finance, HR, Sales, Procurement dashboards with export'),

  // ══════════════════════════════════════════════════════
  // SECTION 3 — DELIVERABLES
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('3. DELIVERABLES'),
  heading2('3.1  Software Deliverables'),
  bullet('Full source code repository (GitHub / private access)'),
  bullet('Production-deployed web application (Vercel URL)'),
  bullet('Android APK — Seven Waves Mobile (Waiter, Manager, Delivery)'),
  bullet('Windows Desktop Installer (.exe) — Electron build'),
  bullet('Supabase project access (database URL, anon key, project dashboard)'),
  bullet('Environment configuration file (.env template)'),

  heading2('3.2  Documentation Deliverables'),
  bullet('This Software Delivery & Handover Agreement (PDF + DOC)'),
  bullet('Admin user guide'),
  bullet('Database schema diagram'),
  bullet('RLS & security policy documentation'),

  heading2('3.3  Credentials Handover'),
  body('The following credentials shall be securely transferred to the Client upon execution of this Agreement:'),
  infoTable([
    ['Supabase Project URL',    '___________________________________'],
    ['Supabase Anon Key',       '___________________________________'],
    ['Supabase Service Key',    '(Delivered separately — sealed envelope)'],
    ['Vercel Deployment URL',   '___________________________________'],
    ['Admin Login Email',       '___________________________________'],
    ['Admin Login Password',    '(Delivered separately — sealed envelope)'],
    ['GitHub Repository URL',   '___________________________________'],
  ]),

  // ══════════════════════════════════════════════════════
  // SECTION 4 — SECURITY & ACCESS CONTROL
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('4. SECURITY & ACCESS CONTROL'),
  heading2('4.1  Implemented Security Measures'),
  bullet('Row Level Security (RLS) enabled on all database tables'),
  bullet('Role-Based Access Control (RBAC) — Admin, Manager, Finance, HR, Cashier, Waiter, Kitchen, Delivery'),
  bullet('All 28+ reporting views converted to SECURITY INVOKER (no privilege escalation)'),
  bullet('~140 PostgreSQL functions hardened with fixed search_path'),
  bullet('Frontend route guards enforce role-based page access'),
  bullet('Supabase Auth with session management and token refresh'),
  bullet('Rate limiting on QR authentication endpoints'),
  bullet('HTTPS enforced (Vercel SSL)'),

  heading2('4.2  Client Responsibilities'),
  bullet('Change all default admin passwords immediately after handover'),
  bullet('Enable Leaked Password Protection in Supabase Auth Dashboard'),
  bullet('Keep Supabase service key confidential — never expose in frontend code'),
  bullet('Manage user roles and permissions through the Admin Panel only'),
  bullet('Regularly review the Admin AI Security Audit alerts'),

  // ══════════════════════════════════════════════════════
  // SECTION 5 — IP & LICENSE
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('5. INTELLECTUAL PROPERTY & LICENSE'),
  body('Upon full payment of all agreed fees, the Developer assigns to the Client a perpetual, non-exclusive, royalty-free license to use, operate, and maintain the Software. The Developer retains the right to use components, patterns, and non-client-specific techniques developed during this engagement in future projects.'),
  space(100),
  bullet('The Client may not resell, sub-license, or distribute the Software to third parties without written consent from the Developer.'),
  bullet('All third-party libraries (Vue, Quasar, Supabase, etc.) remain subject to their respective open-source licenses.'),
  bullet('The Developer retains copyright over all custom code authored during the development of this Software.'),

  // ══════════════════════════════════════════════════════
  // SECTION 6 — WARRANTY & SUPPORT
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('6. WARRANTY & POST-DELIVERY SUPPORT'),
  heading2('6.1  Warranty Period'),
  body('The Developer warrants that, upon delivery, the Software shall perform substantially as described in this Agreement. The following warranty terms apply:'),
  infoTable([
    ['Warranty Period',        '30 (Thirty) calendar days from handover date'],
    ['Coverage',               'Bug fixes for defects present at time of delivery'],
    ['Excluded from Warranty', 'Modifications by Client, third-party service outages, data corruption due to misuse'],
    ['Response Time (Critical)','Within 24 hours'],
    ['Response Time (General)', 'Within 72 hours'],
  ]),
  space(100),
  heading2('6.2  Out-of-Warranty Support'),
  body('After the 30-day warranty period, additional support and feature development shall be subject to a separate support agreement or hourly rate as mutually agreed.'),

  // ══════════════════════════════════════════════════════
  // SECTION 7 — PAYMENT
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('7. PAYMENT TERMS'),
  infoTable([
    ['Total Agreed Amount',    'LKR ___________________________________'],
    ['Deposit Paid (50%)',     'LKR ___________________________________'],
    ['Balance Due on Handover','LKR ___________________________________'],
    ['Payment Method',         '___________________________________'],
    ['Payment Due Date',       '___________________________________'],
    ['Bank / Account Details', '(Provided separately)'],
  ]),
  space(100),
  body('The Developer reserves the right to withhold full source code access until all outstanding payments are received in full.'),

  // ══════════════════════════════════════════════════════
  // SECTION 8 — LIMITATION OF LIABILITY
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('8. LIMITATION OF LIABILITY'),
  body('To the maximum extent permitted by applicable law, the Developer\'s total liability to the Client under this Agreement shall not exceed the total fees paid by the Client for the Software. The Developer shall not be liable for any indirect, incidental, special, or consequential damages, including loss of profits, loss of data, or business interruption.'),
  space(100),
  body('The Developer is not responsible for:'),
  bullet('Downtime or data loss caused by third-party services (Supabase, Vercel, Google APIs)'),
  bullet('Security breaches arising from Client\'s failure to follow the security recommendations in Section 4.2'),
  bullet('Performance degradation due to high traffic beyond tested load'),
  bullet('Any modifications made to the codebase by the Client or third parties after handover'),

  // ══════════════════════════════════════════════════════
  // SECTION 9 — CONFIDENTIALITY
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('9. CONFIDENTIALITY'),
  body('Both parties agree to keep confidential all proprietary information, credentials, business data, and technical specifications shared during and after the development of this Software. This obligation survives the termination of this Agreement for a period of three (3) years.'),

  // ══════════════════════════════════════════════════════
  // SECTION 10 — GOVERNING LAW
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('10. GOVERNING LAW & DISPUTE RESOLUTION'),
  body('This Agreement shall be governed by the laws of the Democratic Socialist Republic of Sri Lanka. Any dispute arising from this Agreement shall first be attempted to be resolved through good-faith negotiation. If unresolved within 30 days, the dispute shall be referred to arbitration under the Arbitration Act No. 11 of 1995 of Sri Lanka.'),

  // ══════════════════════════════════════════════════════
  // SECTION 11 — SIGNATURES
  // ══════════════════════════════════════════════════════
  hr(),
  heading1('11. EXECUTION & SIGNATURES'),
  body('By signing below, both parties confirm that they have read, understood, and agreed to all terms and conditions set forth in this Agreement.'),
  space(400),

  // Developer Signature
  heading3('Developer / Service Provider'),
  infoTable([
    ['Full Name',        '___________________________________'],
    ['Signature',        '___________________________________'],
    ['Date',             '___________________________________'],
    ['Company Seal',     '(if applicable)'],
  ]),
  space(400),

  // Client Signature
  heading3('Client / Authorized Representative'),
  infoTable([
    ['Full Name',        '___________________________________'],
    ['Designation',      '___________________________________'],
    ['Company Name',     '___________________________________'],
    ['Signature',        '___________________________________'],
    ['Date',             '___________________________________'],
    ['Company Seal',     '(if applicable)'],
  ]),

  space(400),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { color: COLOR.BORDER, style: BorderStyle.SINGLE, size: 6, space: 10 } },
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text: `Seven Waves Restaurant ERP  ·  Document Ref: SW-ERP-AGR-${year}-001  ·  ${dateStr}`, size: 16, color: COLOR.GRAY, italics: true, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'This document is legally binding once signed by both parties.', size: 16, color: COLOR.RED, bold: true, font: 'Calibri' })],
  }),
];

// ─── Build Document ───────────────────────────────────────────────
const doc = new Document({
  creator: 'Seven Waves ERP — Developer',
  title:   'Software Delivery & Client Handover Agreement',
  description: 'Seven Waves Restaurant ERP — Handover Agreement',
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 20, color: COLOR.BLACK },
        paragraph: { spacing: { line: 276 } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 1000, right: 1134, bottom: 1000, left: 1134 } },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { color: COLOR.BORDER, style: BorderStyle.SINGLE, size: 6, space: 6 } },
              spacing: { after: 120 },
              children: [
                new TextRun({ text: 'SEVEN WAVES RESTAURANT ERP  ·  SOFTWARE HANDOVER AGREEMENT', size: 16, color: COLOR.NAVY, bold: true, font: 'Calibri' }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { color: COLOR.BORDER, style: BorderStyle.SINGLE, size: 6, space: 6 } },
              spacing: { before: 120 },
              children: [
                new TextRun({ text: `Confidential  ·  SW-ERP-AGR-${year}-001  ·  Page `, size: 16, color: COLOR.GRAY, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLOR.GRAY, font: 'Calibri' }),
                new TextRun({ text: ' of ', size: 16, color: COLOR.GRAY, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLOR.GRAY, font: 'Calibri' }),
              ],
            }),
          ],
        }),
      },
      children: sections,
    },
  ],
});

// ─── Write DOCX ───────────────────────────────────────────────────
const docxPath = path.join(__dirname, 'Seven_Waves_ERP_Handover_Agreement.docx');
const buffer = await Packer.toBuffer(doc);
writeFileSync(docxPath, buffer);
console.log(`✅ DOCX created: ${docxPath}`);

// ─── Generate PDF via HTML + Print ────────────────────────────────
// We generate an HTML version for printing to PDF
const htmlPath = path.join(__dirname, 'Seven_Waves_ERP_Handover_Agreement.html');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Seven Waves ERP — Software Handover Agreement</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Calibri:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Calibri, Arial, sans-serif; font-size: 11pt; color: #0D1117; background: #fff; line-height: 1.6; }
  .page { max-width: 850px; margin: 0 auto; padding: 60px 80px; }
  @media print { .page { padding: 40px 60px; } .no-print { display: none; } }

  /* Cover */
  .cover { text-align: center; padding: 80px 0 40px; border-bottom: 3px solid #B8860B; }
  .cover .divider { color: #B8860B; font-size: 16pt; letter-spacing: 4px; margin: 12px 0; }
  .cover h1 { font-size: 36pt; color: #0D2550; font-weight: 700; margin: 12px 0 4px; }
  .cover .subtitle { font-size: 16pt; color: #1565C0; font-weight: 600; margin-bottom: 40px; }
  .cover .doc-title { font-size: 22pt; color: #0D2550; font-weight: 700; margin: 20px 0 8px; line-height: 1.3; text-transform: uppercase; }
  .cover .meta { font-size: 11pt; color: #475569; margin: 6px 0; font-style: italic; }
  .cover .confidential { margin-top: 40px; padding-top: 20px; border-top: 1px solid #CBD5E1; color: #DC2626; font-weight: 700; font-size: 10pt; letter-spacing: 1px; text-transform: uppercase; }

  /* Sections */
  h1 { font-size: 15pt; color: #0D2550; border-bottom: 2px solid #1565C0; padding-bottom: 6px; margin: 36px 0 12px; font-weight: 700; }
  h2 { font-size: 12pt; color: #1565C0; margin: 20px 0 8px; font-weight: 600; }
  h3 { font-size: 11pt; color: #0D2550; margin: 16px 0 8px; font-weight: 700; text-decoration: underline; }
  p  { margin: 8px 0; text-align: justify; }
  ul { margin: 8px 0 8px 24px; }
  li { margin: 5px 0; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  td, th { border: 1px solid #CBD5E1; padding: 8px 12px; font-size: 10.5pt; vertical-align: top; }
  td:first-child { background: #F1F5F9; font-weight: 600; color: #0D2550; width: 38%; }
  td:last-child { color: #0D1117; }

  /* Signature */
  .sig-block { border: 1px solid #CBD5E1; border-radius: 6px; padding: 16px 20px; margin: 12px 0; }

  /* Footer */
  .doc-footer { text-align: center; margin-top: 60px; padding-top: 16px; border-top: 1px solid #CBD5E1; font-size: 9pt; color: #64748B; font-style: italic; }
  .doc-footer .legal { color: #DC2626; font-weight: 700; font-style: normal; }

  /* Print button */
  .print-btn { position: fixed; top: 20px; right: 20px; background: #1565C0; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 16px rgba(21,101,192,0.3); z-index: 9999; }
  .print-btn:hover { background: #0d47a1; }

  hr { border: none; border-top: 1px solid #CBD5E1; margin: 24px 0; }
</style>
</head>
<body>
<div class="page">

  <!-- Print Button (hidden on print) -->
  <button class="print-btn no-print" onclick="window.print()">🖨️ Save as PDF</button>

  <!-- COVER PAGE -->
  <div class="cover">
    <div class="divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
    <h1>SEVEN WAVES</h1>
    <div class="subtitle">Restaurant Management ERP System</div>
    <div class="divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
    <br><br>
    <div class="doc-title">Software Delivery &amp;<br>Client Handover Agreement</div>
    <br>
    <p class="meta">Date: ${dateStr}</p>
    <p class="meta">Document Ref: SW-ERP-AGR-${year}-001</p>
    <p class="meta">Version: 1.0.0</p>
    <div class="confidential">⚠ Strictly Confidential — For Authorized Parties Only</div>
  </div>

  <!-- SECTION 1 -->
  <h1>1. PARTIES TO THIS AGREEMENT</h1>
  <h2>1.1 Developer / Service Provider</h2>
  <table>
    <tr><td>Full Name</td><td>___________________________________</td></tr>
    <tr><td>Business / Studio</td><td>___________________________________</td></tr>
    <tr><td>Email Address</td><td>kmudinusha@gmail.com</td></tr>
    <tr><td>Contact Number</td><td>___________________________________</td></tr>
    <tr><td>Address</td><td>___________________________________</td></tr>
    <tr><td>GitHub / Portfolio</td><td>___________________________________</td></tr>
  </table>
  <h2>1.2 Client / Recipient</h2>
  <table>
    <tr><td>Business Name</td><td>___________________________________</td></tr>
    <tr><td>Contact Person</td><td>___________________________________</td></tr>
    <tr><td>Designation</td><td>___________________________________</td></tr>
    <tr><td>Email Address</td><td>___________________________________</td></tr>
    <tr><td>Contact Number</td><td>___________________________________</td></tr>
    <tr><td>Business Address</td><td>___________________________________</td></tr>
  </table>

  <!-- SECTION 2 -->
  <h1>2. SYSTEM OVERVIEW</h1>
  <p>The software being handed over under this Agreement is described as follows:</p>
  <table>
    <tr><td>Product Name</td><td>Seven Waves Restaurant ERP</td></tr>
    <tr><td>Version</td><td>1.0.0 (Production Release)</td></tr>
    <tr><td>Platform</td><td>Web (PWA) · Android APK · Desktop (Windows)</td></tr>
    <tr><td>Framework</td><td>Vue 3 + Quasar Framework v2 (Vite)</td></tr>
    <tr><td>Database</td><td>Supabase (PostgreSQL 15)</td></tr>
    <tr><td>Authentication</td><td>Supabase Auth (Email + User Code)</td></tr>
    <tr><td>Hosting</td><td>Vercel (Web) · Supabase Cloud (DB)</td></tr>
    <tr><td>Delivery Date</td><td>${dateStr}</td></tr>
  </table>

  <h2>2.1 Modules Delivered</h2>
  <ul>
    <li><strong>Point of Sale (POS)</strong> — Full-featured cashier terminal with KOT, quick cash, receipt printing</li>
    <li><strong>Kitchen Display System (KDS)</strong> — Real-time order management and KOT dispatch</li>
    <li><strong>Finance Module</strong> — Journal Entries, Chart of Accounts, General Ledger, Bank Reconciliation</li>
    <li><strong>HR &amp; Payroll</strong> — Employee management, attendance tracking, payroll processing</li>
    <li><strong>Procurement</strong> — Purchase Orders, GRN, AP Invoices, Supplier management</li>
    <li><strong>Inventory Management</strong> — Stock tracking, UOM conversions, stock adjustments</li>
    <li><strong>Waiter App</strong> — Mobile-first table ordering for floor staff (Android APK)</li>
    <li><strong>Manager Dashboard</strong> — Real-time KPIs, analytics, AI-powered system audit alerts</li>
    <li><strong>Delivery App</strong> — GPS-enabled driver navigation with real-time routing</li>
    <li><strong>Customer Portal</strong> — QR-based table menu, order tracking, loyalty programme</li>
    <li><strong>Admin Panel</strong> — User management, branch settings, RBAC, AI system health monitor</li>
    <li><strong>Reports &amp; Analytics</strong> — Finance, HR, Sales, Procurement dashboards with export</li>
  </ul>

  <!-- SECTION 3 -->
  <h1>3. DELIVERABLES</h1>
  <h2>3.1 Software Deliverables</h2>
  <ul>
    <li>Full source code repository (GitHub / private access)</li>
    <li>Production-deployed web application (Vercel URL)</li>
    <li>Android APK — Seven Waves Mobile (Waiter, Manager, Delivery)</li>
    <li>Windows Desktop Installer (.exe) — Electron build</li>
    <li>Supabase project access (database URL, anon key, project dashboard)</li>
    <li>Environment configuration file (.env template)</li>
  </ul>
  <h2>3.2 Documentation Deliverables</h2>
  <ul>
    <li>This Software Delivery &amp; Handover Agreement (PDF + DOC)</li>
    <li>Admin user guide</li>
    <li>Database schema diagram</li>
    <li>RLS &amp; security policy documentation</li>
  </ul>
  <h2>3.3 Credentials Handover</h2>
  <p>The following credentials shall be securely transferred to the Client upon execution of this Agreement:</p>
  <table>
    <tr><td>Supabase Project URL</td><td>___________________________________</td></tr>
    <tr><td>Supabase Anon Key</td><td>___________________________________</td></tr>
    <tr><td>Supabase Service Key</td><td>(Delivered separately — sealed envelope)</td></tr>
    <tr><td>Vercel Deployment URL</td><td>___________________________________</td></tr>
    <tr><td>Admin Login Email</td><td>___________________________________</td></tr>
    <tr><td>Admin Login Password</td><td>(Delivered separately — sealed envelope)</td></tr>
    <tr><td>GitHub Repository URL</td><td>___________________________________</td></tr>
  </table>

  <!-- SECTION 4 -->
  <h1>4. SECURITY &amp; ACCESS CONTROL</h1>
  <h2>4.1 Implemented Security Measures</h2>
  <ul>
    <li>Row Level Security (RLS) enabled on all database tables</li>
    <li>Role-Based Access Control (RBAC) — Admin, Manager, Finance, HR, Cashier, Waiter, Kitchen, Delivery</li>
    <li>All 28+ reporting views converted to SECURITY INVOKER (no privilege escalation)</li>
    <li>~140 PostgreSQL functions hardened with fixed search_path</li>
    <li>Frontend route guards enforce role-based page access</li>
    <li>Supabase Auth with session management and token refresh</li>
    <li>Rate limiting on QR authentication endpoints</li>
    <li>HTTPS enforced (Vercel SSL)</li>
  </ul>
  <h2>4.2 Client Responsibilities</h2>
  <ul>
    <li>Change all default admin passwords immediately after handover</li>
    <li>Enable Leaked Password Protection in Supabase Auth Dashboard</li>
    <li>Keep Supabase service key confidential — never expose in frontend code</li>
    <li>Manage user roles and permissions through the Admin Panel only</li>
    <li>Regularly review the Admin AI Security Audit alerts</li>
  </ul>

  <!-- SECTION 5 -->
  <h1>5. INTELLECTUAL PROPERTY &amp; LICENSE</h1>
  <p>Upon full payment of all agreed fees, the Developer assigns to the Client a perpetual, non-exclusive, royalty-free license to use, operate, and maintain the Software. The Developer retains the right to use components, patterns, and non-client-specific techniques developed during this engagement in future projects.</p>
  <br>
  <ul>
    <li>The Client may not resell, sub-license, or distribute the Software to third parties without written consent from the Developer.</li>
    <li>All third-party libraries (Vue, Quasar, Supabase, etc.) remain subject to their respective open-source licenses.</li>
    <li>The Developer retains copyright over all custom code authored during the development of this Software.</li>
  </ul>

  <!-- SECTION 6 -->
  <h1>6. WARRANTY &amp; POST-DELIVERY SUPPORT</h1>
  <h2>6.1 Warranty Period</h2>
  <table>
    <tr><td>Warranty Period</td><td>30 (Thirty) calendar days from handover date</td></tr>
    <tr><td>Coverage</td><td>Bug fixes for defects present at time of delivery</td></tr>
    <tr><td>Excluded from Warranty</td><td>Modifications by Client, third-party service outages, data corruption due to misuse</td></tr>
    <tr><td>Response Time (Critical)</td><td>Within 24 hours</td></tr>
    <tr><td>Response Time (General)</td><td>Within 72 hours</td></tr>
  </table>
  <h2>6.2 Out-of-Warranty Support</h2>
  <p>After the 30-day warranty period, additional support and feature development shall be subject to a separate support agreement or hourly rate as mutually agreed.</p>

  <!-- SECTION 7 -->
  <h1>7. PAYMENT TERMS</h1>
  <table>
    <tr><td>Total Agreed Amount</td><td>LKR ___________________________________</td></tr>
    <tr><td>Deposit Paid (50%)</td><td>LKR ___________________________________</td></tr>
    <tr><td>Balance Due on Handover</td><td>LKR ___________________________________</td></tr>
    <tr><td>Payment Method</td><td>___________________________________</td></tr>
    <tr><td>Payment Due Date</td><td>___________________________________</td></tr>
    <tr><td>Bank / Account Details</td><td>(Provided separately)</td></tr>
  </table>
  <p><strong>Note:</strong> The Developer reserves the right to withhold full source code access until all outstanding payments are received in full.</p>

  <!-- SECTION 8 -->
  <h1>8. LIMITATION OF LIABILITY</h1>
  <p>To the maximum extent permitted by applicable law, the Developer's total liability to the Client under this Agreement shall not exceed the total fees paid by the Client for the Software. The Developer shall not be liable for any indirect, incidental, special, or consequential damages, including loss of profits, loss of data, or business interruption.</p>
  <br>
  <p>The Developer is not responsible for:</p>
  <ul>
    <li>Downtime or data loss caused by third-party services (Supabase, Vercel, Google APIs)</li>
    <li>Security breaches arising from Client's failure to follow the security recommendations in Section 4.2</li>
    <li>Performance degradation due to high traffic beyond tested load</li>
    <li>Any modifications made to the codebase by the Client or third parties after handover</li>
  </ul>

  <!-- SECTION 9 -->
  <h1>9. CONFIDENTIALITY</h1>
  <p>Both parties agree to keep confidential all proprietary information, credentials, business data, and technical specifications shared during and after the development of this Software. This obligation survives the termination of this Agreement for a period of three (3) years.</p>

  <!-- SECTION 10 -->
  <h1>10. GOVERNING LAW &amp; DISPUTE RESOLUTION</h1>
  <p>This Agreement shall be governed by the laws of the Democratic Socialist Republic of Sri Lanka. Any dispute arising from this Agreement shall first be attempted to be resolved through good-faith negotiation. If unresolved within 30 days, the dispute shall be referred to arbitration under the Arbitration Act No. 11 of 1995 of Sri Lanka.</p>

  <!-- SECTION 11 -->
  <h1>11. EXECUTION &amp; SIGNATURES</h1>
  <p>By signing below, both parties confirm that they have read, understood, and agreed to all terms and conditions set forth in this Agreement.</p>
  <br><br>

  <h3>Developer / Service Provider</h3>
  <table>
    <tr><td>Full Name</td><td>___________________________________</td></tr>
    <tr><td>Signature</td><td>&nbsp;<br>&nbsp;<br></td></tr>
    <tr><td>Date</td><td>___________________________________</td></tr>
    <tr><td>Company Seal</td><td>(if applicable)</td></tr>
  </table>
  <br><br>

  <h3>Client / Authorized Representative</h3>
  <table>
    <tr><td>Full Name</td><td>___________________________________</td></tr>
    <tr><td>Designation</td><td>___________________________________</td></tr>
    <tr><td>Company Name</td><td>___________________________________</td></tr>
    <tr><td>Signature</td><td>&nbsp;<br>&nbsp;<br></td></tr>
    <tr><td>Date</td><td>___________________________________</td></tr>
    <tr><td>Company Seal</td><td>(if applicable)</td></tr>
  </table>

  <div class="doc-footer">
    Seven Waves Restaurant ERP &nbsp;·&nbsp; Document Ref: SW-ERP-AGR-${year}-001 &nbsp;·&nbsp; ${dateStr}<br>
    <span class="legal">This document is legally binding once signed by both parties.</span>
  </div>
</div>
</body>
</html>`;

writeFileSync(htmlPath, htmlContent, 'utf8');
console.log(`✅ HTML (→PDF) created: ${htmlPath}`);
console.log('');
console.log('📄 To save as PDF:');
console.log('   1. Open: Seven_Waves_ERP_Handover_Agreement.html in Chrome/Edge');
console.log('   2. Click the "🖨️ Save as PDF" button (or Ctrl+P → Save as PDF)');
console.log('   3. Set margins to "None" or "Minimum" for best results');
console.log('');
console.log('✅ Done! Files saved in System Reports/');
