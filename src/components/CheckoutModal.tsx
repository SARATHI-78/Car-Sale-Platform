import React, { useState } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  X,
  CreditCard,
  Building2,
  Calculator,
  MapPin,
} from 'lucide-react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import {
  CarListing,
  INDIAN_REGIONS,
  IndianRegionCode,
  PaymentMethodType,
  UserProfile,
  VALIDATION_RULES,
  calculateRegionalOnRoadPrice,
  formatINR,
  formatLakhs,
  sanitizeId,
} from '../types/marketplace';
import { triggerBrowserPushNotification } from '../hooks/useOnlineStatus';

interface CheckoutModalProps {
  listing: CarListing;
  selectedRegion: IndianRegionCode;
  onSelectRegion: (code: IndianRegionCode) => void;
  currentUser: UserProfile;
  isOnline: boolean;
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  listing,
  selectedRegion,
  onSelectRegion,
  currentUser,
  isOnline,
  onClose,
  onSuccess,
}) => {
  const [paymentType, setPaymentType] = useState<PaymentMethodType>(
    'Token Booking (UPI/Card)'
  );
  const [upiOrCardInput, setUpiOrCardInput] = useState('9840128842@okhdfcbank');
  const [expiry, setExpiry] = useState('08/29');
  const [cvc, setCvc] = useState('842');
  const [rtgsAccountLast4, setRtgsAccountLast4] = useState('9041');
  const [selectedBank, setSelectedBank] = useState('HDFC Bank Xpress Car Loan');
  const [shippingAddress, setShippingAddress] = useState(
    'Flat 402, Prestige Shantiniketan, Whitefield, Bengaluru - 560048'
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
    rtoCity: string;
  } | null>(null);

  const onRoad = calculateRegionalOnRoadPrice(listing, selectedRegion);
  const tokenBookingAmount = 10000; // ₹10,000 refundable booking token
  const apr = 8.85; // 8.85% p.a. Indian Auto Loan interest rate

  const downPaymentINR = Math.round((onRoad.totalOnRoadPrice * downPaymentPct) / 100);
  const financedPrincipal = onRoad.totalOnRoadPrice - downPaymentINR;
  const monthlyRate = apr / 100 / 12;
  const monthlyEmi = Math.round(
    (financedPrincipal * (monthlyRate * Math.pow(1 + monthlyRate, financeTermMonths))) /
      (Math.pow(1 + monthlyRate, financeTermMonths) - 1)
  );

  const transactionAmount =
    paymentType === 'Token Booking (UPI/Card)'
      ? tokenBookingAmount
      : paymentType === 'Pre-Approved Bank Auto Loan'
      ? Math.max(10000, downPaymentINR)
      : onRoad.totalOnRoadPrice;

  const getCleanLast4 = (): string => {
    const rawDigits =
      paymentType === 'Full On-Road RTGS/NEFT Escrow'
        ? rtgsAccountLast4.replace(/\D/g, '')
        : upiOrCardInput.replace(/\D/g, '');
    const padded = (rawDigits + '8842').slice(-4);
    return VALIDATION_RULES.LAST4_PATTERN.test(padded) ? padded : '8842';
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedAddress = `${shippingAddress.trim()} [RTO: ${onRoad.region.city} ${
      onRoad.region.rtoPrefix
    }]`.slice(0, VALIDATION_RULES.SHIPPING_ADDRESS_MAX);

    if (trimmedAddress.length < VALIDATION_RULES.SHIPPING_ADDRESS_MIN) {
      setErrorMsg('Please enter a valid home delivery address or hub pickup location.');
      return;
    }

    const last4 = getCleanLast4();
    setSubmitting(true);

    const orderId = sanitizeId(`ord_${Date.now()}_${currentUser.uid.slice(0, 6)}`);
    const nextListingStatus =
      paymentType === 'Token Booking (UPI/Card)' ? 'reserved' : 'sold';
    const initialOrderStatus =
      paymentType === 'Full On-Road RTGS/NEFT Escrow' ? 'processing' : 'escrow_funded';

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
      paymentType === 'Token Booking (UPI/Card)'
        ? `Car Reserved in ${onRoad.region.city}`
        : `On-Road Purchase Funded (${onRoad.region.rtoPrefix})`;
    const notifBody = `${listing.title} — ${formatINR(transactionAmount)} (${paymentType}) confirmed.`;

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
      rtoCity: `${onRoad.region.city} (${onRoad.region.rtoPrefix})`,
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
                BharatDrive / Veloce India On-Road Escrow & Booking
              </h2>
              <p className="text-xs text-slate-400">
                7-Day Easy Return · Automated Vahan RC Transfer · Zero Hidden Charges
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
                  Booking #{confirmedOrder.orderId.slice(-8).toUpperCase()} Confirmed —{' '}
                  {isOnline
                    ? 'Vahan RC & Escrow Ledger Recorded'
                    : 'Queued in Offline Vault (Auto-Sync Active)'}
                </h3>
                <p className="text-xs text-emerald-800 mt-1">
                  Your booking for <strong>{listing.title}</strong> is protected by our 7-Day
                  Money-Back Guarantee and 12-Month Comprehensive Warranty.
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 text-sm">
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">RTO Registration / VIN</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {listing.vin} · {confirmedOrder.rtoCity}
                </span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Payment Mode</span>
                <span className="font-medium text-slate-900">
                  {confirmedOrder.paymentType} (Ref •••• {confirmedOrder.paymentLast4})
                </span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Amount Paid / Locked in Escrow</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatINR(confirmedOrder.amount)} ({formatLakhs(confirmedOrder.amount)})
                </span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Delivery / Hub Address</span>
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
                Return to Car Showroom
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleProcessPayment} className="p-6 space-y-5">
            {/* Vehicle & Regional On-Road Summary Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs text-slate-500">
                  <span>{listing.year}</span>
                  <span className="mx-1.5">·</span>
                  <span>{listing.make}</span>
                  <span className="mx-1.5">·</span>
                  <span>{listing.fuelType}</span>
                  <span className="mx-1.5">·</span>
                  <span className="font-mono">{listing.vin}</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mt-0.5">{listing.title}</h3>
              </div>
              <div className="sm:text-right">
                <div className="text-xs text-slate-500">
                  On-Road Price in {onRoad.region.city}
                </div>
                <div className="text-xl font-mono tabular-nums font-bold text-slate-900">
                  {formatINR(onRoad.totalOnRoadPrice)}
                </div>
                <div className="text-[11px] text-slate-500">
                  Ex-Hub: {formatINR(onRoad.exShowroomPrice)} + RTO Tax:{' '}
                  {formatINR(onRoad.rtoRoadTax)}
                </div>
              </div>
            </div>

            {/* Region Selector inside Checkout */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs">
              <div className="flex items-center gap-2 text-amber-950 font-medium">
                <MapPin className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  RTO Region: <strong>{onRoad.region.city}</strong> ({onRoad.region.state} Road Tax{' '}
                  {onRoad.roadTaxPctApplied}%)
                </span>
              </div>
              <select
                value={selectedRegion}
                onChange={(e) => onSelectRegion(e.target.value as IndianRegionCode)}
                className="rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900"
              >
                {INDIAN_REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.city} ({r.rtoPrefix})
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Select Booking or Full On-Road Settlement Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      id: 'Token Booking (UPI/Card)',
                      label: 'Refundable Token Booking',
                      sub: '₹10,000 via UPI/Card · Locks car 72h for Test Drive',
                      icon: Lock,
                    },
                    {
                      id: 'Pre-Approved Bank Auto Loan',
                      label: 'Instant Bank Auto Loan EMI',
                      sub: `8.85% p.a. · Pay ${downPaymentPct}% down (${formatLakhs(
                        downPaymentINR
                      )})`,
                      icon: Calculator,
                    },
                    {
                      id: 'Full On-Road RTGS/NEFT Escrow',
                      label: 'Full On-Road RTGS / NEFT',
                      sub: `Pay ${formatLakhs(onRoad.totalOnRoadPrice)} · Free RC Transfer`,
                      icon: Building2,
                    },
                    {
                      id: 'Instant Card / NetBanking',
                      label: 'Debit / Credit Card / NetBanking',
                      sub: 'Instant full on-road settlement',
                      icon: CreditCard,
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

            {/* Indian Bank Auto Loan EMI Calculator */}
            {paymentType === 'Pre-Approved Bank Auto Loan' && (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">
                    Auto Loan Calculator (8.85% p.a. Fixed ROI)
                  </span>
                  <span className="text-sm font-mono tabular-nums font-bold text-slate-900">
                    EMI: {formatINR(monthlyEmi)}/mo for {financeTermMonths} months
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Down Payment ({downPaymentPct}% — {formatINR(downPaymentINR)})
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
                    <label className="block text-xs text-slate-600 mb-1">
                      Loan Tenure (Months)
                    </label>
                    <div className="flex gap-1.5">
                      {[36, 48, 60, 72, 84].map((term) => (
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
            {paymentType === 'Full On-Road RTGS/NEFT Escrow' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Remitting Indian Bank Name
                  </label>
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                  >
                    <option>HDFC Bank RTGS / NEFT</option>
                    <option>State Bank of India (SBI)</option>
                    <option>ICICI Bank Corporate / Retail</option>
                    <option>Axis Bank Burgundy</option>
                    <option>Kotak Mahindra Bank</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Remitting Account / UTR Last 4 Digits
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={rtgsAccountLast4}
                    onChange={(e) => setRtgsAccountLast4(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    UPI VPA ID or RuPay / Visa / Mastercard Number
                  </label>
                  <input
                    type="text"
                    required
                    value={upiOrCardInput}
                    onChange={(e) => setUpiOrCardInput(e.target.value)}
                    placeholder="9840128842@okhdfcbank or 4532 •••• 8842"
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
                    <label className="block text-xs font-medium text-slate-700 mb-1">CVV/PIN</label>
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

            {/* Home Delivery or Hub Pickup Address */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Doorstep Delivery Address or Nearest Hub ({onRoad.region.hubName})
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
                <div className="text-xs text-slate-500">
                  Payable Today ({paymentType})
                </div>
                <div className="text-2xl font-mono tabular-nums font-bold text-slate-900">
                  {formatINR(transactionAmount)}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({formatLakhs(transactionAmount)})
                  </span>
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
                  className="px-6 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {submitting
                    ? 'Processing Payment...'
                    : `Pay ${formatINR(transactionAmount)} & Confirm`}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
