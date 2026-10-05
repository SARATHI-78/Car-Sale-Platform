import React, { useState } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { X, Car } from 'lucide-react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import {
  BodyStyle,
  CarListing,
  DrivetrainType,
  FuelType,
  ListingStatus,
  ListingVisibility,
  TransmissionType,
  UserProfile,
  VALIDATION_RULES,
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
    label: 'Porsche 911 GT3 Studio',
    url: '/src/assets/images/hero_porsche_gt3_studio_1791181142895.jpg',
  },
  {
    label: 'Taycan Cross Turismo',
    url: '/src/assets/images/car_taycan_cross_turismo_1791181159900.jpg',
  },
  {
    label: 'Defender 110 V8',
    url: '/src/assets/images/car_defender_110_v8_1791181171359.jpg',
  },
  {
    label: 'Mercedes-AMG GT Coupe',
    url: '/src/assets/images/car_amg_gt_coupe_1791181182873.jpg',
  },
  {
    label: 'Lucid Air Sapphire',
    url: '/src/assets/images/car_lucid_air_sapphire_1791181195504.jpg',
  },
];

export const ListingFormModal: React.FC<ListingFormModalProps> = ({
  currentUser,
  existingListing,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState(existingListing?.title || '2024 Porsche 911 Carrera GTS');
  const [make, setMake] = useState(existingListing?.make || 'Porsche');
  const [model, setModel] = useState(existingListing?.model || '911 Carrera GTS');
  const [year, setYear] = useState(existingListing?.year || 2024);
  const [price, setPrice] = useState(existingListing?.price || 172500);
  const [mileage, setMileage] = useState(existingListing?.mileage || 1850);
  const [bodyStyle, setBodyStyle] = useState<BodyStyle>(existingListing?.bodyStyle || 'Coupe');
  const [fuelType, setFuelType] = useState<FuelType>(existingListing?.fuelType || 'Gasoline');
  const [transmission, setTransmission] = useState<TransmissionType>(
    existingListing?.transmission || 'Dual-Clutch'
  );
  const [drivetrain, setDrivetrain] = useState<DrivetrainType>(
    existingListing?.drivetrain || 'RWD'
  );
  const [exteriorColor, setExteriorColor] = useState(
    existingListing?.exteriorColor || 'Arctic Grey'
  );
  const [location, setLocation] = useState(existingListing?.location || 'Newport Beach, CA');
  const [vin, setVin] = useState(existingListing?.vin || 'WP0AB2A95RS229104');
  const [imageUrl, setImageUrl] = useState(
    existingListing?.imageUrl || STUDIO_IMAGE_PRESETS[0].url
  );
  const [description, setDescription] = useState(
    existingListing?.description ||
      'Single-owner collector specification with full service documentation, factory warranty coverage, and paint protection film applied from new.'
  );
  const [status, setStatus] = useState<ListingStatus>(existingListing?.status || 'active');
  const [visibility, setVisibility] = useState<ListingVisibility>(
    existingListing?.visibility || 'public'
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanTitle = title.trim().slice(0, VALIDATION_RULES.TITLE_MAX);
    const cleanMake = make.trim().slice(0, VALIDATION_RULES.MAKE_MAX);
    const cleanModel = model.trim().slice(0, VALIDATION_RULES.MODEL_MAX);
    const cleanColor = exteriorColor.trim().slice(0, VALIDATION_RULES.COLOR_MAX);
    const cleanLocation = location.trim().slice(0, VALIDATION_RULES.LOCATION_MAX);
    const cleanVin = vin.trim().toUpperCase();
    const cleanDesc = description.trim().slice(0, VALIDATION_RULES.DESCRIPTION_MAX);

    if (cleanTitle.length < VALIDATION_RULES.TITLE_MIN) {
      setErrorMsg('Headline title must be at least 3 characters.');
      return;
    }
    if (!VALIDATION_RULES.VIN_PATTERN.test(cleanVin)) {
      setErrorMsg(
        'VIN must be 11 to 17 uppercase alphanumeric characters (excluding I, O, Q).'
      );
      return;
    }
    if (price < VALIDATION_RULES.PRICE_MIN || price > VALIDATION_RULES.PRICE_MAX) {
      setErrorMsg('Price must be between $1,000 and $10,000,000.');
      return;
    }
    if (cleanDesc.length < VALIDATION_RULES.DESCRIPTION_MIN) {
      setErrorMsg('Description must be at least 10 characters.');
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
            <h2 className="text-base font-semibold">
              {existingListing ? 'Edit Consignment Listing' : 'Consign Vehicle on Veloce Reserve'}
            </h2>
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
                Listing Headline Title
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
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Asking Price (USD)
              </label>
              <input
                type="number"
                required
                min={1000}
                max={10000000}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
              />
            </div>
          </div>

          {!existingListing && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Make</label>
                <input
                  type="text"
                  required
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Model</label>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Year</label>
                <input
                  type="number"
                  required
                  min={1950}
                  max={2027}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">VIN</label>
                <input
                  type="text"
                  required
                  maxLength={17}
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono uppercase text-slate-900"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Odometer (Miles)
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            {!existingListing ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Body Style
                  </label>
                  <select
                    value={bodyStyle}
                    onChange={(e) => setBodyStyle(e.target.value as BodyStyle)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                  >
                    {(['Coupe', 'Sedan', 'SUV', 'Wagon', 'Convertible'] as const).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Powertrain
                  </label>
                  <select
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value as FuelType)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                  >
                    {(['Gasoline', 'Electric', 'Hybrid'] as const).map((f) => (
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
                    <option value="private">Private Vault</option>
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
                  {(['Dual-Clutch', 'Manual', 'Automatic'] as const).map((t) => (
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
                  {(['RWD', 'AWD', 'FWD'] as const).map((d) => (
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
              Studio Catalog Photography Preset or Custom URL
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
              Provenance, Build Sheet & Service History
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
                : 'Publish Live Listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
