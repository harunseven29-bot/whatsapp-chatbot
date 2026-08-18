import { NextRequest, NextResponse } from 'next/server';
import { generateReply, getHistory, clearHistory } from '@/assistant';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, jid = 'simulator-user@s.whatsapp.net', action } = body;

    if (action === 'clear') {
      clearHistory(jid);
      return NextResponse.json({ success: true, message: 'History cleared' });
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message field is required' }, { status: 400 });
    }

    const reply = await generateReply(jid, message);
    const history = getHistory(jid);

    return NextResponse.json({
      reply,
      history,
      jid
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jid = searchParams.get('jid') || 'simulator-user@s.whatsapp.net';
  const history = getHistory(jid);
  return NextResponse.json({ history, jid });
}
