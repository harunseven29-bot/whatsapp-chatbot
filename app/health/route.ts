import { NextResponse } from 'next/server';
import { getWhatsAppStatus } from '@/whatsapp';

export async function GET() {
  const wa = getWhatsAppStatus();
  return NextResponse.json({
    status: 'healthy',
    whatsapp: wa.status === 'connected' ? 'connected' : (wa.status === 'qr_ready' ? 'waiting_qr_scan' : 'disconnected'),
    timestamp: new Date().toISOString()
  }, { status: 200 });
}
