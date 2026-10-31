import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Mic,
  MicOff,
  Send,
  X,
  Sparkles,
  Key,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { aiBookingApi, ParsedBookingResult } from '../../services/dispatchApi';
import { useAuth } from '../../context/AuthContext';

interface AiBookingChatModalProps {
  onBookingSuccess?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  isVoice?: boolean;
  parsedBooking?: ParsedBookingResult;
  bookingConfirmed?: boolean;
  bookingJobId?: string;
  timestamp: Date;
}

export const AiBookingChatModal: React.FC<AiBookingChatModalProps> = ({ onBookingSuccess }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showKeyConfig, setShowKeyConfig] = useState(false);

  // Groq API Key management
  const [groqKey, setGroqKey] = useState<string>(() => {
    return (
      localStorage.getItem('dispatch_groq_api_key') ||
      import.meta.env.VITE_GROQ_API_KEY ||
      ''
    );
  });
  const [keySavedMessage, setKeySavedMessage] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Hello ${user.name || 'there'}! I am your AI Dispatch Assistant. Tell me or speak what service you need (e.g. "Urgent plumbing repair for a leaking pipe in Zone North") and I will schedule an appointment for you immediately.`,
      timestamp: new Date(),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('Failed to setup speech recognition:', e);
      setSpeechSupported(false);
    }
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const toggleListening = () => {
    if (!speechSupported) {
      alert('Speech recognition is not supported in this browser. Please type your request.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setInputText('');
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.warn('Failed to start speech recognition:', err);
      }
    }
  };

  const handleSaveGroqKey = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('dispatch_groq_api_key', groqKey.trim());
    setKeySavedMessage(true);
    setTimeout(() => {
      setKeySavedMessage(false);
      setShowKeyConfig(false);
    }, 1500);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      isVoice: isListening || textToSend !== undefined ? false : undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const activeKey =
        groqKey.trim() ||
        localStorage.getItem('dispatch_groq_api_key') ||
        import.meta.env.VITE_GROQ_API_KEY ||
        '';

      const res = await aiBookingApi.parse(text, activeKey);
      const parsed = res.data;

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: `I've analyzed your request: "${parsed.description}". Please review the booking summary below and confirm your appointment.`,
        parsedBooking: parsed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: 'assistant',
          text: `Sorry, I encountered an issue analyzing your request: ${err.message || 'Server error'}. Please try again or rephrase.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmBooking = async (msgId: string, booking: ParsedBookingResult) => {
    setIsLoading(true);
    try {
      const customerName = user.name || 'Valued Client';
      const res = await aiBookingApi.book({
        customerName,
        description: booking.description,
        requiredSkills: booking.requiredSkills,
        serviceZone: booking.serviceZone,
        priority: booking.priority,
        estimatedDuration: booking.estimatedDuration,
      });

      const createdJob = res.data;

      // Update message status
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === msgId
            ? {
                ...msg,
                bookingConfirmed: true,
                bookingJobId: createdJob.id,
              }
            : msg
        )
      );

      // Add success message
      setMessages((prev) => [
        ...prev,
        {
          id: `confirmed-${Date.now()}`,
          sender: 'assistant',
          text: `🎉 Appointment confirmed! Work Order #${createdJob.id.slice(0, 8).toUpperCase()} has been registered. It is now visible on your dashboard and queued in the Admin dispatch console for technician assignment.`,
          timestamp: new Date(),
        },
      ]);

      if (onBookingSuccess) {
        onBookingSuccess();
      }
    } catch (err: any) {
      alert(`Failed to confirm booking: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const samplePrompts = [
    'Emergency HVAC repair for overheating office in Zone North',
    'Urgent pipe leak in master bathroom, Zone West',
    'Circuit breaker tripped and sparking in Zone East',
    'Install Level 2 EV charging station at home in Zone South',
  ];

  return (
    <>
      {/* Floating Action Trigger Button */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="relative group flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-xl shadow-brand-500/30 hover:scale-105 active:scale-95 transition-all duration-200"
          title="Open AI Voice & Chat Booking"
          aria-label="Open AI Booking Assistant"
        >
          {/* Animated pulse ring */}
          <span className="absolute -inset-1 rounded-full bg-brand-400 opacity-40 animate-ping" />
          
          {isOpen ? (
            <X className="h-6 w-6 relative z-10" />
          ) : (
            <div className="relative z-10 flex items-center justify-center">
              <MessageSquare className="h-6 w-6" />
              <Mic className="h-3 w-3 absolute -bottom-1 -right-1 text-emerald-300" />
            </div>
          )}
        </button>
      </div>

      {/* Floating Chat Modal Drawer */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 flex flex-col w-[92vw] sm:w-[420px] h-[580px] max-h-[85vh] rounded-2xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-xl shadow-2xl text-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-md">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-white">AI Dispatch Assistant</h3>
                  <span className="rounded bg-emerald-950 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-400">
                    Groq Llama 3.3
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Voice or text appointment booking</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowKeyConfig((prev) => !prev)}
                className={`rounded-lg p-1.5 transition-colors ${
                  showKeyConfig || groqKey
                    ? 'text-amber-400 hover:bg-slate-800'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
                title="Configure Groq API Key"
              >
                <Key className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Groq Key Configuration Banner / Drawer */}
          {showKeyConfig && (
            <div className="border-b border-amber-500/30 bg-amber-950/40 p-3.5 text-xs text-amber-200">
              <div className="flex items-center justify-between font-semibold mb-1 text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" />
                  Groq API Key Configuration
                </span>
                <button
                  type="button"
                  onClick={() => setShowKeyConfig(false)}
                  className="text-amber-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-amber-200/80 mb-2 leading-relaxed">
                Paste your Groq API key here or set <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">GROQ_API_KEY</code> in <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">backend/.env</code>.
                Get a free key from <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="underline font-bold text-amber-300 hover:text-amber-100">Groq Console</a>.
              </p>
              <form onSubmit={handleSaveGroqKey} className="flex gap-2">
                <input
                  type="password"
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  placeholder="gsk_..."
                  className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-md bg-amber-500 px-3 py-1 font-semibold text-slate-950 hover:bg-amber-400 transition-colors"
                >
                  Save
                </button>
              </form>
              {keySavedMessage && (
                <div className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Key saved for session!
                </div>
              )}
            </div>
          )}

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-brand-600 text-white rounded-br-xs'
                      : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-xs'
                  }`}
                >
                  {msg.isVoice && (
                    <div className="flex items-center gap-1 text-[10px] text-brand-200 mb-1 font-semibold">
                      <Mic className="h-2.5 w-2.5" /> Voice Input
                    </div>
                  )}
                  <p>{msg.text}</p>

                  {/* Parsed Booking Confirmation Card */}
                  {msg.parsedBooking && !msg.bookingConfirmed && (
                    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-slate-200 space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                        <span className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-brand-400" />
                          Appointment Details
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          msg.parsedBooking.priority === 'CRITICAL'
                            ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                            : msg.parsedBooking.priority === 'HIGH'
                            ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                        }`}>
                          {msg.parsedBooking.priority}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Required Skill</span>
                          <span className="font-semibold text-brand-300">
                            {msg.parsedBooking.requiredSkills.join(', ')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Service Zone</span>
                          <span className="font-semibold text-slate-200">
                            {msg.parsedBooking.serviceZone}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Estimated Duration</span>
                          <span className="font-semibold text-slate-200">
                            {msg.parsedBooking.estimatedDuration} mins
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Client / Requester</span>
                          <span className="font-semibold text-slate-200">
                            {user.name || 'Valued Client'}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 italic">
                        {msg.parsedBooking.explanation}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleConfirmBooking(msg.id, msg.parsedBooking!)}
                        disabled={isLoading}
                        className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/30 active:scale-98 transition-all"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirm & Book Appointment
                      </button>
                    </div>
                  )}

                  {msg.bookingConfirmed && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Booked as Work Order #{msg.bookingJobId?.slice(0, 8).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-slate-500 mt-1 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-brand-400 bg-slate-800/60 p-2.5 rounded-xl w-fit border border-slate-700/50">
                <Sparkles className="h-3.5 w-3.5 animate-spin" />
                <span>AI analyzing booking intent & scheduling constraints...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Sample Prompts Pills */}
          {messages.length <= 2 && (
            <div className="px-4 py-1.5 border-t border-slate-800/60 bg-slate-950/30 overflow-x-auto whitespace-nowrap flex gap-1.5">
              {samplePrompts.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="rounded-full border border-slate-700/80 bg-slate-800/80 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Voice Live Transcript Indicator */}
          {isListening && (
            <div className="px-4 py-2 bg-rose-950/50 border-t border-rose-500/30 flex items-center justify-between text-xs text-rose-300 animate-pulse">
              <span className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                Listening to your voice... Speak now!
              </span>
              <button
                type="button"
                onClick={toggleListening}
                className="text-xs font-bold text-white hover:underline"
              >
                Done
              </button>
            </div>
          )}

          {/* Chat Input Bar */}
          <div className="border-t border-slate-800 bg-slate-950/90 p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              {/* Mic Button */}
              <button
                type="button"
                onClick={toggleListening}
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-600/40'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
                title={isListening ? 'Stop recording voice' : 'Speak booking request'}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  isListening
                    ? 'Listening... Speak now'
                    : 'Type or speak your service request...'
                }
                className="flex-1 rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 transition-colors shadow-md shadow-brand-600/20"
                title="Send booking message"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AiBookingChatModal;
