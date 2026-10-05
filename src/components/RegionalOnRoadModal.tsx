import React from 'react';
import { X, MapPin, Calculator, Check, ArrowRight } from 'lucide-react';
import {
  CarListing,
  INDIAN_REGIONS,
  IndianRegionCode,
  calculateAllRegionsOnRoad,
  calculateRegionalOnRoadPrice,
  formatINR,
  formatLakhs,
} from '../types/marketplace';

interface RegionalOnRoadModalProps {
  listing: CarListing;
  selectedRegion: IndianRegionCode;
  onSelectRegion: (code: IndianRegionCode) => void;
  onClose: () => void;
  onProceedToBook: (listing: CarListing) => void;
}

export const RegionalOnRoadModal: React.FC<RegionalOnRoadModalProps> = ({
  listing,
  selectedRegion,
  onSelectRegion,
  onClose,
  onProceedToBook,
}) => {
  const activeBreakdown = calculateRegionalOnRoadPrice(listing, selectedRegion);
  const allRegionBreakdowns = calculateAllRegionsOnRoad(listing);

  const lowestOnRoad = Math.min(...allRegionBreakdowns.map((b) => b.totalOnRoadPrice));
  const highestOnRoad = Math.max(...allRegionBreakdowns.map((b) => b.totalOnRoadPrice));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-5xl rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <Calculator className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h2 className="text-base font-semibold">
                All-India Real-Time Regional On-Road Price Engine
              </h2>
              <p className="text-xs text-slate-400">
                Live State RTO Road Tax, Zero-Dep Insurance, 1% TCS, FASTag & Inter-State Hub
                Logistics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close regional pricing modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Vehicle Summary & Active City Selector */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <div className="text-xs text-slate-500">
                <span>{listing.year}</span>
                <span className="mx-1.5">·</span>
                <span>{listing.make}</span>
                <span className="mx-1.5">·</span>
                <span>{listing.fuelType}</span>
                <span className="mx-1.5">·</span>
                <span>Base Hub Location: {listing.location}</span>
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mt-0.5">
                {listing.title}
              </h3>
            </div>

            <div className="flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Your Registration City:
              </span>
              <select
                value={selectedRegion}
                onChange={(e) => onSelectRegion(e.target.value as IndianRegionCode)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
              >
                {INDIAN_REGIONS.map((reg) => (
                  <option key={reg.code} value={reg.code}>
                    {reg.city}, {reg.state} ({reg.rtoPrefix})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2-Column Layout: Detailed Selected City Breakdown + 8-Region Comparison Table */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Itemized On-Road Receipt for Selected Region */}
            <div className="lg:col-span-5 rounded-xl bg-slate-50 border border-slate-200 p-5 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="pb-3 border-b border-slate-200">
                  <div className="text-xs text-slate-500">
                    Selected RTO: {activeBreakdown.region.rtoPrefix} ({activeBreakdown.region.city})
                  </div>
                  <div className="text-base font-semibold text-slate-900 mt-0.5">
                    Itemized On-Road Price Breakdown
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Delivery Hub: {activeBreakdown.region.hubName}
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-700">
                    <span>Base Ex-Showroom / Hub Price</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {formatINR(activeBreakdown.exShowroomPrice)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-700">
                    <span>
                      State RTO Road Tax ({activeBreakdown.region.state} @{' '}
                      {activeBreakdown.roadTaxPctApplied}%)
                    </span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      + {formatINR(activeBreakdown.rtoRoadTax)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-700">
                    <span>1-Yr Comprehensive Zero-Dep Insurance</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      + {formatINR(activeBreakdown.insuranceZeroDep)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-700">
                    <span>Mandatory 1% TCS (Above ₹10 Lakh)</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      + {formatINR(activeBreakdown.tcsCharge)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-700">
                    <span>RC Transfer, Hypothecation & Green Cess</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      + {formatINR(activeBreakdown.rcTransferAndGreenCess)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-700">
                    <span>FASTag & High-Security Number Plate (HSRP)</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      + {formatINR(activeBreakdown.fastagAndHsrp)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-700">
                    <span>
                      {activeBreakdown.isSameStateRto
                        ? 'Local Hub Delivery (Same State RTO)'
                        : 'Inter-State NOC & Enclosed Carrier'}
                    </span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      {activeBreakdown.interStateNocLogistics === 0
                        ? 'FREE'
                        : `+ ${formatINR(activeBreakdown.interStateNocLogistics)}`}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-slate-900">
                      Final On-Road Price ({activeBreakdown.region.city})
                    </span>
                    <span className="text-2xl font-mono tabular-nums font-bold text-slate-900">
                      {formatINR(activeBreakdown.totalOnRoadPrice)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>In Lakhs / Crores: {formatLakhs(activeBreakdown.totalOnRoadPrice)}</span>
                    <span className="font-mono">
                      EMI from {formatINR(activeBreakdown.monthlyEmiEstimate)}/mo
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  onClose();
                  onProceedToBook(listing);
                }}
                className="w-full py-3 px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2"
              >
                Book in {activeBreakdown.region.city} (₹10,000 Refundable Token)
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Right Column: All-India 8-Region Comparison Matrix */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 overflow-hidden flex flex-col justify-between">
              <div>
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">
                      Pan-India Regional On-Road Price Comparison (8 Major RTO Hubs)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Click any city row to switch your active registration region
                    </p>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Max Regional Variance: {formatINR(highestOnRoad - lowestOnRoad)}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold text-slate-500">
                        <th className="py-2.5 px-4">City & RTO Code</th>
                        <th className="py-2.5 px-3 text-right">RTO Tax %</th>
                        <th className="py-2.5 px-3 text-right">Road Tax (₹)</th>
                        <th className="py-2.5 px-3 text-right">Ins. + TCS + RC</th>
                        <th className="py-2.5 px-4 text-right">Total On-Road (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {allRegionBreakdowns.map((row) => {
                        const isSelected = row.region.code === selectedRegion;
                        const isLowest = row.totalOnRoadPrice === lowestOnRoad;
                        const otherCharges =
                          row.insuranceZeroDep +
                          row.tcsCharge +
                          row.fastagAndHsrp +
                          row.rcTransferAndGreenCess +
                          row.interStateNocLogistics;

                        return (
                          <tr
                            key={row.region.code}
                            onClick={() => onSelectRegion(row.region.code)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-amber-50/70 font-medium'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                )}
                                <span className="font-semibold text-slate-900">
                                  {row.region.city}
                                </span>
                                <span className="font-mono text-[11px] text-slate-500">
                                  ({row.region.rtoPrefix})
                                </span>
                                {isLowest && (
                                  <span className="text-[10px] font-semibold text-emerald-700 ml-1">
                                    Lowest Tax
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                              {row.roadTaxPctApplied}%
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                              {formatINR(row.rtoRoadTax)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                              {formatINR(otherCharges)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                              {formatINR(row.totalOnRoadPrice)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                <span>
                  Note: EV powertrains enjoy 0% RTO Road Tax in Delhi NCR, Maharashtra, Karnataka,
                  Tamil Nadu, and Telangana.
                </span>
                <span className="font-mono text-slate-700">100% Vahan RTO Synced</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
