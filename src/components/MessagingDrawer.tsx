import React, { useState, useMemo } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Send, X, MessageSquare, CheckCheck, Clock } from 'lucide-react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import {
  CarListing,
  DirectMessage,
  UserProfile,
  VALIDATION_RULES,
  sanitizeId,
} from '../types/marketplace';
import { triggerBrowserPushNotification } from '../hooks/useOnlineStatus';

interface MessagingDrawerProps {
  currentUser: UserProfile;
  messages: DirectMessage[];
  listings: CarListing[];
  initialListing?: CarListing | null;
  onClose: () => void;
}

interface ConversationThread {
  threadKey: string;
  listingId: string;
  listingTitle: string;
  counterpartyId: string;
  counterpartyName: string;
  items: DirectMessage[];
  unreadCount: number;
}

export const MessagingDrawer: React.FC<MessagingDrawerProps> = ({
  currentUser,
  messages,
  listings,
  initialListing,
  onClose,
}) => {
  const threads = useMemo(() => {
    const map = new Map<string, ConversationThread>();

    // If user clicked "Message Seller" on a specific listing, ensure thread slot exists
    if (initialListing) {
      const isSelfSeller = initialListing.sellerId === currentUser.uid;
      const counterpartyId = isSelfSeller
        ? 'veloce_concierge_specialist'
        : initialListing.sellerId;
      const counterpartyName = isSelfSeller
        ? 'Veloce Private Client Desk'
        : initialListing.sellerName;
      const key = `${initialListing.id}__${counterpartyId}`;
      map.set(key, {
        threadKey: key,
        listingId: initialListing.id,
        listingTitle: initialListing.title,
        counterpartyId,
        counterpartyName,
        items: [],
        unreadCount: 0,
      });
    }

    for (const msg of messages) {
      const isSender = msg.senderId === currentUser.uid;
      const counterpartyId = isSender ? msg.recipientId : msg.senderId;
      const counterpartyName = isSender ? msg.recipientName : msg.senderName;
      const key = `${msg.listingId}__${counterpartyId}`;

      if (!map.has(key)) {
        map.set(key, {
          threadKey: key,
          listingId: msg.listingId,
          listingTitle: msg.listingTitle,
          counterpartyId,
          counterpartyName,
          items: [],
          unreadCount: 0,
        });
      }
      const thread = map.get(key)!;
      thread.items.push(msg);
      if (!isSender && !msg.read) {
        thread.unreadCount += 1;
      }
    }

    return Array.from(map.values());
  }, [messages, initialListing, currentUser.uid]);

  const [selectedKey, setSelectedKey] = useState<string>(() => {
    if (initialListing) {
      const isSelfSeller = initialListing.sellerId === currentUser.uid;
      const counterpartyId = isSelfSeller
        ? 'veloce_concierge_specialist'
        : initialListing.sellerId;
      return `${initialListing.id}__${counterpartyId}`;
    }
    return threads[0]?.threadKey || '';
  });

  const [draftBody, setDraftBody] = useState('');
  const [sending, setSending] = useState(false);

  const activeThread = useMemo(() => {
    return threads.find((t) => t.threadKey === selectedKey) || threads[0] || null;
  }, [threads, selectedKey]);

  const handleSelectThread = async (thread: ConversationThread) => {
    setSelectedKey(thread.threadKey);
    for (const msg of thread.items) {
      if (msg.recipientId === currentUser.uid && !msg.read) {
        try {
          await updateDoc(doc(db, 'messages', msg.id), {
            read: true,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `messages/${msg.id}`);
        }
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetThread = activeThread;
    if (!targetThread) return;

    const cleanBody = draftBody.trim().slice(0, VALIDATION_RULES.MESSAGE_MAX);
    if (!cleanBody) return;

    setSending(true);
    setDraftBody('');

    const msgId = sanitizeId(`msg_${Date.now()}_${currentUser.uid.slice(0, 6)}`);
    try {
      await setDoc(doc(db, 'messages', msgId), {
        listingId: targetThread.listingId,
        listingTitle: targetThread.listingTitle.slice(0, VALIDATION_RULES.TITLE_MAX),
        senderId: currentUser.uid,
        senderName: currentUser.displayName.slice(0, 80),
        recipientId: targetThread.counterpartyId,
        recipientName: targetThread.counterpartyName.slice(0, 80),
        body: cleanBody,
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      setSending(false);
      handleFirestoreError(error, OperationType.CREATE, `messages/${msgId}`);
    }

    const notifId = sanitizeId(`ntf_msg_${Date.now()}_${currentUser.uid.slice(0, 6)}`);
    try {
      await setDoc(doc(db, 'notifications', notifId), {
        recipientId: targetThread.counterpartyId,
        senderId: currentUser.uid,
        type: 'new_message',
        title: `New Inquiry: ${targetThread.listingTitle.slice(0, 50)}`,
        body: cleanBody.slice(0, 200),
        relatedId: msgId,
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `notifications/${notifId}`);
    }

    triggerBrowserPushNotification(
      `Dispatched to ${targetThread.counterpartyName}`,
      cleanBody.slice(0, 120)
    );
    setSending(false);
  };

  const startThreadFromListing = (car: CarListing) => {
    const isSelfSeller = car.sellerId === currentUser.uid;
    const counterpartyId = isSelfSeller ? 'veloce_concierge_specialist' : car.sellerId;
    const key = `${car.id}__${counterpartyId}`;
    setSelectedKey(key);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs">
      <div className="w-full max-w-3xl bg-white h-full flex flex-col shadow-2xl border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-semibold">Direct Buyer & Seller Concierge</h2>
              <p className="text-xs text-slate-400">
                End-to-end verified vehicle dossier & inspection messaging
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0">
          {/* Left Thread List */}
          <div className="w-full sm:w-72 border-b sm:border-b-0 sm:border-r border-slate-200 flex flex-col bg-slate-50/60">
            <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold text-slate-600">
              Active Dossiers ({threads.length})
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
              {threads.length === 0 ? (
                <div className="p-4 space-y-3">
                  <p className="text-xs text-slate-500">
                    No active threads yet. Select a vehicle below to open a direct seller inquiry:
                  </p>
                  {listings.slice(0, 3).map((car) => (
                    <button
                      key={car.id}
                      onClick={() => startThreadFromListing(car)}
                      className="w-full text-left p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400 transition-colors"
                    >
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {car.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Seller: {car.sellerName}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                threads.map((thread) => {
                  const isSelected = activeThread?.threadKey === thread.threadKey;
                  const lastMsg = thread.items[thread.items.length - 1];
                  return (
                    <button
                      key={thread.threadKey}
                      onClick={() => handleSelectThread(thread)}
                      className={`w-full text-left px-4 py-3.5 transition-colors ${
                        isSelected ? 'bg-white border-l-2 border-l-slate-900' : 'hover:bg-white/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {thread.counterpartyName}
                        </span>
                        {thread.unreadCount > 0 && (
                          <span className="font-mono text-[11px] font-semibold text-amber-700">
                            {thread.unreadCount} new
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 truncate mt-0.5">
                        {thread.listingTitle}
                      </div>
                      {lastMsg && (
                        <div className="text-[11px] text-slate-400 truncate mt-1">
                          {lastMsg.body}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Conversation Stream */}
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {activeThread ? (
              <>
                <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">
                      Counterparty: {activeThread.counterpartyName}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {activeThread.listingTitle}
                    </h3>
                  </div>
                </div>

                <div className="flex-1 p-6 overflow-y-auto space-y-4">
                  {activeThread.items.length === 0 ? (
                    <div className="text-center py-12 max-w-sm mx-auto">
                      <p className="text-sm font-medium text-slate-800">
                        Start Direct Seller Inquiry
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Request cold-start video, paint meter readings, DME over-rev report, or
                        pre-purchase inspection scheduling.
                      </p>
                    </div>
                  ) : (
                    activeThread.items.map((msg) => {
                      const isMine = msg.senderId === currentUser.uid;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-md rounded-xl px-4 py-2.5 text-sm ${
                              isMine
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-900 border border-slate-200'
                            }`}
                          >
                            <p className="leading-relaxed">{msg.body}</p>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                            <span>{msg.senderName}</span>
                            <span>·</span>
                            {msg.hasPendingWrites ? (
                              <span className="inline-flex items-center gap-1 text-amber-600">
                                <Clock className="w-3 h-3" /> Queued Offline (Will Auto-Sync)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <CheckCheck className="w-3 h-3 text-emerald-600" />
                                {msg.read ? 'Read' : 'Delivered'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  onSubmit={handleSendMessage}
                  className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-2.5"
                >
                  <input
                    type="text"
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Ask about service records, paint meter readings, or escrow terms..."
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draftBody.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Select a vehicle listing to begin messaging
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    All buyer-seller communications are logged and synced across devices.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
