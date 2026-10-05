import React from 'react';
import { X, MessageSquare, ShieldCheck, Edit3 } from 'lucide-react';
import { CarListing, UserProfile } from '../types/marketplace';
import { VehicleImage } from './VehicleImage';

interface VehicleDetailModalProps {
  listing: CarListing;
  currentUser: UserProfile | null;
  isAdminUser: boolean;
  onClose: () => void;
  onOpenCheckout: (listing: CarListing) => void;
  onOpenMessage: (listing: CarListing) => void;
  onOpenEdit: (listing: CarListing) => void;
  onRequireAuth: () => void;
}

export const VehicleDetailModal: React.FC<VehicleDetailModalProps> = ({
  listing,
  currentUser,
  isAdminUser,
  onClose,
  onOpenCheckout,
  onOpenMessage,
  onOpenEdit,
  onRequireAuth,
}) => {
  const canEdit =
    currentUser && (isAdminUser || listing.sellerId === currentUser.uid);

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
            <span className="font-mono">VIN {listing.vin}</span>
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
          {/* Left Gallery & Technical Specification Breakdown */}
          <div className="lg:col-span-7 p-6 space-y-6 border-b lg:border-b-0 lg:border-r border-slate-200">
            <div className="aspect-4/3 w-full rounded-lg overflow-hidden bg-slate-900">
              <VehicleImage
                src={listing.imageUrl}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Provenance & Factory Specification
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">{listing.description}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 pt-4 border-t border-slate-200 text-xs">
              <div>
                <div className="text-slate-500">Odometer</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                  {listing.mileage.toLocaleString()} miles
                </div>
              </div>
              <div>
                <div className="text-slate-500">Powertrain</div>
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
                <div className="text-slate-500">Exterior Finish</div>
                <div className="font-semibold text-slate-900 mt-0.5">{listing.exteriorColor}</div>
              </div>
              <div>
                <div className="text-slate-500">Location</div>
                <div className="font-semibold text-slate-900 mt-0.5">{listing.location}</div>
              </div>
            </div>
          </div>

          {/* Right Contiguous Purchase Module */}
          <div className="lg:col-span-5 p-6 flex flex-col justify-between bg-slate-50/50">
            <div className="space-y-6">
              <div>
                <div className="text-xs text-slate-500">
                  <span>Consigned by {listing.sellerName}</span>
                  <span className="mx-1.5">·</span>
                  <span className="capitalize">{listing.status}</span>
                </div>
                <h2 className="text-2xl font-display font-bold text-slate-900 mt-1">
                  {listing.title}
                </h2>
                <div className="mt-4 pt-4 border-t border-slate-200 flex items-baseline justify-between">
                  <span className="text-xs text-slate-500">Direct Reserve Price</span>
                  <span className="text-3xl font-mono tabular-nums font-bold text-slate-900">
                    ${listing.price.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-white border border-slate-200 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  Veloce Escrow & Inspection Guarantee
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Funds remain locked in an insured Veloce Escrow account until independent
                  mechanical verification and clean title transfer are completed.
                </p>
                <div className="pt-2 border-t border-slate-100 flex justify-between text-slate-500">
                  <span>Refundable 72h Reservation Deposit</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    $2,500 USD
                  </span>
                </div>
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
                    Reserve or Purchase via Escrow
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
                  Message Seller / Request Dossier
                </button>

                {canEdit && (
                  <button
                    onClick={() => onOpenEdit(listing)}
                    className="w-full py-2 px-4 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:text-slate-900 hover:bg-white transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Listing Specification
                  </button>
                )}
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Dossier Inspections: {listing.viewsCount.toLocaleString()}</span>
              <span>Enclosed Carrier Eligible</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
