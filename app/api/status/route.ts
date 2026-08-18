import { NextResponse } from 'next/server';
import { getWhatsAppStatus } from '@/whatsapp';
import { getMemoryStats } from '@/assistant';
import { getBusinessData } from '@/business';

export async function GET() {
  const wa = getWhatsAppStatus();
  const memoryStats = getMemoryStats();
  const business = getBusinessData();

  return NextResponse.json({
    status: 'ok',
    whatsapp: wa.status === 'connected' ? 'connected' : (wa.status === 'qr_ready' ? 'waiting_qr_scan' : 'disconnected'),
    details: wa,
    memoryStats,
    business,
    hasApiKey: !!process.env.GEMINI_API_KEY
  });
}

