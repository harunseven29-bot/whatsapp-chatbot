import { NextRequest, NextResponse } from 'next/server';
import { getBusinessData, updateBusinessData } from '@/business';

export async function GET() {
  const data = getBusinessData();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = updateBusinessData(body);
    if (result.success) {
      return NextResponse.json({ success: true, data: result.data });
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
