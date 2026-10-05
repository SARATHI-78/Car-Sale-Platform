import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Search,
  Bell,
  WifiOff,
  RefreshCw,
  LogOut,
  Shield,
  Plus,
  SlidersHorizontal,
  ArrowUpRight,
  Check,
  MapPin,
  Calculator,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import {
  BodyStyle,
  CarListing,
  DirectMessage,
  FuelType,
  INDIAN_REGIONS,
  IndianRegionCode,
  INITIAL_SHOWCASE_LISTINGS,
  OrderTransaction,
  UserNotification,
  UserProfile,
  UserRole,
  calculateAllRegionsOnRoad,
  calculateRegionalOnRoadPrice,
  formatINR,
  formatLakhs,
  normalizeToINR,
} from './types/marketplace';
import {
  requestPushPermission,
  triggerBrowserPushNotification,
  useOnlineStatus,
} from './hooks/useOnlineStatus';
import { PWAInstallButton } from './components/PWAInstallButton';
import { VehicleImage } from './components/VehicleImage';
import { CheckoutModal } from './components/CheckoutModal';
import { ListingFormModal } from './components/ListingFormModal';
import { MessagingDrawer } from './components/MessagingDrawer';
import { AdminAnalyticsView } from './components/AdminAnalyticsView';
import { VehicleDetailModal } from './components/VehicleDetailModal';
import { RegionalOnRoadModal } from './components/RegionalOnRoadModal';

const BOOTSTRAPPED_ADMIN_EMAIL = 'sundarasarathi78@gmail.com';

export default function App() {
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Active Indian City / RTO Region for Real-Time On-Road Pricing
  const [selectedRegion, setSelectedRegion] = useState<IndianRegionCode>('DL');

  // Navigation view state
  const [activeView, setActiveView] = useState<'marketplace' | 'admin_analytics'>('marketplace');

  // Firestore real-time collections
  const [firestoreListings, setFirestoreListings] = useState<CarListing[]>([]);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [orders, setOrders] = useState<OrderTransaction[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBodyStyle, setSelectedBodyStyle] = useState<'All' | BodyStyle>('All');
  const [selectedFuel, setSelectedFuel] = useState<'All' | FuelType>('All');
  const [maxPriceINR, setMaxPriceINR] = useState<number>(4500000); // ₹45 Lakh default slider max
  const [sortBy, setSortBy] = useState<
    'featured' | 'price_asc' | 'price_desc' | 'mileage_asc' | 'year_desc'
  >('featured');

  // Modals & Drawers
  const [detailListing, setDetailListing] = useState<CarListing | null>(null);
  const [regionalModalListing, setRegionalModalListing] = useState<CarListing | null>(null);
  const [checkoutListing, setCheckoutListing] = useState<CarListing | null>(null);
  const [showListingForm, setShowListingForm] = useState(false);
  const [editingListing, setEditingListing] = useState<CarListing | null>(null);
  const [showMessaging, setShowMessaging] = useState(false);
  const [messagingInitialListing, setMessagingInitialListing] = useState<CarListing | null>(null);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [showOfflineSyncModal, setShowOfflineSyncModal] = useState(false);
  const [pushStatus, setPushStatus] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default'
  );
  const [toastBanner, setToastBanner] = useState<{ title: string; subtitle: string } | null>(null);

  const { isOnline, simulatedOffline, toggleSimulatedOffline, lastSyncedAt, markSynced } =
    useOnlineStatus();

  const isAdminUser = Boolean(
    fbUser &&
      ((fbUser.email === BOOTSTRAPPED_ADMIN_EMAIL && fbUser.emailVerified) ||
        userProfile?.role === 'admin')
  );

  const activeRegionConfig = useMemo(
    () => INDIAN_REGIONS.find((r) => r.code === selectedRegion) || INDIAN_REGIONS[0],
    [selectedRegion]
  );

  const showToast = (title: string, subtitle: string) => {
    setToastBanner({ title, subtitle });
    setTimeout(() => {
      setToastBanner((prev) => (prev?.title === title ? null : prev));
    }, 4500);
  };

  // Seed or refresh the 5 flagship Indian cars in Firestore
  const seedIndianShowcaseToFirestore = async (uid: string, sellerDisplayName: string) => {
    for (let i = 0; i < INITIAL_SHOWCASE_LISTINGS.length; i++) {
      const item = INITIAL_SHOWCASE_LISTINGS[i];
      const seedId = `india_lot_${i + 1}`;
      try {
        await setDoc(doc(db, 'listings', seedId), {
          ...item,
          sellerId: uid,
          sellerName: sellerDisplayName || 'CARS24 / Veloce Assured Hub',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `listings/${seedId}`);
      }
    }
  };

  // 1. Auth Listener & Profile Bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      setAuthReady(true);

      if (!user) {
        setUserProfile(null);
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(userDocRef);
        const isBootstrappedAdmin =
          user.email === BOOTSTRAPPED_ADMIN_EMAIL && user.emailVerified;

        if (!snap.exists()) {
          const initialRole: UserRole = isBootstrappedAdmin ? 'admin' : 'seller';
          const newProfile = {
            uid: user.uid,
            displayName: (user.displayName || user.email?.split('@')[0] || 'Veloce Member').slice(
              0,
              80
            ),
            role: initialRole,
            verifiedSeller: isBootstrappedAdmin ? true : false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userDocRef, newProfile);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    });
    return () => unsub();
  }, []);

  // 2. Listen to Current User Profile
  useEffect(() => {
    if (!authReady || !fbUser) return;

    const userRef = doc(db, 'users', fbUser.uid);
    const unsubProfile = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${fbUser.uid}`);
      }
    );

    return () => unsubProfile();
  }, [authReady, fbUser]);

  // 3. Real-time Public Listings Listener & Auto-Seed of Indian Cars
  useEffect(() => {
    const q = query(collection(db, 'listings'), where('visibility', '==', 'public'));
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const items: CarListing[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<CarListing, 'id'>),
          id: d.id,
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        setFirestoreListings(items);
        setListingsLoaded(true);
        if (!snap.metadata.hasPendingWrites) {
          markSynced();
        }

        // Automatically seed the 5 Indian cars if not yet present in Firestore when user is signed in
        const hasIndianSeed = snap.docs.some((d) => d.id.startsWith('india_lot_'));
        if (!hasIndianSeed && fbUser && userProfile) {
          await seedIndianShowcaseToFirestore(
            fbUser.uid,
            userProfile.displayName || 'CARS24 / Veloce Assured Hub'
          );
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'listings');
      }
    );

    return () => unsub();
  }, [fbUser, userProfile]);

  // 4. Real-time Orders, Messages, Notifications, and Users Listeners
  useEffect(() => {
    if (!authReady || !fbUser) {
      setOrders([]);
      setMessages([]);
      setNotifications([]);
      setAllUsers([]);
      return;
    }

    const ordersQuery = isAdminUser
      ? collection(db, 'orders')
      : query(collection(db, 'orders'), where('buyerId', '==', fbUser.uid));

    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        const list: OrderTransaction[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<OrderTransaction, 'id'>),
          id: d.id,
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        setOrders(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }
    );

    const sentQuery = query(collection(db, 'messages'), where('senderId', '==', fbUser.uid));
    const recQuery = query(collection(db, 'messages'), where('recipientId', '==', fbUser.uid));

    let sentDocs: DirectMessage[] = [];
    let recDocs: DirectMessage[] = [];

    const mergeMessages = () => {
      const map = new Map<string, DirectMessage>();
      for (const m of [...sentDocs, ...recDocs]) {
        map.set(m.id, m);
      }
      const merged = Array.from(map.values()).sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return ta - tb;
      });
      setMessages(merged);
    };

    const unsubSent = onSnapshot(
      sentQuery,
      (snap) => {
        sentDocs = snap.docs.map((d) => ({
          ...(d.data() as Omit<DirectMessage, 'id'>),
          id: d.id,
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        mergeMessages();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'messages');
      }
    );

    const unsubRec = onSnapshot(
      recQuery,
      (snap) => {
        recDocs = snap.docs.map((d) => ({
          ...(d.data() as Omit<DirectMessage, 'id'>),
          id: d.id,
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        mergeMessages();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'messages');
      }
    );

    const notifQuery = query(
      collection(db, 'notifications'),
      where('recipientId', '==', fbUser.uid)
    );
    const unsubNotif = onSnapshot(
      notifQuery,
      (snap) => {
        const list: UserNotification[] = snap.docs
          .map((d) => ({
            ...(d.data() as Omit<UserNotification, 'id'>),
            id: d.id,
            hasPendingWrites: d.metadata.hasPendingWrites,
          }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setNotifications(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'notifications');
      }
    );

    const usersQuery = isAdminUser
      ? collection(db, 'users')
      : query(collection(db, 'users'), where('uid', '==', fbUser.uid));

    const unsubUsers = onSnapshot(
      usersQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserProfile);
        setAllUsers(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    );

    return () => {
      unsubOrders();
      unsubSent();
      unsubRec();
      unsubNotif();
      unsubUsers();
    };
  }, [authReady, fbUser, isAdminUser]);

  // Combine Indian Showcase with live Firestore listings, prioritizing Indian hub vehicles
  const activeListings: CarListing[] = useMemo(() => {
    const fallbackIndian: CarListing[] = INITIAL_SHOWCASE_LISTINGS.map((item, idx) => ({
      ...item,
      id: `india_lot_${idx + 1}`,
      sellerId: 'veloce_concierge_specialist',
      sellerName: 'CARS24 / Veloce Assured Hub',
      createdAt: { toMillis: () => Date.now() } as CarListing['createdAt'],
      updatedAt: { toMillis: () => Date.now() } as CarListing['updatedAt'],
    }));

    if (firestoreListings.length === 0) {
      return fallbackIndian;
    }

    // Ensure Indian showcase cars are always visible even if DB previously only had legacy lots
    const map = new Map<string, CarListing>();
    for (const item of fallbackIndian) {
      map.set(item.id, item);
    }
    for (const dbItem of firestoreListings) {
      // Skip legacy USD demo lots (`veloce_lot_1..5`) so the marketplace is 100% real-world Indian cars,
      // while keeping all `india_lot_*` and user-created `car_*` listings from Firestore!
      if (dbItem.id.startsWith('veloce_lot_')) continue;
      map.set(dbItem.id, dbItem);
    }
    return Array.from(map.values());
  }, [firestoreListings]);

  // Filtered and sorted listings (by On-Road Price or Ex-Showroom)
  const filteredListings = useMemo(() => {
    return activeListings
      .filter((car) => {
        if (selectedBodyStyle !== 'All' && car.bodyStyle !== selectedBodyStyle) return false;
        if (selectedFuel !== 'All' && car.fuelType !== selectedFuel) return false;
        const onRoad = calculateRegionalOnRoadPrice(car, selectedRegion);
        if (onRoad.exShowroomPrice > maxPriceINR) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            car.title.toLowerCase().includes(q) ||
            car.make.toLowerCase().includes(q) ||
            car.model.toLowerCase().includes(q) ||
            car.location.toLowerCase().includes(q) ||
            car.exteriorColor.toLowerCase().includes(q) ||
            car.vin.toLowerCase().includes(q) ||
            String(car.year).includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const priceA = normalizeToINR(a.price);
        const priceB = normalizeToINR(b.price);
        if (sortBy === 'price_asc') return priceA - priceB;
        if (sortBy === 'price_desc') return priceB - priceA;
        if (sortBy === 'mileage_asc') return a.mileage - b.mileage;
        if (sortBy === 'year_desc') return b.year - a.year;
        return Number(b.featured) - Number(a.featured);
      });
  }, [
    activeListings,
    selectedBodyStyle,
    selectedFuel,
    maxPriceINR,
    searchQuery,
    sortBy,
    selectedRegion,
  ]);

  const heroListing = useMemo(() => {
    return (
      activeListings.find((c) => c.id === 'india_lot_1') ||
      activeListings.find((c) => c.featured) ||
      activeListings[0]
    );
  }, [activeListings]);

  const heroOnRoad = useMemo(
    () => (heroListing ? calculateRegionalOnRoadPrice(heroListing, selectedRegion) : null),
    [heroListing, selectedRegion]
  );

  const pendingSyncCount = useMemo(() => {
    const lCount = firestoreListings.filter((i) => i.hasPendingWrites).length;
    const oCount = orders.filter((i) => i.hasPendingWrites).length;
    const mCount = messages.filter((i) => i.hasPendingWrites).length;
    return lCount + oCount + mCount;
  }, [firestoreListings, orders, messages]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const unreadMessagesCount = useMemo(
    () =>
      messages.filter((m) => fbUser && m.recipientId === fbUser.uid && !m.read).length,
    [messages, fbUser]
  );

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast(
        'Signed in to Veloce India',
        'Real-time RTO on-road booking, hub messaging, and offline sync enabled.'
      );
    } catch (error) {
      console.error('Authentication error:', error);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveView('marketplace');
    showToast('Signed Out', 'Session closed safely.');
  };

  const handleInspectListing = async (car: CarListing) => {
    setDetailListing(car);
    if (fbUser && firestoreListings.some((f) => f.id === car.id)) {
      try {
        await updateDoc(doc(db, 'listings', car.id), {
          viewsCount: (car.viewsCount || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore view increment error if offline
      }
    }
  };

  const handleMarkNotificationRead = async (n: UserNotification) => {
    if (n.read) return;
    try {
      await updateDoc(doc(db, 'notifications', n.id), {
        read: true,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${n.id}`);
    }
  };

  const handleEnablePushNotifications = async () => {
    const perm = await requestPushPermission();
    setPushStatus(perm);
    if (perm === 'granted') {
      triggerBrowserPushNotification(
        'Veloce India Real-Time Alerts Active',
        'You will receive instant alerts for Vahan RC updates, token bookings, and test drive chats.'
      );
      showToast('Push Notifications Enabled', 'Real-time order and message alerts are active.');
    } else {
      showToast(
        'In-App Real-Time Feed Active',
        'Browser push permission is blocked by your browser; live in-app alerts remain active.'
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F9F8] text-slate-900">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-8 py-4 bg-[#F9F9F8]/95 backdrop-blur-xs border-b border-slate-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#showroom"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('marketplace');
          }}
          className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Veloce India
        </a>

        {/* Zone 2: 5 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveView('marketplace')}
            className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
              activeView === 'marketplace' ? 'text-slate-900 underline' : ''
            }`}
          >
            Buy Assured Cars
          </button>
          <button
            onClick={() => {
              if (heroListing) setRegionalModalListing(heroListing);
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Regional On-Road Price
          </button>
          <button
            onClick={() => {
              if (!userProfile) {
                handleSignIn();
              } else {
                setEditingListing(null);
                setShowListingForm(true);
              }
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Sell Your Car
          </button>
          <button
            onClick={() => {
              if (!userProfile) {
                handleSignIn();
              } else {
                setMessagingInitialListing(null);
                setShowMessaging(true);
              }
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Hub Chat{unreadMessagesCount > 0 ? ` (${unreadMessagesCount})` : ''}
          </button>
          <button
            onClick={() => {
              if (!userProfile) {
                handleSignIn();
              } else {
                setActiveView('admin_analytics');
              }
            }}
            className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
              activeView === 'admin_analytics' ? 'text-slate-900 underline' : ''
            }`}
          >
            Analytics & Admin
          </button>
        </nav>

        {/* Zone 3: 1-2 Primary Actions */}
        <div className="flex items-center gap-2.5">
          <PWAInstallButton />

          {userProfile ? (
            <>
              <button
                onClick={() => setShowNotificationsDrawer(true)}
                className="relative rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                aria-label="Open notifications"
              >
                <Bell className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Alerts</span>
                {unreadNotificationsCount > 0 && (
                  <span className="font-mono font-semibold text-amber-700">
                    ({unreadNotificationsCount})
                  </span>
                )}
              </button>

              <button
                onClick={handleSignOut}
                className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                title={`Signed in as ${userProfile.displayName} (${
                  isAdminUser ? 'Admin' : userProfile.role
                })`}
              >
                <span className="truncate max-w-[110px]">{userProfile.displayName}</span>
                <LogOut className="w-3.5 h-3.5 text-slate-300" />
              </button>
            </>
          ) : (
            <button
              onClick={handleSignIn}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Sign In with Google
            </button>
          )}
        </div>
      </header>

      {/* Mobile Secondary Navigation Bar */}
      <div className="flex md:hidden items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 text-xs font-medium text-slate-700 overflow-x-auto gap-4">
        <button
          onClick={() => setActiveView('marketplace')}
          className={`whitespace-nowrap ${
            activeView === 'marketplace' ? 'text-slate-900 font-semibold' : ''
          }`}
        >
          Buy Cars
        </button>
        <button
          onClick={() => {
            if (heroListing) setRegionalModalListing(heroListing);
          }}
          className="whitespace-nowrap"
        >
          On-Road Matrix
        </button>
        <button
          onClick={() => {
            if (!userProfile) handleSignIn();
            else {
              setEditingListing(null);
              setShowListingForm(true);
            }
          }}
          className="whitespace-nowrap"
        >
          Sell Car
        </button>
        <button
          onClick={() => {
            if (!userProfile) handleSignIn();
            else setShowMessaging(true);
          }}
          className="whitespace-nowrap"
        >
          Chat{unreadMessagesCount > 0 ? ` (${unreadMessagesCount})` : ''}
        </button>
        <button
          onClick={() => {
            if (!userProfile) handleSignIn();
            else setActiveView('admin_analytics');
          }}
          className={`whitespace-nowrap ${
            activeView === 'admin_analytics' ? 'text-slate-900 font-semibold' : ''
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Toast Notification Banner */}
      {toastBanner && (
        <div className="fixed top-20 right-4 z-50 max-w-sm rounded-xl bg-slate-900 text-white px-4 py-3 shadow-xl border border-slate-700">
          <div className="text-xs font-semibold">{toastBanner.title}</div>
          <div className="text-[11px] text-slate-300 mt-0.5">{toastBanner.subtitle}</div>
        </div>
      )}

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1">
        {activeView === 'admin_analytics' && userProfile ? (
          <AdminAnalyticsView
            currentUser={userProfile}
            isAdminUser={isAdminUser}
            selectedRegion={selectedRegion}
            listings={activeListings}
            orders={orders}
            messages={messages}
            users={allUsers.length > 0 ? allUsers : [userProfile]}
            onOpenCreateModal={() => {
              setEditingListing(null);
              setShowListingForm(true);
            }}
            onOpenEditModal={(car) => {
              setEditingListing(car);
              setShowListingForm(true);
            }}
            onSyncIndianShowcase={async () => {
              await seedIndianShowcaseToFirestore(
                userProfile.uid,
                userProfile.displayName || 'CARS24 / Veloce Assured Hub'
              );
              showToast(
                'Indian Hub Fleet Synchronized',
                '5 flagship Indian cars with INR pricing synced to Firestore.'
              );
            }}
          />
        ) : (
          <div className="space-y-14 pb-20">
            {/* SECTION 1: STOREFRONT HERO SHOWCASE WITH LIVE REGIONAL ON-ROAD PRICE */}
            {heroListing && heroOnRoad && (
              <section className="max-w-[1360px] mx-auto px-4 sm:px-8 pt-6 sm:pt-8">
                {/* Active Indian City / RTO Selector Bar */}
                <div className="mb-4 p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Showing Real-Time On-Road Prices for:{' '}
                      <strong className="text-slate-900">
                        {activeRegionConfig.city}, {activeRegionConfig.state} (
                        {activeRegionConfig.rtoPrefix})
                      </strong>{' '}
                      · Hub: {activeRegionConfig.hubName}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {INDIAN_REGIONS.map((reg) => (
                      <button
                        key={reg.code}
                        onClick={() => setSelectedRegion(reg.code)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                          selectedRegion === reg.code
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {reg.city}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-lg">
                  <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
                    {/* Hero Image with Measured Scrim */}
                    <div className="lg:col-span-7 relative min-h-[320px] sm:min-h-[460px]">
                      <VehicleImage
                        src={heroListing.imageUrl}
                        alt={heroListing.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-slate-950/20 lg:to-slate-950" />
                    </div>

                    {/* Hero Editorial & Live Regional On-Road Column */}
                    <div className="lg:col-span-5 p-6 sm:p-10 flex flex-col justify-between text-white bg-slate-950">
                      <div className="space-y-4">
                        <div className="text-xs text-amber-400 tracking-wide">
                          <span>140-Point Assured Flagship</span>
                          <span className="mx-1.5">·</span>
                          <span>{heroListing.location}</span>
                          <span className="mx-1.5">·</span>
                          <span className="font-mono">{heroListing.vin}</span>
                        </div>

                        <h1
                          className="text-2xl sm:text-4xl font-display font-bold tracking-tight text-white leading-tight"
                          style={{ textWrap: 'balance' }}
                        >
                          {heroListing.title}
                        </h1>

                        <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">
                          {heroListing.description}
                        </p>

                        <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span>{heroListing.mileage.toLocaleString('en-IN')} km</span>
                          <span>·</span>
                          <span>{heroListing.fuelType}</span>
                          <span>·</span>
                          <span>{heroListing.transmission}</span>
                          <span>·</span>
                          <span>{heroListing.drivetrain}</span>
                        </div>
                      </div>

                      <div className="pt-6 mt-6 border-t border-slate-800 space-y-4">
                        <div className="flex items-baseline justify-between">
                          <div>
                            <div className="text-xs text-amber-400 font-medium">
                              On-Road Price in {heroOnRoad.region.city} ({heroOnRoad.region.rtoPrefix})
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Ex-Showroom: {formatINR(heroOnRoad.exShowroomPrice)} + RTO Tax (
                              {heroOnRoad.roadTaxPctApplied}%): {formatINR(heroOnRoad.rtoRoadTax)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl sm:text-3xl font-mono tabular-nums font-bold text-white">
                              {formatINR(heroOnRoad.totalOnRoadPrice)}
                            </div>
                            <div className="text-xs font-mono text-slate-400">
                              {formatLakhs(heroOnRoad.totalOnRoadPrice)} · EMI{' '}
                              {formatINR(heroOnRoad.monthlyEmiEstimate)}/mo
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            onClick={() => handleInspectListing(heroListing)}
                            className="flex-1 py-3 px-4 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5"
                          >
                            Book Test Drive / Buy On-Road
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setRegionalModalListing(heroListing)}
                            className="py-3 px-3.5 rounded-lg border border-slate-700 text-white text-xs font-medium hover:bg-slate-900 transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
                          >
                            <Calculator className="w-3.5 h-3.5 text-amber-400" />
                            Compare 8 Cities
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* SECTION 2: FILTERABLE REAL-TIME INDIAN CAR CATALOG */}
            <section id="showroom" className="max-w-[1360px] mx-auto px-4 sm:px-8 space-y-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-2xl font-display font-bold text-slate-900">
                    140-Point Inspected Cars with Real-Time {activeRegionConfig.city} On-Road
                    Pricing
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Includes State RTO Road Tax ({activeRegionConfig.rtoPrefix}), Zero-Dep
                    Insurance, 1% TCS, FASTag, and 7-Day Easy Return
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span>
                    Showing <strong className="font-mono">{filteredListings.length}</strong> of{' '}
                    <strong className="font-mono">{activeListings.length}</strong> assured cars
                  </span>
                  <span>·</span>
                  <button
                    onClick={() => {
                      if (!userProfile) handleSignIn();
                      else {
                        setEditingListing(null);
                        setShowListingForm(true);
                      }
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:underline underline-offset-4"
                  >
                    <Plus className="w-3.5 h-3.5" /> Sell Your Car
                  </button>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* Search Input */}
                  <div className="md:col-span-5 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search Mahindra, Tata, Hyundai, Maruti, Toyota, city, or RTO code..."
                      className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-slate-900"
                    />
                  </div>

                  {/* Body Style Segmented Filter */}
                  <div className="md:col-span-4 flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                    {(['All', 'SUV', 'MPV', 'Sedan', 'Hatchback'] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => setSelectedBodyStyle(style)}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          selectedBodyStyle === style
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>

                  {/* Sort Order */}
                  <div className="md:col-span-3 flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-slate-900"
                    >
                      <option value="featured">Sort: Assured Featured</option>
                      <option value="price_asc">Price: Low to High (₹)</option>
                      <option value="price_desc">Price: High to Low (₹)</option>
                      <option value="mileage_asc">Driven: Lowest km First</option>
                      <option value="year_desc">Reg. Year: Newest First</option>
                    </select>
                  </div>
                </div>

                {/* Secondary Filter Row: Fuel Type + Max Budget in Lakhs */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <span className="text-xs text-slate-500 whitespace-nowrap">Fuel Type:</span>
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(['All', 'Diesel', 'Petrol', 'Hybrid', 'Electric', 'CNG'] as const).map(
                        (fuel) => (
                          <button
                            key={fuel}
                            onClick={() => setSelectedFuel(fuel)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                              selectedFuel === fuel
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {fuel}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      Max Ex-Showroom:{' '}
                      <strong className="font-mono tabular-nums text-slate-900">
                        {formatLakhs(maxPriceINR)} ({formatINR(maxPriceINR)})
                      </strong>
                    </span>
                    <input
                      type="range"
                      min={600000}
                      max={4500000}
                      step={100000}
                      value={maxPriceINR}
                      onChange={(e) => setMaxPriceINR(Number(e.target.value))}
                      className="w-36 accent-slate-900"
                    />
                    {(selectedBodyStyle !== 'All' ||
                      selectedFuel !== 'All' ||
                      maxPriceINR < 4500000 ||
                      searchQuery) && (
                      <button
                        onClick={() => {
                          setSelectedBodyStyle('All');
                          setSelectedFuel('All');
                          setMaxPriceINR(4500000);
                          setSearchQuery('');
                        }}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 3-Column Product Grid */}
              {!listingsLoaded && firestoreListings.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="rounded-xl bg-white border border-slate-200 overflow-hidden animate-pulse"
                    >
                      <div className="aspect-4/3 bg-slate-200" />
                      <div className="p-5 space-y-3">
                        <div className="h-3 w-1/2 bg-slate-200 rounded" />
                        <div className="h-5 w-3/4 bg-slate-200 rounded" />
                        <div className="h-4 w-1/3 bg-slate-200 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredListings.length === 0 ? (
                <div className="rounded-xl bg-white border border-slate-200 p-12 text-center space-y-3">
                  <p className="text-base font-semibold text-slate-900">
                    No cars match your current filter criteria
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Try expanding your maximum budget slider or clearing your fuel and body type
                    filters.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedBodyStyle('All');
                      setSelectedFuel('All');
                      setMaxPriceINR(4500000);
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {filteredListings.map((car) => {
                    const onRoad = calculateRegionalOnRoadPrice(car, selectedRegion);
                    return (
                      <article
                        key={car.id}
                        onClick={() => handleInspectListing(car)}
                        className="group cursor-pointer rounded-xl bg-white border border-slate-200 overflow-hidden transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between"
                      >
                        <div>
                          {/* 4:3 Studio Vehicle Imagery */}
                          <div className="aspect-4/3 w-full bg-[#18181B] overflow-hidden relative">
                            <VehicleImage
                              src={car.imageUrl}
                              alt={car.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          </div>

                          {/* Card Copy — Zero Pill Metadata Discipline */}
                          <div className="p-5 space-y-2">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>
                                {car.year} · {car.make} · {car.fuelType}
                              </span>
                              <span
                                className={`font-medium capitalize ${
                                  car.status === 'active'
                                    ? 'text-emerald-700'
                                    : car.status === 'reserved'
                                    ? 'text-amber-700'
                                    : 'text-slate-500'
                                }`}
                              >
                                {car.hasPendingWrites ? 'Syncing' : car.status}
                              </span>
                            </div>

                            <h3 className="text-base font-semibold text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-1">
                              {car.title}
                            </h3>

                            <div className="text-xs text-slate-500">
                              <span className="font-mono tabular-nums">
                                {car.mileage.toLocaleString('en-IN')} km
                              </span>
                              <span className="mx-1.5">·</span>
                              <span>{car.transmission}</span>
                              <span className="mx-1.5">·</span>
                              <span className="font-mono">{car.vin.slice(0, 4)}</span>
                              <span className="mx-1.5">·</span>
                              <span>{car.location.split(',')[0]}</span>
                            </div>
                          </div>
                        </div>

                        {/* Regional On-Road & Ex-Showroom Price Baseline */}
                        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 space-y-2.5">
                          <div className="flex items-baseline justify-between">
                            <div>
                              <div className="text-[11px] text-slate-500">
                                On-Road {onRoad.region.city} ({onRoad.region.rtoPrefix})
                              </div>
                              <div className="text-base font-mono tabular-nums font-bold text-slate-900">
                                {formatINR(onRoad.totalOnRoadPrice)}{' '}
                                <span className="text-xs font-normal text-slate-500">
                                  ({formatLakhs(onRoad.totalOnRoadPrice)})
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[11px] text-slate-500">Ex-Hub</div>
                              <div className="text-xs font-mono tabular-nums font-medium text-slate-700">
                                {formatLakhs(onRoad.exShowroomPrice)}
                              </div>
                            </div>
                          </div>

                          <div
                            className="flex items-center justify-between pt-2 border-t border-slate-200/70"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => setRegionalModalListing(car)}
                              className="text-xs font-medium text-amber-800 hover:text-amber-950 transition-colors inline-flex items-center gap-1"
                            >
                              <Calculator className="w-3.5 h-3.5" />
                              8-City On-Road
                            </button>

                            <div className="flex items-center gap-2.5">
                              <button
                                onClick={() => {
                                  if (!userProfile) {
                                    handleSignIn();
                                  } else {
                                    setMessagingInitialListing(car);
                                    setShowMessaging(true);
                                  }
                                }}
                                className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
                              >
                                Chat
                              </button>
                              {car.status === 'active' ? (
                                <button
                                  onClick={() => {
                                    if (!userProfile) {
                                      handleSignIn();
                                    } else {
                                      setCheckoutListing(car);
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
                                >
                                  Book ₹10k
                                </button>
                              ) : (
                                <span className="text-xs font-medium text-slate-400 capitalize">
                                  {car.status}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* SECTION 3: INTERACTIVE PAN-INDIA REGIONAL ON-ROAD TAX COMPARISON TABLE */}
            {heroListing && (
              <section className="max-w-[1360px] mx-auto px-4 sm:px-8">
                <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                  <div className="p-6 sm:p-8 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-500">
                        <span>01. Live State RTO Road Tax & On-Road Price Matrix</span>
                        <span className="mx-1.5">·</span>
                        <span>Vahan-Synced Regional Engine</span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-display font-bold text-slate-900 mt-1">
                        How On-Road Price Varies Across Indian Regions ({heroListing.title})
                      </h2>
                    </div>
                    <button
                      onClick={() => setRegionalModalListing(heroListing)}
                      className="px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap self-start md:self-auto"
                    >
                      Open Full Tax Calculator
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                          <th className="py-3 px-6">Indian City & State RTO</th>
                          <th className="py-3 px-4 text-right">Ex-Showroom / Hub</th>
                          <th className="py-3 px-4 text-right">State Road Tax</th>
                          <th className="py-3 px-4 text-right">Zero-Dep Ins. + 1% TCS</th>
                          <th className="py-3 px-4 text-right">RC + FASTag + Hub</th>
                          <th className="py-3 px-6 text-right">Total On-Road Price (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {calculateAllRegionsOnRoad(heroListing).map((row) => {
                          const isCurrent = row.region.code === selectedRegion;
                          return (
                            <tr
                              key={row.region.code}
                              onClick={() => setSelectedRegion(row.region.code)}
                              className={`cursor-pointer transition-colors ${
                                isCurrent ? 'bg-amber-50/60 font-medium' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-3.5 px-6">
                                <span className="font-semibold text-slate-900">
                                  {row.region.city}
                                </span>
                                <span className="mx-1.5 text-slate-400">·</span>
                                <span className="text-slate-500">{row.region.state}</span>
                                <span className="ml-1.5 font-mono text-[11px] text-slate-500">
                                  ({row.region.rtoPrefix})
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                                {formatINR(row.exShowroomPrice)}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                                {formatINR(row.rtoRoadTax)} ({row.roadTaxPctApplied}%)
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                                {formatINR(row.insuranceZeroDep + row.tcsCharge)}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                                {formatINR(
                                  row.fastagAndHsrp +
                                    row.rcTransferAndGreenCess +
                                    row.interStateNocLogistics
                                )}
                              </td>
                              <td className="py-3.5 px-6 text-right font-mono tabular-nums font-bold text-slate-900">
                                {formatINR(row.totalOnRoadPrice)}{' '}
                                <span className="text-[11px] font-normal text-slate-500">
                                  ({formatLakhs(row.totalOnRoadPrice)})
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* SECTION 4: TRUST, ASSURED INSPECTION & CUSTOMER PROOF */}
            <section className="max-w-[1360px] mx-auto px-4 sm:px-8">
              <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <div className="text-xs text-slate-500">
                    <span>02. Assured Quality & Paperless Vahan RC Transfer</span>
                    <span className="mx-1.5">·</span>
                    <span>7-Day Money-Back Protection</span>
                  </div>
                  <h2
                    className="text-2xl sm:text-3xl font-display font-bold text-slate-900"
                    style={{ textWrap: 'balance' }}
                  >
                    Every car passes a 140-point hub inspection with transparent state-wise on-road
                    pricing and automated RC transfer.
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                    Unlike classified portals with hidden dealer handling fees or uncertain RTO
                    charges, Veloce India computes exact state road tax, 1% TCS, zero-depreciation
                    insurance, and inter-state NOC logistics upfront—with full offline browsing and
                    automatic cloud sync.
                  </p>
                  <div className="pt-2 flex flex-wrap gap-6 text-xs">
                    <div>
                      <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
                        ₹485 Cr+
                      </div>
                      <div className="text-slate-500">Annualized Indian Car Transactions</div>
                    </div>
                    <div>
                      <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
                        8 Metro Hubs
                      </div>
                      <div className="text-slate-500">
                        Delhi NCR, Mumbai, Bengaluru, Chennai, Hyderabad, Pune, Ahmedabad, Kochi
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
                        140 Checkpoints
                      </div>
                      <div className="text-slate-500">Flood, Odometer & Chassis Verified</div>
                    </div>
                  </div>
                </div>

                {/* Attributable Indian Customer Testimonial */}
                <div className="lg:col-span-5 p-6 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <p className="text-sm text-slate-700 leading-relaxed italic">
                    “Comparing the on-road cost between Bengaluru KA-01 and Chennai TN-01 helped me
                    understand the exact road tax and TCS breakdown before paying my ₹10,000 booking
                    token. The Creta SX(O) Turbo was delivered to my Whitefield apartment with
                    complete Vahan RC transfer in 5 days.”
                  </p>
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900">Arjun Subramanian</div>
                    <div className="text-slate-500">
                      Principal Systems Architect, Bengaluru (KA-01 Buyer)
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* QUIET FOOTER */}
      <footer className="border-t border-slate-200 bg-white px-4 sm:px-8 py-6">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <span>© {new Date().getFullYear()} Veloce India Auto Exchange</span>
            <span className="mx-2">·</span>
            <span>Real-Time Indian Cars & Regional On-Road Price Platform</span>
          </div>
          <div className="flex items-center gap-5">
            <button
              onClick={() => setShowOfflineSyncModal(true)}
              className="hover:text-slate-900 transition-colors"
            >
              Offline Vault & Push Settings
            </button>
            <button
              onClick={() => {
                if (!userProfile) handleSignIn();
                else setActiveView('admin_analytics');
              }}
              className="hover:text-slate-900 transition-colors"
            >
              Hub Analytics & Admin
            </button>
          </div>
        </div>
      </footer>

      {/* PERSISTENT OFFLINE / PENDING SYNC INDICATOR */}
      {(!isOnline || pendingSyncCount > 0) && (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl border border-slate-700">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div>
              {!isOnline
                ? 'Offline Vault Mode Active — Cached Data & Queue Enabled'
                : `Synchronizing ${pendingSyncCount} Pending Write(s)...`}
            </div>
            <div className="text-[11px] text-slate-400">
              Changes sync automatically when online
            </div>
          </div>
          {simulatedOffline && (
            <button
              onClick={toggleSimulatedOffline}
              className="ml-2 px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors"
            >
              Reconnect & Sync Now
            </button>
          )}
        </div>
      )}

      {/* VEHICLE DETAIL MODAL (PDP) */}
      {detailListing && (
        <VehicleDetailModal
          listing={detailListing}
          selectedRegion={selectedRegion}
          onSelectRegion={setSelectedRegion}
          currentUser={userProfile}
          isAdminUser={isAdminUser}
          onClose={() => setDetailListing(null)}
          onOpenCheckout={(car) => {
            setDetailListing(null);
            setCheckoutListing(car);
          }}
          onOpenRegionalMatrix={(car) => {
            setDetailListing(null);
            setRegionalModalListing(car);
          }}
          onOpenMessage={(car) => {
            setDetailListing(null);
            setMessagingInitialListing(car);
            setShowMessaging(true);
          }}
          onOpenEdit={(car) => {
            setDetailListing(null);
            setEditingListing(car);
            setShowListingForm(true);
          }}
          onRequireAuth={() => {
            setDetailListing(null);
            handleSignIn();
          }}
        />
      )}

      {/* ALL-INDIA REGIONAL ON-ROAD PRICE MATRIX MODAL */}
      {regionalModalListing && (
        <RegionalOnRoadModal
          listing={regionalModalListing}
          selectedRegion={selectedRegion}
          onSelectRegion={setSelectedRegion}
          onClose={() => setRegionalModalListing(null)}
          onProceedToBook={(car) => {
            if (!userProfile) {
              handleSignIn();
            } else {
              setCheckoutListing(car);
            }
          }}
        />
      )}

      {/* SECURE ESCROW CHECKOUT MODAL */}
      {checkoutListing && userProfile && (
        <CheckoutModal
          listing={checkoutListing}
          selectedRegion={selectedRegion}
          onSelectRegion={setSelectedRegion}
          currentUser={userProfile}
          isOnline={isOnline}
          onClose={() => setCheckoutListing(null)}
          onSuccess={(orderId) => {
            showToast(
              `Booking #${orderId.slice(-6).toUpperCase()} Recorded`,
              isOnline
                ? 'INR payment processed and synced in real time.'
                : 'Booking queued in Offline Vault; will sync automatically when online.'
            );
          }}
        />
      )}

      {/* CREATE / EDIT CONSIGNMENT MODAL */}
      {showListingForm && userProfile && (
        <ListingFormModal
          currentUser={userProfile}
          existingListing={editingListing}
          onClose={() => {
            setShowListingForm(false);
            setEditingListing(null);
          }}
          onSaved={() => {
            showToast(
              editingListing ? 'Car Listing Updated' : 'Car Listed Live in INR',
              isOnline
                ? 'Published to the real-time Indian marketplace.'
                : 'Saved to Offline Vault; will sync automatically when online.'
            );
          }}
        />
      )}

      {/* DIRECT BUYER-SELLER MESSAGING DRAWER */}
      {showMessaging && userProfile && (
        <MessagingDrawer
          currentUser={userProfile}
          messages={messages}
          listings={activeListings}
          initialListing={messagingInitialListing}
          onClose={() => {
            setShowMessaging(false);
            setMessagingInitialListing(null);
          }}
        />
      )}

      {/* REAL-TIME NOTIFICATIONS & PUSH ALERTS DRAWER */}
      {showNotificationsDrawer && userProfile && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold">Real-Time Booking & Vahan Alerts</h2>
              </div>
              <button
                onClick={() => setShowNotificationsDrawer(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  Browser Push Notifications
                </div>
                <div className="text-[11px] text-slate-500">
                  Status: {pushStatus === 'granted' ? 'Enabled' : 'Click to enable instant alerts'}
                </div>
              </div>
              <button
                onClick={handleEnablePushNotifications}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                {pushStatus === 'granted' ? 'Send Test Push' : 'Enable Push'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No notifications yet. Token bookings, RC transfer updates, and test drive chats
                  appear here in real time.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleMarkNotificationRead(n)}
                    className={`p-4 cursor-pointer transition-colors ${
                      n.read ? 'bg-white' : 'bg-amber-50/40 hover:bg-amber-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="uppercase tracking-wider font-medium">
                        {n.type.replace('_', ' ')}
                      </span>
                      <span>{n.read ? 'Read' : 'New Alert'}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900 mt-1">{n.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.body}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* OFFLINE SYNC & RBAC CONTROL MODAL */}
      {showOfflineSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold">
                  Offline Persistence, Auto-Sync & Role Controls
                </h2>
              </div>
              <button
                onClick={() => setShowOfflineSyncModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">Firestore Network State</span>
                  <span
                    className={`font-mono font-semibold ${
                      isOnline ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {isOnline ? 'ONLINE (Live Cloud Sync)' : 'OFFLINE VAULT (Local IndexedDB)'}
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Veloce India uses persistent IndexedDB caching. When offline, you can continue
                  comparing regional on-road prices across all 8 Indian states, booking cars, and
                  sending messages. All queued writes synchronize automatically as soon as
                  connectivity is restored.
                </p>
                <div className="pt-2 flex items-center justify-between text-slate-500 border-t border-slate-200">
                  <span>Pending Local Writes: {pendingSyncCount}</span>
                  <span className="font-mono">
                    Last Synced: {lastSyncedAt.toLocaleTimeString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200">
                <div>
                  <div className="font-semibold text-slate-900">
                    Simulate Offline Mode (Test Auto-Sync)
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Disconnects Firestore network transport to test offline queuing & automatic
                    resync
                  </div>
                </div>
                <button
                  onClick={toggleSimulatedOffline}
                  className={`px-3.5 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                    simulatedOffline
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {simulatedOffline ? 'Go Online & Auto-Sync' : 'Go Offline'}
                </button>
              </div>

              {userProfile && (
                <div className="p-4 rounded-lg border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-slate-700" />
                      Active RBAC Profile Role
                    </span>
                    <span className="font-mono uppercase font-semibold text-slate-900">
                      {isAdminUser ? 'admin (verified)' : userProfile.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(['buyer', 'seller'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={async () => {
                          try {
                            await updateDoc(doc(db, 'users', userProfile.uid), {
                              role: r,
                              updatedAt: serverTimestamp(),
                            });
                            showToast('Role Updated', `Switched active workspace role to ${r}.`);
                          } catch (error) {
                            handleFirestoreError(
                              error,
                              OperationType.UPDATE,
                              `users/${userProfile.uid}`
                            );
                          }
                        }}
                        className={`flex-1 py-2 rounded-lg border font-medium capitalize inline-flex items-center justify-center gap-1.5 transition-colors ${
                          userProfile.role === r
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {userProfile.role === r && <Check className="w-3.5 h-3.5" />}
                        {r} Account
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setShowOfflineSyncModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
