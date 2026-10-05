import React from 'react';
import {
  X,
  MessageSquare,
  ShieldCheck,
  Edit3,
  MapPin,
  Calculator,
  CheckCircle2,
} from 'lucide-react';
import {
  CarListing,
  INDIAN_REGIONS,
  IndianRegionCode,
  UserProfile,
  calculateRegionalOnRoadPrice,
  formatINR,
  formatLakhs,
} from '../types/marketplace';
import { VehicleImage } from './VehicleImage';

interface VehicleDetailModalProps {
  listing: CarListing;
  selectedRegion: IndianRegionCode;
  onSelectRegion: (code: IndianRegionCode) => void;
  currentUser: UserProfile | null;
  isAdminUser: boolean;
  onClose: () => void;
  onOpenCheckout: (listing: CarListing) => void;
  onOpenRegionalMatrix: (listing: CarListing) => void;
  onOpenMessage: (listing: CarListing) => void;
  onOpenEdit: (listing: CarListing) => void;
  onRequireAuth: () => void;
}

export const VehicleDetailModal: React.FC<VehicleDetailModalProps> = ({
  listing,
  selectedRegion,
  onSelectRegion,
  currentUser,
  isAdminUser,
  onClose,
  onOpenCheckout,
  onOpenRegionalMatrix,
  onOpenMessage,
  onOpenEdit,
  onRequireAuth,
}) => {
  const canEdit = currentUser && (isAdminUser || listing.sellerId === currentUser.uid);
  const onRoad = calculateRegionalOnRoadPrice(listing, selectedRegion);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-5xl rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-8">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="text-xs text-slate-500">
            <span>{listing.year}</span>
            <span className="mx-1.5">·</span>
            <span>{listing.make}</span>
            <span className="mx-1.5">·</span>
            <span>{listing.bodyStyle}</span>
            <span className="mx-1.5">·</span>
            <span className="font-mono">RTO/VIN: {listing.vin}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Close vehicle details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contiguous Purchase Module Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left Gallery, 140-Point Inspection & Technical Breakdown */}
          <div className="lg:col-span-7 p-6 space-y-6 border-b lg:border-b-0 lg:border-r border-slate-200">
            <div className="aspect-4/3 w-full rounded-lg overflow-hidden bg-slate-900">
              <VehicleImage
                src={listing.imageUrl}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            </div>

            {/* 140-Point CARS24-Style Inspection Report Summary */}
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  140-Point Hub Inspection Report — Certified Non-Accidental
                </div>
                <span className="font-mono text-xs font-semibold text-emerald-700">
                  4.9 / 5.0 Rating
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                <div>
                  <div className="text-slate-500">Core Structure</div>
                  <div className="font-mono font-semibold text-slate-900">100% Intact</div>
                </div>
                <div>
                  <div className="text-slate-500">Engine & AT</div>
                  <div className="font-mono font-semibold text-slate-900">99% Optimal</div>
                </div>
                <div>
                  <div className="text-slate-500">Electricals / ADAS</div>
                  <div className="font-mono font-semibold text-slate-900">100% Verified</div>
                </div>
                <div>
                  <div className="text-slate-500">Flood / Odometer</div>
                  <div className="font-mono font-semibold text-emerald-700">Zero Tamper</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Vehicle History, Variant Features & Hub Notes
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">{listing.description}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 pt-4 border-t border-slate-200 text-xs">
              <div>
                <div className="text-slate-500">Kilometers Driven</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                  {listing.mileage.toLocaleString('en-IN')} km
                </div>
              </div>
              <div>
                <div className="text-slate-500">Fuel / Powertrain</div>
                <div className="font-semibold text-slate-900 mt-0.5">{listing.fuelType}</div>
              </div>
              <div>
                <div className="text-slate-500">Transmission</div>
                <div className="font-semibold text-slate-900 mt-0.5">{listing.transmission}</div>
              </div>
              <div>
                <div className="text-slate-500">Drivetrain</div>
                <div className="font-semibold text-slate-900 mt-0.5">{listing.drivetrain}</div>
              </div>
              <div>
                <div className="text-slate-500">Exterior Colour</div>
                <div className="font-semibold text-slate-900 mt-0.5">{listing.exteriorColor}</div>
              </div>
              <div>
                <div className="text-slate-500">Current Hub Location</div>
                <div className="font-semibold text-slate-900 mt-0.5">{listing.location}</div>
              </div>
            </div>
          </div>

          {/* Right Contiguous Purchase & Live Regional On-Road Module */}
          <div className="lg:col-span-5 p-6 flex flex-col justify-between bg-slate-50/50">
            <div className="space-y-5">
              <div>
                <div className="text-xs text-slate-500">
                  <span>Hub: {listing.sellerName}</span>
                  <span className="mx-1.5">·</span>
                  <span className="capitalize">{listing.status}</span>
                </div>
                <h2 className="text-2xl font-display font-bold text-slate-900 mt-1">
                  {listing.title}
                </h2>
              </div>

              {/* Region Selector inside PDP */}
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-600" />
                    On-Road Price in Your City
                  </span>
                  <select
                    value={selectedRegion}
                    onChange={(e) => onSelectRegion(e.target.value as IndianRegionCode)}
                    className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-900 bg-slate-50"
                  >
                    {INDIAN_REGIONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.city} ({r.rtoPrefix})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Base Ex-Showroom / Hub Price</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      {formatINR(onRoad.exShowroomPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>
                      {onRoad.region.state} RTO Tax ({onRoad.roadTaxPctApplied}%)
                    </span>
                    <span className="font-mono tabular-nums text-slate-800">
                      + {formatINR(onRoad.rtoRoadTax)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Zero-Dep Insurance + 1% TCS + RC/FASTag</span>
                    <span className="font-mono tabular-nums text-slate-800">
                      +{' '}
                      {formatINR(
                        onRoad.insuranceZeroDep +
                          onRoad.tcsCharge +
                          onRoad.fastagAndHsrp +
                          onRoad.rcTransferAndGreenCess +
                          onRoad.interStateNocLogistics
                      )}
                    </span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-200 flex items-baseline justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Total On-Road ({onRoad.region.city})
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formatLakhs(onRoad.totalOnRoadPrice)} · EMI{' '}
                      {formatINR(onRoad.monthlyEmiEstimate)}/mo
                    </div>
                  </div>
                  <div className="text-2xl font-mono tabular-nums font-bold text-slate-900">
                    {formatINR(onRoad.totalOnRoadPrice)}
                  </div>
                </div>

                <button
                  onClick={() => onOpenRegionalMatrix(listing)}
                  className="w-full py-1.5 px-3 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium hover:bg-amber-100 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Compare On-Road Price Across All 8 Indian Regions
                </button>
              </div>

              <div className="p-3.5 rounded-lg bg-white border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  7-Day Easy Return & 12-Month Comprehensive Warranty
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Book with a 100% refundable ₹10,000 token for a Home Test Drive or complete full
                  on-road escrow checkout with automated Vahan RC transfer.
                </p>
              </div>

              <div className="space-y-2.5">
                {listing.status === 'active' ? (
                  <button
                    onClick={() => {
                      if (!currentUser) {
                        onRequireAuth();
                      } else {
                        onOpenCheckout(listing);
                      }
                    }}
                    className="w-full py-3 px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                  >
                    Book Now (₹10,000 Token) or Buy On-Road
                  </button>
                ) : (
                  <div className="w-full py-3 px-4 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold text-center uppercase tracking-wider">
                    Vehicle {listing.status}
                  </div>
                )}

                <button
                  onClick={() => {
                    if (!currentUser) {
                      onRequireAuth();
                    } else {
                      onOpenMessage(listing);
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs font-semibold hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Schedule Home Test Drive / Chat with Hub Advisor
                </button>

                {canEdit && (
                  <button
                    onClick={() => onOpenEdit(listing)}
                    className="w-full py-2 px-4 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:text-slate-900 hover:bg-white transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Listing & Ex-Showroom Price
                  </button>
                )}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Hub Views: {listing.viewsCount.toLocaleString('en-IN')}</span>
              <span>Free RC Transfer & Paperwork Included</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
