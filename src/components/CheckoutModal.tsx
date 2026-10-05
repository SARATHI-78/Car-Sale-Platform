import React, { useState } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck, Lock, CheckCircle2, X, CreditCard, Building2, Calculator } from 'lucide-react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import {
  CarListing,
  PaymentMethodType,
  UserProfile,
  VALIDATION_RULES,
  sanitizeId,
} from '../types/marketplace';
import { triggerBrowserPushNotification } from '../hooks/useOnlineStatus';

interface CheckoutModalProps {
  listing: CarListing;
  currentUser: UserProfile;
  isOnline: boolean;
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  listing,
  currentUser,
  isOnline,
  onClose,
  onSuccess,
}) => {
  const [paymentType, setPaymentType] = useState<PaymentMethodType>('Reservation Deposit');
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8842');
  const [expiry, setExpiry] = useState('08/29');
  const [cvc, setCvc] = useState('842');
  const [wireRoutingLast4, setWireRoutingLast4] = useState('9041');
  const [shippingAddress, setShippingAddress] = useState(
    '742 Evergreen Terrace, Beverly Hills, CA 90210'
  );
  const [financeTermMonths, setFinanceTermMonths] = useState<number>(60);
  const [downPaymentPct, setDownPaymentPct] = useState<number>(20);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<{
    orderId: string;
    amount: number;
    paymentType: PaymentMethodType;
    paymentLast4: string;
    shippingAddress: string;
  } | null>(null);

  const depositAmount = 2500;
  const escrowFee = 495;
  const apr = 5.49;

  const downPaymentDollar = Math.round((listing.price * downPaymentPct) / 100);
  const financedPrincipal = listing.price - downPaymentDollar;
  const monthlyRate = apr / 100 / 12;
  const monthlyPayment = Math.round(
    (financedPrincipal * (monthlyRate * Math.pow(1 + monthlyRate, financeTermMonths))) /
      (Math.pow(1 + monthlyRate, financeTermMonths) - 1)
  );

  const transactionAmount =
    paymentType === 'Reservation Deposit'
      ? depositAmount
      : paymentType === 'Pre-Approved Financing'
      ? Math.max(1000, downPaymentDollar)
      : listing.price + escrowFee;

  const getCleanLast4 = (): string => {
    const rawDigits =
      paymentType === 'Full Escrow Wire'
        ? wireRoutingLast4.replace(/\D/g, '')
        : cardNumber.replace(/\D/g, '');
    const padded = (rawDigits + '8842').slice(-4);
    return VALIDATION_RULES.LAST4_PATTERN.test(padded) ? padded : '8842';
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedAddress = shippingAddress.trim();
    if (
      trimmedAddress.length < VALIDATION_RULES.SHIPPING_ADDRESS_MIN ||
      trimmedAddress.length > VALIDATION_RULES.SHIPPING_ADDRESS_MAX
    ) {
      setErrorMsg('Please enter a valid delivery address (5 to 250 characters).');
      return;
    }

    const last4 = getCleanLast4();
    setSubmitting(true);

    const orderId = sanitizeId(`ord_${Date.now()}_${currentUser.uid.slice(0, 6)}`);
    const nextListingStatus = paymentType === 'Reservation Deposit' ? 'reserved' : 'sold';
    const initialOrderStatus =
      paymentType === 'Full Escrow Wire' ? 'processing' : 'escrow_funded';

    try {
      await setDoc(doc(db, 'orders', orderId), {
        listingId: listing.id,
        listingTitle: listing.title.slice(0, VALIDATION_RULES.TITLE_MAX),
        buyerId: currentUser.uid,
        buyerName: currentUser.displayName.slice(0, 80),
        sellerId: listing.sellerId,
        amount: transactionAmount,
        paymentType,
        paymentLast4: last4,
        shippingAddress: trimmedAddress,
        status: initialOrderStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      setSubmitting(false);
      handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}`);
    }

    try {
      if (listing.status === 'active') {
        await updateDoc(doc(db, 'listings', listing.id), {
          status: nextListingStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      setSubmitting(false);
      handleFirestoreError(error, OperationType.UPDATE, `listings/${listing.id}`);
    }

    const notifId = sanitizeId(`ntf_${Date.now()}_${currentUser.uid.slice(0, 6)}`);
    const notifTitle =
      paymentType === 'Reservation Deposit'
        ? 'Vehicle Reserved in Escrow'
        : 'Vehicle Purchase Escrow Funded';
    const notifBody = `${listing.title} — $${transactionAmount.toLocaleString()} (${paymentType}) confirmed.`;

    try {
      await setDoc(doc(db, 'notifications', notifId), {
        recipientId: currentUser.uid,
        senderId: currentUser.uid,
        type: 'order_update',
        title: notifTitle,
        body: notifBody,
        relatedId: orderId,
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `notifications/${notifId}`);
    }

    triggerBrowserPushNotification(notifTitle, notifBody);

    setSubmitting(false);
    setConfirmedOrder({
      orderId,
      amount: transactionAmount,
      paymentType,
      paymentLast4: last4,
      shippingAddress: trimmedAddress,
    });
    onSuccess(orderId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h2 className="text-base font-semibold tracking-wide">
                Veloce Escrow & Checkout Settlement
              </h2>
              <p className="text-xs text-slate-400">
                256-bit encrypted transaction vault · Funds held until inspection approval
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close checkout modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {confirmedOrder ? (
          <div className="p-6 space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-emerald-950">
                  Order #{confirmedOrder.orderId.slice(-8).toUpperCase()} Confirmed —{' '}
                  {isOnline ? 'Escrow Ledger Recorded' : 'Queued in Offline Vault (Auto-Sync Active)'}
                </h3>
                <p className="text-xs text-emerald-800 mt-1">
                  Your transaction for <strong>{listing.title}</strong> is protected under Veloce
                  Buyer Protection. Enclosed carrier dispatch and 7-day mechanical inspection window
                  are now active.
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 text-sm">
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Vehicle Identification (VIN)</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {listing.vin}
                </span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Settlement Method</span>
                <span className="font-medium text-slate-900">
                  {confirmedOrder.paymentType} (•••• {confirmedOrder.paymentLast4})
                </span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Amount Settled / Held in Escrow</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  ${confirmedOrder.amount.toLocaleString()} USD
                </span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Delivery Destination</span>
                <span className="text-slate-900 text-right max-w-xs">
                  {confirmedOrder.shippingAddress}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
              >
                Return to Marketplace
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleProcessPayment} className="p-6 space-y-6">
            {/* Vehicle Summary Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div>
                <div className="text-xs text-slate-500">
                  <span>{listing.year}</span>
                  <span className="mx-1.5">·</span>
                  <span>{listing.make}</span>
                  <span className="mx-1.5">·</span>
                  <span className="font-mono">{listing.vin}</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mt-0.5">{listing.title}</h3>
              </div>
              <div className="sm:text-right">
                <div className="text-xs text-slate-500">Vehicle Asking Price</div>
                <div className="text-xl font-mono tabular-nums font-semibold text-slate-900">
                  ${listing.price.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Select Settlement Structure
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      id: 'Reservation Deposit',
                      label: 'Refundable Escrow Hold',
                      sub: '$2,500 instant deposit · Locks vehicle 72h',
                      icon: Lock,
                    },
                    {
                      id: 'Instant Card Checkout',
                      label: 'Instant Card Settlement',
                      sub: 'Full purchase + $495 escrow protection',
                      icon: CreditCard,
                    },
                    {
                      id: 'Full Escrow Wire',
                      label: 'FedWire / SWIFT Escrow',
                      sub: 'Direct institutional bank settlement',
                      icon: Building2,
                    },
                    {
                      id: 'Pre-Approved Financing',
                      label: 'Veloce Private Client Finance',
                      sub: `5.49% APR · Pay ${downPaymentPct}% down today`,
                      icon: Calculator,
                    },
                  ] as const
                ).map((option) => {
                  const Icon = option.icon;
                  const active = paymentType === option.id;
                  return (
                    <button
                      type="button"
                      key={option.id}
                      onClick={() => setPaymentType(option.id)}
                      className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors ${
                        active
                          ? 'border-slate-900 bg-slate-900/5 text-slate-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-slate-700" />
                      <div>
                        <div className="text-xs font-semibold">{option.label}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{option.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Financing Calculator if Financing selected */}
            {paymentType === 'Pre-Approved Financing' && (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">
                    Financing Structure (5.49% Fixed APR)
                  </span>
                  <span className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                    Est. ${monthlyPayment.toLocaleString()}/mo for {financeTermMonths} mos
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Down Payment ({downPaymentPct}% — ${downPaymentDollar.toLocaleString()})
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={50}
                      step={5}
                      value={downPaymentPct}
                      onChange={(e) => setDownPaymentPct(Number(e.target.value))}
                      className="w-full accent-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Loan Term (Months)</label>
                    <div className="flex gap-1.5">
                      {[36, 48, 60, 72].map((term) => (
                        <button
                          type="button"
                          key={term}
                          onClick={() => setFinanceTermMonths(term)}
                          className={`flex-1 py-1.5 text-xs font-mono rounded border transition-colors ${
                            financeTermMonths === term
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {term}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Instrument Inputs */}
            {paymentType === 'Full Escrow Wire' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Originating Bank Name
                  </label>
                  <input
                    type="text"
                    required
                    defaultValue="JPMorgan Private Bank"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Originating Account Last 4 Digits
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={wireRoutingLast4}
                    onChange={(e) => setWireRoutingLast4(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Card Number
                  </label>
                  <input
                    type="text"
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4532 •••• •••• 8842"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Expiry</label>
                    <input
                      type="text"
                      required
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      placeholder="MM/YY"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">CVC</label>
                    <input
                      type="text"
                      required
                      maxLength={4}
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value)}
                      placeholder="842"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Enclosed Carrier Delivery Address */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Enclosed Carrier Delivery Address or Receiving Concierge Hub
              </label>
              <input
                type="text"
                required
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            {/* Total & Submit */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200">
              <div>
                <div className="text-xs text-slate-500">Total Due Today (Escrow Protected)</div>
                <div className="text-2xl font-mono tabular-nums font-semibold text-slate-900">
                  ${transactionAmount.toLocaleString()} USD
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {submitting
                    ? 'Authorizing Escrow...'
                    : `Authorize $${transactionAmount.toLocaleString()} Settlement`}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
