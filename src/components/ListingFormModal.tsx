import React, { useState } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { X, Car, Sparkles } from 'lucide-react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import {
  BodyStyle,
  CarListing,
  DrivetrainType,
  FuelType,
  INDIAN_REGIONS,
  ListingStatus,
  ListingVisibility,
  TransmissionType,
  UserProfile,
  VALIDATION_RULES,
  formatINR,
  formatLakhs,
  normalizeToINR,
  sanitizeId,
} from '../types/marketplace';

interface ListingFormModalProps {
  currentUser: UserProfile;
  existingListing?: CarListing | null;
  onClose: () => void;
  onSaved: () => void;
}

const STUDIO_IMAGE_PRESETS = [
  {
    label: 'Mahindra XUV700 AX7L',
    url: '/src/assets/images/india_hero_mahindra_xuv700_1791184461015.jpg',
  },
  {
    label: 'Tata Harrier Dark AT',
    url: '/src/assets/images/india_car_tata_harrier_ev_1791184474019.jpg',
  },
  {
    label: 'Hyundai Creta Turbo',
    url: '/src/assets/images/india_car_hyundai_creta_1791184485214.jpg',
  },
  {
    label: 'Maruti Grand Vitara Hybrid',
    url: '/src/assets/images/india_car_maruti_grand_vitara_1791184497312.jpg',
  },
  {
    label: 'Toyota Innova Hycross',
    url: '/src/assets/images/india_car_toyota_hycross_1791184509008.jpg',
  },
];

export const ListingFormModal: React.FC<ListingFormModalProps> = ({
  currentUser,
  existingListing,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState(
    existingListing?.title || '2024 Tata Nexon EV Empowered+ Long Range'
  );
  const [make, setMake] = useState(existingListing?.make || 'Tata');
  const [model, setModel] = useState(existingListing?.model || 'Nexon EV Empowered+ LR');
  const [year, setYear] = useState(existingListing?.year || 2024);
  const [price, setPrice] = useState(
    existingListing ? normalizeToINR(existingListing.price) : 1490000
  );
  const [mileage, setMileage] = useState(existingListing?.mileage || 6400);
  const [bodyStyle, setBodyStyle] = useState<BodyStyle>(existingListing?.bodyStyle || 'SUV');
  const [fuelType, setFuelType] = useState<FuelType>(existingListing?.fuelType || 'Electric');
  const [transmission, setTransmission] = useState<TransmissionType>(
    existingListing?.transmission || 'Automatic'
  );
  const [drivetrain, setDrivetrain] = useState<DrivetrainType>(
    existingListing?.drivetrain || 'FWD'
  );
  const [exteriorColor, setExteriorColor] = useState(
    existingListing?.exteriorColor || 'Empowered Oxide'
  );
  const [location, setLocation] = useState(existingListing?.location || 'Bengaluru, Karnataka');
  const [vin, setVin] = useState(existingListing?.vin || 'KA01EV4590');
  const [imageUrl, setImageUrl] = useState(
    existingListing?.imageUrl || STUDIO_IMAGE_PRESETS[0].url
  );
  const [description, setDescription] = useState(
    existingListing?.description ||
      '140-point CARS24/BharatDrive Hub inspected vehicle. Single owner, zero insurance claims, comprehensive zero-depreciation insurance valid, and full authorized service history.'
  );
  const [status, setStatus] = useState<ListingStatus>(existingListing?.status || 'active');
  const [visibility, setVisibility] = useState<ListingVisibility>(
    existingListing?.visibility || 'public'
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Instant CARS24-style Valuation Estimator
  const handleCalculateInstantValuation = () => {
    const baseByBody: Record<string, number> = {
      Hatchback: 750000,
      Sedan: 1350000,
      SUV: 1850000,
      MPV: 2250000,
      Coupe: 3500000,
      Wagon: 1600000,
      Convertible: 4200000,
    };
    const rawBase = baseByBody[bodyStyle] || 1500000;
    const ageYears = Math.max(0, 2025 - year);
    const depreciationFactor = Math.max(0.45, 1 - ageYears * 0.08 - (mileage / 100000) * 0.12);
    const fuelMultiplier =
      fuelType === 'Hybrid' || fuelType === 'Electric'
        ? 1.08
        : fuelType === 'Diesel'
        ? 1.04
        : 1.0;
    const estimatedINR = Math.round((rawBase * depreciationFactor * fuelMultiplier) / 5000) * 5000;
    setPrice(estimatedINR);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanTitle = title.trim().slice(0, VALIDATION_RULES.TITLE_MAX);
    const cleanMake = make.trim().slice(0, VALIDATION_RULES.MAKE_MAX);
    const cleanModel = model.trim().slice(0, VALIDATION_RULES.MODEL_MAX);
    const cleanColor = exteriorColor.trim().slice(0, VALIDATION_RULES.COLOR_MAX);
    const cleanLocation = location.trim().slice(0, VALIDATION_RULES.LOCATION_MAX);
    const cleanVin = vin
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9\-]/g, '');
    const cleanDesc = description.trim().slice(0, VALIDATION_RULES.DESCRIPTION_MAX);

    if (cleanTitle.length < VALIDATION_RULES.TITLE_MIN) {
      setErrorMsg('Headline title must be at least 3 characters.');
      return;
    }
    if (!VALIDATION_RULES.VIN_PATTERN.test(cleanVin)) {
      setErrorMsg(
        'RTO Registration / VIN must be 6 to 20 uppercase alphanumeric characters (e.g., KA01MJ8890).'
      );
      return;
    }
    if (price < VALIDATION_RULES.PRICE_MIN || price > VALIDATION_RULES.PRICE_MAX) {
      setErrorMsg('Ex-Showroom / Hub price must be between ₹1,000 and ₹20,00,00,000.');
      return;
    }
    if (cleanDesc.length < VALIDATION_RULES.DESCRIPTION_MIN) {
      setErrorMsg('Inspection description must be at least 10 characters.');
      return;
    }

    setSaving(true);

    if (existingListing) {
      try {
        await updateDoc(doc(db, 'listings', existingListing.id), {
          title: cleanTitle,
          price: Number(price),
          mileage: Math.round(Number(mileage)),
          location: cleanLocation,
          description: cleanDesc,
          imageUrl: imageUrl.trim().slice(0, 500),
          status,
          visibility,
          updatedAt: serverTimestamp(),
        });
        setSaving(false);
        onSaved();
        onClose();
      } catch (error) {
        setSaving(false);
        handleFirestoreError(error, OperationType.UPDATE, `listings/${existingListing.id}`);
      }
    } else {
      const listingId = sanitizeId(`car_${Date.now()}_${currentUser.uid.slice(0, 6)}`);
      try {
        await setDoc(doc(db, 'listings', listingId), {
          title: cleanTitle,
          make: cleanMake,
          model: cleanModel,
          year: Math.round(Number(year)),
          price: Number(price),
          mileage: Math.round(Number(mileage)),
          bodyStyle,
          fuelType,
          transmission,
          drivetrain,
          exteriorColor: cleanColor,
          location: cleanLocation,
          vin: cleanVin,
          imageUrl: imageUrl.trim().slice(0, 500),
          description: cleanDesc,
          sellerId: currentUser.uid,
          sellerName: currentUser.displayName.slice(0, 80),
          status: 'active',
          visibility,
          featured: false,
          viewsCount: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSaving(false);
        onSaved();
        onClose();
      } catch (error) {
        setSaving(false);
        handleFirestoreError(error, OperationType.CREATE, `listings/${listingId}`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <Car className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-semibold">
                {existingListing
                  ? 'Edit Indian Car Listing & Hub Price'
                  : 'Sell Your Car in India — Instant Valuation & Hub Listing'}
              </h2>
              <p className="text-xs text-slate-400">
                Real-time regional RTO on-road price calculation across 8 Indian states
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Car Title (Year, Make, Model & Variant)
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">
                  Ex-Hub Price (₹ INR)
                </label>
                <button
                  type="button"
                  onClick={handleCalculateInstantValuation}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                  title="Auto-calculate fair Indian market price"
                >
                  <Sparkles className="w-3 h-3" /> Auto-Value
                </button>
              </div>
              <input
                type="number"
                required
                min={1000}
                max={200000000}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
              />
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                {formatINR(price)} ({formatLakhs(price)})
              </div>
            </div>
          </div>

          {!existingListing && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Brand</label>
                <input
                  type="text"
                  required
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="Mahindra, Tata..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Model & Variant
                </label>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reg. Year</label>
                <input
                  type="number"
                  required
                  min={1990}
                  max={2027}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  RTO Reg. / VIN
                </label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="KA01MJ8890"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono uppercase text-slate-900"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Driven (Kilometers)
              </label>
              <input
                type="number"
                required
                min={0}
                max={500000}
                value={mileage}
                onChange={(e) => setMileage(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Indian Hub City
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
              >
                {INDIAN_REGIONS.map((r) => (
                  <option key={r.code} value={`${r.city}, ${r.state}`}>
                    {r.city}, {r.state}
                  </option>
                ))}
              </select>
            </div>
            {!existingListing ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Body Type
                  </label>
                  <select
                    value={bodyStyle}
                    onChange={(e) => setBodyStyle(e.target.value as BodyStyle)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                  >
                    {(['SUV', 'Hatchback', 'Sedan', 'MPV', 'Coupe'] as const).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Fuel Type
                  </label>
                  <select
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value as FuelType)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                  >
                    {(['Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG'] as const).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ListingStatus)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                  >
                    {(['active', 'reserved', 'archived'] as const).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Visibility
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as ListingVisibility)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                  >
                    <option value="public">Public Marketplace</option>
                    <option value="private">Private Hub Vault</option>
                  </select>
                </div>
              </>
            )}
          </div>

          {!existingListing && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Transmission
                </label>
                <select
                  value={transmission}
                  onChange={(e) => setTransmission(e.target.value as TransmissionType)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                >
                  {(['Automatic', 'Manual', 'DCT', 'CVT', 'AMT'] as const).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Drivetrain</label>
                <select
                  value={drivetrain}
                  onChange={(e) => setDrivetrain(e.target.value as DrivetrainType)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                >
                  {(['FWD', 'AWD', '4WD', 'RWD'] as const).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Exterior Paint
                </label>
                <input
                  type="text"
                  required
                  value={exteriorColor}
                  onChange={(e) => setExteriorColor(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>
          )}

          {/* Studio Photo Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Indian Hub Photography Preset or Custom Image URL
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {STUDIO_IMAGE_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.url}
                  onClick={() => setImageUrl(preset.url)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    imageUrl === preset.url
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              required
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              140-Point Inspection Notes, Insurance Status & Service Record
            </label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {saving
                ? 'Publishing...'
                : existingListing
                ? 'Save Listing Changes'
                : 'List Car on Marketplace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
