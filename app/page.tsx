'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  QrCode, 
  Send, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Server, 
  Clock, 
  Sparkles, 
  Phone, 
  MapPin, 
  BookOpen, 
  ShieldCheck, 
  ExternalLink,
  Layers,
  ChevronRight
} from 'lucide-react';

interface BusinessData {
  businessName: string;
  description: string;
  services: Array<{
    id: string;
    name: string;
    description: string;
    durationMinutes: number;
    price: string;
  }>;
  prices: {
    currency?: string;
    paymentMethods?: string;
    depositRequired?: boolean;
    cancellationPolicy?: string;
  };
  address: string;
  openingHours: Record<string, string>;
  phone: string;
  instagram: string;
  website?: string;
  rules: string[];
  systemPrompt: string;
}

interface MessageItem {
  role: 'user' | 'model';
  text: string;
  timestamp?: number;
}

export default function Home() {
  const [status, setStatus] = useState<any>(null);
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'simulator' | 'business' | 'deployment'>('simulator');
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const [businessJsonDraft, setBusinessJsonDraft] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Fetch initial status and business context
  const fetchData = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setStatus(data);
      if (data.business) {
        setBusiness(data.business);
        setBusinessJsonDraft(JSON.stringify(data.business, null, 2));
      }
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (isMounted) {
          setStatus(data);
          if (data.business) {
            setBusiness(data.business);
            setBusinessJsonDraft(JSON.stringify(data.business, null, 2));
          }
        }
      } catch (err) {
        console.error('Fetch error:', err);
      }
    };
    load();
    const interval = setInterval(load, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userText = inputMessage.trim();
    setInputMessage('');
    
    // Add user message to UI
    const updatedMessages: MessageItem[] = [...messages, { role: 'user', text: userText, timestamp: Date.now() }];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText })
      });
      const data = await res.json();

      if (data.reply) {
        setMessages([...updatedMessages, { role: 'model', text: data.reply, timestamp: Date.now() }]);
      } else if (data.error) {
        setMessages([...updatedMessages, { role: 'model', text: `Hata: ${data.error}`, timestamp: Date.now() }]);
      }
    } catch (err: any) {
      setMessages([...updatedMessages, { role: 'model', text: `Bağlantı hatası: ${err.message}`, timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
      fetchData();
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
      setMessages([]);
      fetchData();
    } catch (e) {
      console.error('Clear error:', e);
    }
  };

  const handleSaveBusiness = async () => {
    try {
      const parsed = JSON.parse(businessJsonDraft);
      const res = await fetch('/api/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (data.success) {
        setBusiness(data.data);
        setIsEditingBusiness(false);
        setSaveMessage('✓ İşletme bilgileri başarıyla güncellendi!');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (err: any) {
      alert('Geçersiz JSON formatı: ' + err.message);
    }
  };

  const samplePrompts = [
    'Hydrafacial ve cilt bakımı fiyatlarınız nedir?',
    'Cumartesi günü saat 14:00 için randevu almak istiyorum.',
    'Lazer epilasyon kadın tüm vücut seansları kaç saat sürüyor?',
    'Yetkili bir müşteri temsilcisiyle görüşmek istiyorum.'
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/10">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">
                  {business?.businessName || 'WhatsApp AI Chatbot'}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Baileys + Gemini 3.7
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Production-Ready 7/24 Northflank Backend Service
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* WhatsApp Status Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800">
              <span className={`w-2.5 h-2.5 rounded-full ${
                status?.whatsapp === 'connected'
                  ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400'
                  : status?.whatsapp === 'waiting_qr_scan'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-400'
              }`} />
              <span className="text-slate-300">
                {status?.whatsapp === 'connected'
                  ? 'WhatsApp Bağlı'
                  : status?.whatsapp === 'waiting_qr_scan'
                  ? 'QR Tarama Bekliyor'
                  : 'Bağlantı Hazır'}
              </span>
            </div>

            <button
              id="refreshStatusBtn"
              onClick={fetchData}
              title="Yenile"
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column (5 cols): WhatsApp Node, Session Storage & Info */}
        <div className="lg:col-span-5 space-y-6">

          {/* WhatsApp Baileys Card */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">WhatsApp Session (Baileys)</h2>
              </div>
              <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                v7.0.0
              </span>
            </div>

            {/* QR or Connected Box */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col items-center justify-center text-center min-h-[220px]">
              {status?.details?.qrDataUrl ? (
                <div className="space-y-3">
                  <div className="bg-white p-2 rounded-xl inline-block shadow-md">
                    <img src={status.details.qrDataUrl} alt="WhatsApp QR" className="w-44 h-44 rounded" />
                  </div>
                  <p className="text-xs font-semibold text-amber-300">WhatsApp &gt; Bağlı Cihazlar &gt; Cihaz Bağla</p>
                  <p className="text-[11px] text-slate-400">Oturum {status.details.authDir} klasörüne kalıcı kaydedilecek.</p>
                </div>
              ) : status?.whatsapp === 'connected' ? (
                <div className="space-y-2 py-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto text-xl">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-emerald-300">WhatsApp Aktif ve Bağlı</h3>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Bot 7/24 çalışıyor. Gelen müşteri mesajlarına Gemini 3.7 ile anında yanıt veriliyor.
                  </p>
                  {status.details?.userJid && (
                    <span className="inline-block font-mono text-[11px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md mt-2">
                      {status.details.userJid}
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-2 py-4">
                  <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Server className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-medium text-slate-300">WhatsApp Socket Hazır</p>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    Northflank persistent volume (/data/auth) üzerinde oturum varsa otomatik bağlanır.
                  </p>
                </div>
              )}
            </div>

            {/* Architecture Metrics */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                <span className="text-xs text-slate-400 block mb-1">Gelen Mesajlar</span>
                <span className="text-lg font-bold text-slate-100">{status?.details?.stats?.messagesReceived || 0}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                <span className="text-xs text-slate-400 block mb-1">Gemini Yanıtları</span>
                <span className="text-lg font-bold text-emerald-400">{status?.details?.stats?.messagesSent || 0}</span>
              </div>
            </div>

            {/* Auth Dir & Config Specs */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Auth Klasörü (AUTH_DIR):</span>
                <span className="font-mono text-[11px] text-slate-300">{status?.details?.authDir || '/data/auth'}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Hafıza Yönetimi:</span>
                <span className="text-emerald-400 font-medium">Son 15 Mesaj / Kullanıcı</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Gemini API:</span>
                <span className={status?.hasApiKey ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                  {status?.hasApiKey ? '✓ Aktif (gemini-3.7-flash)' : '✗ API Key Bekleniyor'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Business Overview Card */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                İşletme Özeti
              </h3>
              <button 
                onClick={() => setActiveTab('business')}
                className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 transition"
              >
                <span>Düzenle</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="text-xs space-y-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              <div className="flex items-start gap-2 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{business?.address}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Hafta İçi: {business?.openingHours?.weekdays || '09:30 - 20:00'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{business?.phone || '+90 532 555 0123'}</span>
              </div>
            </div>

            {/* Rules badge preview */}
            <div className="pt-2">
              <span className="text-[11px] text-slate-400 font-medium block mb-1.5">Önemli Kurallar:</span>
              <ul className="text-[11px] text-slate-400 space-y-1 pl-3 list-disc">
                <li>Bilinmeyen fiyat veya hizmet uydurulmaz.</li>
                <li>Randevu akışında İsim, Tarih ve Hizmet toplanır.</li>
                <li>Yetkili/temsilci istendiğinde insan devir uygulanır.</li>
              </ul>
            </div>
          </div>

        </div>

        {/* Right Column (7 cols): Tabs for Simulator, Business Config & Deployment Guide */}
        <div className="lg:col-span-7 space-y-6">

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              id="tabSimulator"
              onClick={() => setActiveTab('simulator')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                activeTab === 'simulator'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Asistan Simülatörü</span>
            </button>
            <button
              id="tabBusiness"
              onClick={() => setActiveTab('business')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                activeTab === 'business'
                  ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>business.json Yapılandırması</span>
            </button>
            <button
              id="tabDeployment"
              onClick={() => setActiveTab('deployment')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                activeTab === 'deployment'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Northflank 7/24 Rehberi</span>
            </button>
          </div>

          {/* TAB 1: Chat Simulator */}
          {activeTab === 'simulator' && (
            <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col h-[600px]">
              
              {/* Simulator Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-slate-200">WhatsApp Canlı Test Ortamı</span>
                  <span className="text-[11px] text-slate-400">({messages.length}/15 Hafıza Kaydı)</span>
                </div>
                <button
                  onClick={handleClearHistory}
                  title="Hafızayı Temizle"
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 transition"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Hafızayı Sıfırla</span>
                </button>
              </div>

              {/* Chat Message Box */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 my-3 bg-slate-950/90 rounded-xl border border-slate-800">
                {/* Initial Welcome message */}
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                    AI
                  </div>
                  <div className="bg-slate-900 border border-slate-800 text-slate-200 p-3.5 rounded-2xl rounded-tl-none max-w-[85%] text-xs leading-relaxed">
                    <p className="font-semibold text-emerald-400 mb-1">
                      {business?.businessName || 'Nova Estetik'} WhatsApp Asistanı
                    </p>
                    <p>
                      Merhaba! Ben {business?.businessName} akıllı asistanıyım. Size randevu, hizmetlerimiz, güncel fiyatlarımız ve kampanyalarımız hakkında yardımcı olabilirim. Nasıl yardımcı olabilirim? ✨
                    </p>
                  </div>
                </div>

                {/* Conversation History List */}
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {m.role === 'model' && (
                      <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                        AI
                      </div>
                    )}
                    <div
                      className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-emerald-600 text-white rounded-tr-none shadow-md'
                          : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                      }`}
                    >
                      {m.text}
                    </div>
                    {m.role === 'user' && (
                      <div className="w-7 h-7 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0">
                        Siz
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                      AI
                    </div>
                    <div className="bg-slate-900 border border-slate-800 text-slate-400 p-3 rounded-2xl rounded-tl-none text-xs flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Gemini 3.7 yanıt hazırlıyor...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Sample Prompt Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar">
                {samplePrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInputMessage(prompt)}
                    className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 transition shrink-0"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  id="simulatorInput"
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Müşteri gibi bir soru sorun (örn: Fiyatlar ne kadar? Randevu alabilir miyim?)..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
                />
                <button
                  id="simulatorSendBtn"
                  type="submit"
                  disabled={isLoading || !inputMessage.trim()}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 active:scale-95 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/10"
                >
                  <span>Gönder</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: business.json Configuration */}
          {activeTab === 'business' && (
            <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">business.json Canlı Düzenleyici</h3>
                  <p className="text-xs text-slate-400">Gemini&apos;nin sistem promptu bu verilerle anında güncellenir.</p>
                </div>
                <div className="flex items-center gap-2">
                  {saveMessage && <span className="text-xs text-emerald-400 font-medium">{saveMessage}</span>}
                  {isEditingBusiness ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsEditingBusiness(false)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      >
                        İptal
                      </button>
                      <button
                        onClick={handleSaveBusiness}
                        className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold transition"
                      >
                        Kaydet & Güncelle
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingBusiness(true)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 hover:bg-teal-500/30 transition"
                    >
                      JSON Olarak Düzenle
                    </button>
                  )}
                </div>
              </div>

              {isEditingBusiness ? (
                <textarea
                  value={businessJsonDraft}
                  onChange={(e) => setBusinessJsonDraft(e.target.value)}
                  rows={16}
                  className="w-full bg-slate-950 font-mono text-xs text-emerald-300 p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-teal-500/50 leading-relaxed"
                />
              ) : (
                <div className="space-y-4">
                  {/* Services List Table */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                    <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs font-semibold text-slate-300 flex justify-between">
                      <span>Tanımlı Hizmetler ({business?.services?.length || 0})</span>
                      <span>Fiyat</span>
                    </div>
                    <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
                      {business?.services?.map((s) => (
                        <div key={s.id} className="p-3 text-xs flex justify-between items-start gap-4">
                          <div>
                            <span className="font-semibold text-slate-200">{s.name}</span>
                            <p className="text-slate-400 text-[11px] mt-0.5">{s.description}</p>
                            <span className="inline-block text-[10px] text-slate-500 mt-1">Süre: {s.durationMinutes} dk</span>
                          </div>
                          <span className="text-emerald-400 font-mono font-medium whitespace-nowrap">{s.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* System Prompt View */}
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">
                      Sistem Prompt Şablonu:
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">
                      {business?.systemPrompt}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Northflank 7/24 Deployment Guide */}
          {activeTab === 'deployment' && (
            <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4 text-xs">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">Northflank 7/24 Prod Deployment Rehberi</h3>
              </div>

              <div className="space-y-3 leading-relaxed text-slate-300">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="font-bold text-cyan-400 block text-xs">1. Persistent Volume (Oturumun Silinmemesi İçin Zorunlu)</span>
                  <p className="text-slate-400">
                    Northflank panelinde servisinize <strong>Volume</strong> ekleyin ve mount path olarak <code className="text-emerald-300 bg-slate-900 px-1 py-0.5 rounded">/data/auth</code> tanımlayın.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="font-bold text-cyan-400 block text-xs">2. Environment Variables (Çevre Değişkenleri)</span>
                  <div className="font-mono text-[11px] bg-slate-900 p-2.5 rounded-lg text-slate-300 space-y-1">
                    <div>GEMINI_API_KEY = &quot;AIzaSy...&quot;</div>
                    <div>AUTH_DIR = &quot;/data/auth&quot;</div>
                    <div>PORT = &quot;3000&quot;</div>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="font-bold text-cyan-400 block text-xs">3. Health Check Ayarı</span>
                  <p className="text-slate-400">
                    Northflank Health Check: Type: <strong>HTTP</strong>, Path: <code className="text-emerald-300 bg-slate-900 px-1 py-0.5 rounded">/health</code>, Port: <strong>3000</strong>.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="font-bold text-cyan-400 block text-xs">4. Başlatma ve QR Kod Okutma</span>
                  <p className="text-slate-400">
                    Servis deploy olduğunda Northflank Logs ekranında veya web arayüzünde QR kod belirir. WhatsApp &gt; Bağlı Cihazlar ile 1 kez okutulduktan sonra servis 7/24 kesintisiz çalışır.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
