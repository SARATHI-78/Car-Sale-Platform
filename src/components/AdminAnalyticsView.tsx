import React, { useMemo, useState } from 'react';
import { doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  Download,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  Star,
  Eye,
  EyeOff,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import {
  CarListing,
  DirectMessage,
  INDIAN_REGIONS,
  IndianRegionCode,
  OrderStatus,
  OrderTransaction,
  UserProfile,
  UserRole,
  calculateRegionalOnRoadPrice,
  formatINR,
  formatLakhs,
  normalizeToINR,
  sanitizeId,
} from '../types/marketplace';
import { triggerBrowserPushNotification } from '../hooks/useOnlineStatus';

interface AdminAnalyticsViewProps {
  currentUser: UserProfile;
  isAdminUser: boolean;
  selectedRegion: IndianRegionCode;
  listings: CarListing[];
  orders: OrderTransaction[];
  messages: DirectMessage[];
  users: UserProfile[];
  onOpenCreateModal: () => void;
  onOpenEditModal: (listing: CarListing) => void;
  onSyncIndianShowcase: () => void;
}

export const AdminAnalyticsView: React.FC<AdminAnalyticsViewProps> = ({
  currentUser,
  isAdminUser,
  selectedRegion,
  listings,
  orders,
  messages,
  users,
  onOpenCreateModal,
  onOpenEditModal,
  onSyncIndianShowcase,
}) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'inventory' | 'orders' | 'users'>(
    'analytics'
  );
  const [inventorySearch, setInventorySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'reserved' | 'sold'>('all');

  // Compute real-time analytics metrics in INR
  const metrics = useMemo(() => {
    const activeInventoryValue = listings
      .filter((l) => l.status === 'active')
      .reduce((sum, l) => sum + normalizeToINR(l.price), 0);

    const activeOnRoadValue = listings
      .filter((l) => l.status === 'active')
      .reduce(
        (sum, l) => sum + calculateRegionalOnRoadPrice(l, selectedRegion).totalOnRoadPrice,
        0
      );

    const settledGmv = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.amount, 0);

    const totalViews = listings.reduce((sum, l) => sum + (l.viewsCount || 0), 0);
    const reservedOrSoldCount = listings.filter(
      (l) => l.status === 'reserved' || l.status === 'sold'
    ).length;
    const conversionRate =
      listings.length > 0 ? ((reservedOrSoldCount / listings.length) * 100).toFixed(1) : '0.0';

    // Breakdown by Body Style
    const byBodyStyle = ['SUV', 'MPV', 'Sedan', 'Hatchback', 'Coupe'].map((style) => {
      const styleListings = listings.filter((l) => l.bodyStyle === style);
      const totalVal = styleListings.reduce((s, l) => s + normalizeToINR(l.price), 0);
      return {
        style,
        count: styleListings.length,
        valuation: totalVal,
        views: styleListings.reduce((s, l) => s + (l.viewsCount || 0), 0),
      };
    });

    // Breakdown by Powertrain
    const byFuel = ['Diesel', 'Petrol', 'Hybrid', 'Electric', 'CNG'].map((fuel) => {
      const fuelListings = listings.filter(
        (l) => l.fuelType === fuel || (fuel === 'Petrol' && l.fuelType === 'Gasoline')
      );
      return {
        fuel,
        count: fuelListings.length,
        valuation: fuelListings.reduce((s, l) => s + normalizeToINR(l.price), 0),
      };
    });

    return {
      activeInventoryValue,
      activeOnRoadValue,
      settledGmv,
      totalViews,
      conversionRate,
      reservedOrSoldCount,
      byBodyStyle,
      byFuel,
    };
  }, [listings, orders, selectedRegion]);

  const filteredInventory = useMemo(() => {
    return listings.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (inventorySearch.trim()) {
        const q = inventorySearch.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.vin.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.sellerName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [listings, statusFilter, inventorySearch]);

  const handleExportCsv = () => {
    const headers = [
      'ID',
      'Title',
      'RTO_VIN',
      'Year',
      'Make',
      'Model',
      'Ex_Showroom_INR',
      'On_Road_Selected_City_INR',
      'Kilometers',
      'Status',
      'Views',
      'Hub_Location',
    ];
    const rows = listings.map((l) => {
      const onRoad = calculateRegionalOnRoadPrice(l, selectedRegion);
      return [
        l.id,
        `"${l.title.replace(/"/g, '""')}"`,
        l.vin,
        l.year,
        l.make,
        l.model,
        onRoad.exShowroomPrice,
        onRoad.totalOnRoadPrice,
        l.mileage,
        l.status,
        l.viewsCount,
        `"${l.location}"`,
      ];
    });
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `india_cars_onroad_analytics_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleToggleFeatured = async (car: CarListing) => {
    try {
      await updateDoc(doc(db, 'listings', car.id), {
        featured: !car.featured,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `listings/${car.id}`);
    }
  };

  const handleToggleVisibility = async (car: CarListing) => {
    const nextVis = car.visibility === 'public' ? 'private' : 'public';
    try {
      await updateDoc(doc(db, 'listings', car.id), {
        visibility: nextVis,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `listings/${car.id}`);
    }
  };

  const handleReleaseListing = async (car: CarListing) => {
    try {
      await updateDoc(doc(db, 'listings', car.id), {
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `listings/${car.id}`);
    }
  };

  const handleDeleteListing = async (car: CarListing) => {
    try {
      await deleteDoc(doc(db, 'listings', car.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `listings/${car.id}`);
    }
  };

  const handleUpdateOrderStatus = async (order: OrderTransaction, nextStatus: OrderStatus) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }

    const notifId = sanitizeId(`ntf_ord_${Date.now()}_${currentUser.uid.slice(0, 5)}`);
    const title = `Booking #${order.id.slice(-6).toUpperCase()}: ${nextStatus
      .replace('_', ' ')
      .toUpperCase()}`;
    const body = `Escrow & Vahan RC status for ${order.listingTitle} updated to ${nextStatus.replace(
      '_',
      ' '
    )}.`;

    try {
      await setDoc(doc(db, 'notifications', notifId), {
        recipientId: order.buyerId,
        senderId: currentUser.uid,
        type: 'order_update',
        title,
        body,
        relatedId: order.id,
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `notifications/${notifId}`);
    }

    triggerBrowserPushNotification(title, body);
  };

  const handleToggleVerifiedSeller = async (u: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        verifiedSeller: !u.verifiedSeller,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${u.uid}`);
    }
  };

  const handleUpdateUserRole = async (u: UserProfile, nextRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        role: nextRole,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${u.uid}`);
    }
  };

  const activeRegionObj =
    INDIAN_REGIONS.find((r) => r.code === selectedRegion) || INDIAN_REGIONS[0];

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-8 space-y-8">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="text-xs text-slate-500">
            <span>Workspace</span>
            <span className="mx-1.5">/</span>
            <span>Pan-India Hub Operations & Telemetry</span>
            <span className="mx-1.5">·</span>
            <span>Role: {isAdminUser ? 'Platform Administrator' : currentUser.role}</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900 mt-1">
            Indian Hub Sales Performance, Vahan Escrow & Inventory Console
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onSyncIndianShowcase}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-300 bg-amber-50 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors whitespace-nowrap"
            title="Seed or refresh the 5 flagship Indian cars (XUV700, Harrier, Creta, Grand Vitara, Hycross) into Firestore"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Indian Hub Fleet
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export INR CSV Report
          </button>
          <button
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Sell / List Car
          </button>
        </div>
      </div>

      {/* KPI Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200">
          <div className="text-xs text-slate-500">Active Hub Inventory (Ex-Showroom)</div>
          <div className="text-2xl font-mono tabular-nums font-semibold text-slate-900 mt-1.5">
            {formatLakhs(metrics.activeInventoryValue)}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            <span>{formatINR(metrics.activeInventoryValue)}</span>
            <span className="mx-1.5">·</span>
            <span className="text-emerald-700">
              On-Road ({activeRegionObj.city}): {formatLakhs(metrics.activeOnRoadValue)}
            </span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200">
          <div className="text-xs text-slate-500">Escrow & Booking Volume (INR)</div>
          <div className="text-2xl font-mono tabular-nums font-semibold text-slate-900 mt-1.5">
            {formatINR(metrics.settledGmv)}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            <span>{orders.length} total bookings</span>
            <span className="mx-1.5">·</span>
            <span>{formatLakhs(metrics.settledGmv)}</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200">
          <div className="text-xs text-slate-500">Hub Conversion Rate</div>
          <div className="text-2xl font-mono tabular-nums font-semibold text-slate-900 mt-1.5">
            {metrics.conversionRate}%
          </div>
          <div className="text-xs text-slate-500 mt-2">
            <span>{metrics.reservedOrSoldCount} booked or sold</span>
            <span className="mx-1.5">·</span>
            <span>Avg 6.2 days to RC transfer</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200">
          <div className="text-xs text-slate-500">Buyer Inspections & Inquiries</div>
          <div className="text-2xl font-mono tabular-nums font-semibold text-slate-900 mt-1.5">
            {metrics.totalViews.toLocaleString('en-IN')} views
          </div>
          <div className="text-xs text-slate-500 mt-2">
            <span>{messages.length} test drive / hub chats</span>
            <span className="mx-1.5">·</span>
            <span>{users.length} accounts</span>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit overflow-x-auto">
        {(
          [
            { id: 'analytics', label: 'INR Analytics & Regional Tax' },
            { id: 'inventory', label: `Hub Inventory (${listings.length})` },
            { id: 'orders', label: `Bookings & Escrow (${orders.length})` },
            { id: 'users', label: `User Activity & RBAC (${users.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: ANALYTICS & REPORTING */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Valuation by Body Style */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-white border border-slate-200 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Pan-India Hub Valuation & Buyer Demand by Body Segment
                </h2>
                <p className="text-xs text-slate-500">
                  Real-time distribution of Indian inventory value (₹ INR) and buyer views
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {metrics.byBodyStyle.map((row) => {
                const maxVal = Math.max(1, ...metrics.byBodyStyle.map((b) => b.valuation));
                const widthPct = Math.max(4, Math.round((row.valuation / maxVal) * 100));
                return (
                  <div key={row.style} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">
                        {row.style} ({row.count} cars)
                      </span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {formatINR(row.valuation)} ({formatLakhs(row.valuation)}) ·{' '}
                        {row.views.toLocaleString('en-IN')} views
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-slate-900 rounded-full transition-all duration-300"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Powertrain Mix & Engagement Funnel */}
          <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Indian Fuel Mix & Conversion Funnel
              </h2>
              <p className="text-xs text-slate-500">
                Inventory allocation across Diesel, Petrol, Strong Hybrid, and EVs
              </p>
            </div>

            <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
              {metrics.byFuel.map((f) => (
                <div key={f.fuel} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-slate-900">{f.fuel}</div>
                    <div className="text-slate-500">{f.count} vehicles listed</div>
                  </div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatLakhs(f.valuation)}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">
                Buyer Engagement Telemetry
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>140-Point Report Inspections</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {metrics.totalViews.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Home Test Drive / Advisor Chats</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {messages.length}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Token Bookings & On-Road Orders</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {orders.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INVENTORY MANAGEMENT */}
      {activeTab === 'inventory' && (
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <input
              type="text"
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              placeholder="Filter by brand, model, RTO code, hub city, or seller..."
              className="w-full sm:w-80 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-slate-900"
            />
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {(['all', 'active', 'reserved', 'sold'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Vehicle & RTO/VIN</th>
                  <th className="py-3 px-4">Hub / Seller</th>
                  <th className="py-3 px-4 text-right">Ex-Showroom (₹)</th>
                  <th className="py-3 px-4 text-right">
                    On-Road ({activeRegionObj.city})
                  </th>
                  <th className="py-3 px-4 text-right">Driven</th>
                  <th className="py-3 px-4">State</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredInventory.map((car) => {
                  const canManage = isAdminUser || car.sellerId === currentUser.uid;
                  const onRoad = calculateRegionalOnRoadPrice(car, selectedRegion);
                  return (
                    <tr key={car.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{car.title}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {car.vin} · {car.location}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{car.sellerName}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatINR(onRoad.exShowroomPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-800">
                        {formatINR(onRoad.totalOnRoadPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {car.mileage.toLocaleString('en-IN')} km
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium capitalize ${
                            car.status === 'active'
                              ? 'text-emerald-700'
                              : car.status === 'reserved'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {car.status}
                        </span>
                        <span className="mx-1 text-slate-300">·</span>
                        <span className="text-slate-500">{car.visibility}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canManage ? (
                          <div className="inline-flex items-center justify-end gap-1">
                            {isAdminUser && (
                              <button
                                onClick={() => handleToggleFeatured(car)}
                                title={
                                  car.featured ? 'Remove from Featured' : 'Mark as Featured'
                                }
                                className={`p-1.5 rounded border transition-colors ${
                                  car.featured
                                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                                    : 'border-slate-200 text-slate-500 hover:text-slate-900'
                                }`}
                              >
                                <Star className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleVisibility(car)}
                              title="Toggle Public/Private Visibility"
                              className="p-1.5 rounded border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                            >
                              {car.visibility === 'public' ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {car.status !== 'active' && isAdminUser && (
                              <button
                                onClick={() => handleReleaseListing(car)}
                                title="Reactivate Listing"
                                className="p-1.5 rounded border border-slate-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => onOpenEditModal(car)}
                              title="Edit Listing"
                              className="p-1.5 rounded border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {(isAdminUser || car.status !== 'sold') && (
                              <button
                                onClick={() => handleDeleteListing(car)}
                                title="Delete Listing"
                                className="p-1.5 rounded border border-slate-200 text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Read-only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ESCROW ORDERS */}
      {activeTab === 'orders' && (
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          {orders.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-800">No Bookings or Escrow Orders Yet</p>
              <p className="text-xs text-slate-500 mt-1">
                When buyers pay a ₹10,000 token or fund full on-road escrow, live records appear
                here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Order ID & Vehicle</th>
                    <th className="py-3 px-4">Buyer</th>
                    <th className="py-3 px-4">Settlement Mode</th>
                    <th className="py-3 px-4 text-right">Amount (₹ INR)</th>
                    <th className="py-3 px-4">Vahan & Escrow Status</th>
                    <th className="py-3 px-4 text-right">Advance Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {orders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono text-[11px] text-slate-500">
                          #{ord.id.slice(-8).toUpperCase()}
                        </div>
                        <div className="font-semibold text-slate-900">{ord.listingTitle}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">
                          Dest: {ord.shippingAddress}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{ord.buyerName}</td>
                      <td className="py-3 px-4 text-slate-700">
                        {ord.paymentType} (•••• {ord.paymentLast4})
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatINR(ord.amount)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            ord.status === 'completed'
                              ? 'text-emerald-700'
                              : ord.status === 'escrow_funded'
                              ? 'text-amber-700'
                              : ord.status === 'cancelled'
                              ? 'text-red-700'
                              : 'text-slate-700'
                          }`}
                        >
                          {ord.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {ord.status !== 'completed' && ord.status !== 'cancelled' && (
                            <>
                              <button
                                onClick={() => handleUpdateOrderStatus(ord, 'completed')}
                                className="px-2.5 py-1 rounded bg-slate-900 text-white text-[11px] font-medium hover:bg-slate-800 transition-colors"
                              >
                                Complete RC & Deliver
                              </button>
                              <button
                                onClick={() => handleUpdateOrderStatus(ord, 'cancelled')}
                                className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 text-[11px] font-medium hover:bg-slate-100 transition-colors"
                              >
                                Refund / Cancel
                              </button>
                            </>
                          )}
                          {(ord.status === 'completed' || ord.status === 'cancelled') && (
                            <span className="text-[11px] text-slate-400">Finalized</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: USERS & RBAC */}
      {activeTab === 'users' && (
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">User Display Name</th>
                  <th className="py-3 px-4">UID</th>
                  <th className="py-3 px-4">Access Role (RBAC)</th>
                  <th className="py-3 px-4">Seller Verification</th>
                  <th className="py-3 px-4 text-right">Role & Verification Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">{u.displayName}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{u.uid}</td>
                    <td className="py-3 px-4 capitalize text-slate-800">{u.role}</td>
                    <td className="py-3 px-4">
                      {u.verifiedSeller ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Assured Hub Partner
                        </span>
                      ) : (
                        <span className="text-slate-500">Standard Account</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {(['buyer', 'seller'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => handleUpdateUserRole(u, r)}
                            className={`px-2.5 py-1 rounded border text-[11px] font-medium capitalize transition-colors ${
                              u.role === r
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                        {isAdminUser && (
                          <button
                            onClick={() => handleToggleVerifiedSeller(u)}
                            className="px-2.5 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-medium hover:bg-amber-100 transition-colors"
                          >
                            {u.verifiedSeller ? 'Revoke Badge' : 'Verify Hub Seller'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
