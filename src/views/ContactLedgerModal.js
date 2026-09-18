// ============================================================
// ContactLedgerModal — کارت حساب اشخاص (دفتر معین)
// ============================================================

import { ContactController } from '../controllers/ContactController.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { Jalali } from '../utils/Jalali.js';

class ContactLedgerModalImpl {
  async open(contactId) {
    const contact = await ContactController.get(contactId);
    if (!contact) { Toast.error('شخص یافت نشد'); return; }

    const ledger = await ContactController.getLedger(contactId);

    const body = this._buildBody(contact, ledger);
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">بستن</button>
      <button class="btn" onclick="window.ContactLedgerModal._printLedger('${contactId}')">🖨️ چاپ صورت‌حساب</button>
    `;

    Modal.open({
      title: `📒 کارت حساب: ${contact.name}`,
      body,
      footer,
      size: 'lg'
    });

    window.__ledgerContactId = contactId;
  }

  _buildBody(contact, ledger) {
    const balance = ledger.finalBalance;
    const isDebtor = balance > 0;
    const isCreditor = balance < 0;
    const isSettled = balance === 0;

    const balanceColor = isDebtor ? 'var(--danger)' : isCreditor ? 'var(--success)' : 'var(--text-muted)';
    const balanceText = isSettled ? 'تسویه' :
                        isDebtor ? Formatters.money(balance) + ' بدهکار' :
                        Formatters.money(Math.abs(balance)) + ' بستانکار';

    const entityLabel = contact.entityType === 'legal' ? 'حقوقی' : 'حقیقی';
    const roleLabel = contact.role === 'customer' ? 'مشتری' :
                     contact.role === 'supplier' ? 'تامین‌کننده' : 'هر دو';

    // ریز تراکنش‌ها
    const rowsHtml = ledger.rows.length === 0
      ? `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">
          <div style="font-size:40px;margin-bottom:8px;opacity:.4">📭</div>
          هیچ تراکنشی برای این شخص ثبت نشده
        </td></tr>`
      : ledger.rows.map(r => {
          const typeColors = {
            invoice_sale: 'badge-success',
            invoice_purchase: 'badge-warning',
            return_sale: 'badge-danger',
            return_purchase: 'badge-danger',
            receipt: 'badge-info',
            payment: 'badge-danger',
            cheque_in: 'badge-muted',
            cheque_out: 'badge-muted'
          };
          const typeCls = typeColors[r.type] || 'badge-muted';

          let balanceHtml;
          if (r.isCheque) {
            balanceHtml = `<span style="color:var(--text-muted);font-size:11px">— (در جریان: ${Formatters.money(r.chequeAmount || 0)})</span>`;
          } else {
            const bal = r.balance;
            balanceHtml = `<strong style="color:${bal > 0 ? 'var(--danger)' : bal < 0 ? 'var(--success)' : 'var(--text-muted)'}">${Formatters.money(Math.abs(bal))}</strong> <small style="color:var(--text-muted);font-size:9.5px">${bal > 0 ? 'بد' : bal < 0 ? 'بس' : ''}</small>`;
          }

          return `
            <tr>
              <td style="font-size:11.5px;width:110px">${Formatters.toPersianDigits(r.date || '—')}</td>
              <td><span class="badge ${typeCls}" style="font-size:10px">${this._esc(r.typeLabel)}</span></td>
              <td style="font-size:11.5px;color:var(--text-muted)">${r.refNumber ? '#' + Formatters.toPersianDigits(r.refNumber) : '—'}</td>
              <td style="text-align:left;font-weight:600;color:var(--danger)">
                ${r.debit > 0 ? Formatters.money(r.debit) : '—'}
              </td>
              <td style="text-align:left;font-weight:600;color:var(--success)">
                ${r.credit > 0 ? Formatters.money(r.credit) : '—'}
              </td>
              <td style="text-align:left">${balanceHtml}</td>
              <td style="font-size:11px;color:var(--text-muted)">${this._esc(r.note || '—')}</td>
            </tr>
          `;
        }).join('');

    const tags = (contact.tags || []).map(t => `<span class="badge badge-muted" style="font-size:10px;margin-left:4px">${this._esc(t)}</span>`).join('');

    return `
      <div style="background:linear-gradient(135deg,#f0fdfa,#eff6ff);border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #bfdbfe">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
          <div style="flex:1;min-width:220px">
            <div style="font-size:16px;font-weight:800;margin-bottom:4px">${this._esc(contact.name)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">
              <span class="badge ${contact.entityType === 'legal' ? 'badge-warning' : 'badge-success'}">${entityLabel}</span>
              <span class="badge badge-info" style="margin-right:4px">${roleLabel}</span>
              ${tags}
            </div>
            ${contact.mobile ? `<div style="font-size:11.5px;color:var(--text-muted)">📱 ${Formatters.phone(contact.mobile)}</div>` : ''}
            ${contact.nationalId ? `<div style="font-size:11.5px;color:var(--text-muted)">🆔 ${Formatters.toPersianDigits(contact.nationalId)}</div>` : ''}
          </div>
          <div style="text-align:left;min-width:200px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">مانده حساب</div>
            <div style="font-size:20px;font-weight:800;color:${balanceColor}">${balanceText}</div>
          </div>
        </div>
      </div>

      <div class="grid-kpi" style="margin-bottom:14px">
        <div class="card" style="margin:0;padding:12px 14px;border-top:3px solid var(--danger)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">جمع بدهی (بدهکار)</div>
          <div style="font-size:15px;font-weight:800;color:var(--danger)">${Formatters.money(ledger.totalDebit)}</div>
        </div>
        <div class="card" style="margin:0;padding:12px 14px;border-top:3px solid var(--success)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">جمع پرداختی (بستانکار)</div>
          <div style="font-size:15px;font-weight:800;color:var(--success)">${Formatters.money(ledger.totalCredit)}</div>
        </div>
        <div class="card" style="margin:0;padding:12px 14px;border-top:3px solid var(--primary)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">تعداد تراکنش</div>
          <div style="font-size:15px;font-weight:800;color:var(--primary)">${Formatters.number(ledger.rows.length)}</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:12.5px;color:var(--text-muted)">ریز تراکنش‌ها</div>
      </div>

      <div class="table-wrap" style="max-height:400px;overflow-y:auto">
        <table style="min-width:750px">
          <thead style="position:sticky;top:0;z-index:2">
            <tr>
              <th style="width:110px">تاریخ</th>
              <th style="width:130px">نوع</th>
              <th style="width:90px">مرجع</th>
              <th style="width:130px;text-align:left">بدهکار</th>
              <th style="width:130px;text-align:left">بستانکار</th>
              <th style="width:160px;text-align:left">مانده</th>
              <th>شرح</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  // ============================================================
  // چاپ صورت‌حساب
  // ============================================================
  async _printLedger(contactId) {
    const contact = await ContactController.get(contactId);
    if (!contact) return;
    const ledger = await ContactController.getLedger(contactId);

    const balance = ledger.finalBalance;
    const isDebtor = balance > 0;
    const isCreditor = balance < 0;
    const balanceText = balance === 0 ? 'تسویه' :
                        isDebtor ? Formatters.money(balance) + ' بدهکار' :
                        Formatters.money(Math.abs(balance)) + ' بستانکار';

    const rowsHtml = ledger.rows.map(r => {
      let balanceCell;
      if (r.isCheque) {
        balanceCell = `در جریان: ${Formatters.money(r.chequeAmount || 0)}`;
      } else {
        const bal = r.balance;
        balanceCell = `${Formatters.money(Math.abs(bal))} ${bal > 0 ? 'بد' : bal < 0 ? 'بس' : ''}`;
      }

      return `
        <tr>
          <td>${Formatters.toPersianDigits(r.date || '—')}</td>
          <td>${this._esc(r.typeLabel)}</td>
          <td>${r.refNumber ? '#' + Formatters.toPersianDigits(r.refNumber) : '—'}</td>
          <td>${r.debit > 0 ? Formatters.money(r.debit) : '—'}</td>
          <td>${r.credit > 0 ? Formatters.money(r.credit) : '—'}</td>
          <td>${balanceCell}</td>
        </tr>
      `;
    }).join('');

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) { Toast.error('پاپ‌آپ را فعال کنید'); return; }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>صورت‌حساب ${contact.name}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/misc/Farsi-Digits/Vazirmatn-FD-font-face.css" />
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { direction: rtl; text-align: right; font-family: 'Vazirmatn FD', Tahoma, sans-serif; background: #fff; color: #000; }
          body { padding: 10px; }
          h1 { font-size: 18px; color: #0d9488; text-align: center; margin-bottom: 6px; }
          .info { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 16px; }
          .contact-card { border: 1.5px solid #0d9488; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
          .contact-card .name { font-size: 14px; font-weight: 800; }
          .contact-card .details { font-size: 11.5px; color: #64748b; line-height: 1.8; }
          .contact-card .balance-box { text-align: left; }
          .contact-card .balance-label { font-size: 11px; color: #64748b; }
          .contact-card .balance-val { font-size: 16px; font-weight: 800; margin-top: 4px; color: ${isDebtor ? '#dc2626' : isCreditor ? '#059669' : '#64748b'}; }
          .summary { display: flex; gap: 10px; margin-bottom: 16px; }
          .summary > div { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center; }
          .summary .val { font-size: 16px; font-weight: 800; margin-top: 4px; }
          .summary .lbl { font-size: 11px; color: #64748b; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 7px 9px; border: 1px solid #cbd5e1; text-align: right; font-size: 11px; }
          th { background: #f1f5f9; font-weight: 700; }
          .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #94a3b8; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
        </style>
      </head>
      <body>
        <h1>صورت‌حساب شخص</h1>
        <div class="info">تاریخ چاپ: ${Jalali.today()}</div>

        <div class="contact-card">
          <div>
            <div class="name">${this._esc(contact.name)}</div>
            <div class="details">
              ${contact.entityType === 'legal' ? 'شخص حقوقی' : 'شخص حقیقی'}
              ${contact.nationalId ? ' | کد ملی/شناسه: ' + Formatters.toPersianDigits(contact.nationalId) : ''}
              ${contact.mobile ? '<br>همراه: ' + Formatters.phone(contact.mobile) : ''}
              ${contact.address ? '<br>نشانی: ' + this._esc(contact.address) : ''}
            </div>
          </div>
          <div class="balance-box">
            <div class="balance-label">مانده حساب نهایی</div>
            <div class="balance-val">${balanceText}</div>
          </div>
        </div>

        <div class="summary">
          <div>
            <div class="lbl">جمع بدهی</div>
            <div class="val" style="color:#dc2626">${Formatters.money(ledger.totalDebit)}</div>
          </div>
          <div>
            <div class="lbl">جمع پرداختی</div>
            <div class="val" style="color:#059669">${Formatters.money(ledger.totalCredit)}</div>
          </div>
          <div>
            <div class="lbl">تعداد تراکنش</div>
            <div class="val" style="color:#0d9488">${Formatters.number(ledger.rows.length)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:90px">تاریخ</th>
              <th style="width:130px">نوع</th>
              <th style="width:70px">مرجع</th>
              <th style="text-align:left">بدهکار (ریال)</th>
              <th style="text-align:left">بستانکار (ریال)</th>
              <th style="text-align:left">مانده</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div class="footer">فینورا پرو - سامانه مدیریت کسب‌وکار</div>
      </body>
      </html>
    `);
    printWin.document.close();
    setTimeout(() => { printWin.focus(); printWin.print(); }, 500);
  }

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const ContactLedgerModal = new ContactLedgerModalImpl();
window.ContactLedgerModal = ContactLedgerModal;