import { NextResponse } from 'next/server';
import { getWhatsAppStatus } from '@/whatsapp';

export async function GET() {
  const wa = getWhatsAppStatus();
  if (wa.status === 'connected') {
    return new NextResponse(
      `<div style="font-family:sans-serif;padding:40px;text-align:center;">
        <h2 style="color:#10b981;">✓ WhatsApp Zaten Bağlı</h2>
        <p>Bot aktif ve mesajları yanıtlıyor.</p>
        <a href="/" style="display:inline-block;margin-top:16px;padding:8px 16px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;">Dashboard'a Dön</a>
      </div>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  if (!wa.qrDataUrl) {
    return new NextResponse(
      `<div style="font-family:sans-serif;padding:40px;text-align:center;">
        <h2>QR Kod Bekleniyor...</h2>
        <p>WhatsApp soketi başlatılıyor, lütfen sayfayı 5 saniye sonra yenileyin.</p>
        <meta http-equiv="refresh" content="5">
      </div>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  return new NextResponse(
    `<div style="font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;color:#fff;">
      <div style="background:#1e293b;padding:32px;border-radius:16px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <h2 style="margin-top:0;font-size:20px;">WhatsApp QR Kodu</h2>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:20px;">Telefonunuzdan WhatsApp > Bağlı Cihazlar ile taratın.</p>
        <div style="background:#fff;padding:12px;border-radius:12px;display:inline-block;">
          <img src="${wa.qrDataUrl}" width="260" height="260" alt="WhatsApp QR Code" style="display:block;" />
        </div>
        <p style="color:#64748b;font-size:12px;margin-top:16px;">Session kalıcı saklanacaktır.</p>
        <a href="/" style="display:inline-block;margin-top:12px;padding:8px 16px;background:#10b981;color:#022c22;font-weight:bold;border-radius:8px;text-decoration:none;font-size:13px;">Canlı Yönetim Paneline Git →</a>
      </div>
    </div>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
