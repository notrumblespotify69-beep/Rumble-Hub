import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, limit, query, runTransaction, where, updateDoc } from 'firebase/firestore';
import { ArrowRight, CreditCard, Gamepad2, Ticket, Wallet } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import SEO from '../components/SEO';

export default function Checkout() {
  const { productId, variantId } = useParams();
  const { user, profile, cart, cartTotal, clearCart } = useAuth();
  const navigate = useNavigate();

  const isCartCheckout = !productId;

  const [product, setProduct] = useState<any>(null);
  const [variant, setVariant] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);

  const [promoCode, setPromoCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState('');

  const [useBalance, setUseBalance] = useState(false);
  const [paymentMethod] = useState('stripe');
  const [agreedToTOS, setAgreedToTOS] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  
  const [paymentSettings, setPaymentSettings] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const d = await getDoc(doc(db, 'settings', 'payments'));
        if (d.exists()) {
          setPaymentSettings(d.data());
        }
      } catch(e) {}
    };
    fetchSettings();
  },[]);

  useEffect(() => {
    if (isCartCheckout) {
      if (cart.length === 0) {
        navigate('/');
      }
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const qty = parseInt(params.get('qty') || '1', 10);
    setQuantity(qty > 0 ? qty : 1);

    const fetchProduct = async () => {
      if (!productId) return;
      const docSnap = await getDoc(doc(db, 'products', productId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProduct(data);
        const selected = data.variants?.find((item: any) => item.id === variantId);
        if (selected) {
          setVariant(selected);
        }
      }
    };

    fetchProduct();
  }, [productId, variantId, isCartCheckout, cart, navigate]);

  const subtotal = isCartCheckout ? cartTotal : (variant?.price || 0) * quantity;
  const totalAfterDiscount = subtotal * (1 - discountPercent / 100);
  const balanceToUse = useBalance ? Math.min(profile?.balance || 0, totalAfterDiscount) : 0;
  const finalAmount = totalAfterDiscount - balanceToUse;

  const handleApplyPromo = async (codeToApply?: string) => {
    const code = codeToApply || promoCode;
    setPromoError('');
    setPromoSuccess('');
    if (!code.trim()) return;

    try {
      const promoSnap = await getDocs(
        query(collection(db, 'promocodes'), where('code', '==', code.toUpperCase()))
      );

      if (promoSnap.empty) {
        setPromoError('Invalid coupon code');
        if (codeToApply) localStorage.removeItem('savedPromo');
        return;
      }

      const promo = promoSnap.docs[0].data();

      if (promo.maxUses > 0 && promo.uses >= promo.maxUses) {
        setPromoError('Coupon code has reached maximum uses');
        if (codeToApply) localStorage.removeItem('savedPromo');
        return;
      }

      const userUses = promo.usedBy?.[user?.uid || ''] || 0;
      if (promo.maxUsesPerUser > 0 && userUses >= promo.maxUsesPerUser) {
        setPromoError('You have reached the maximum uses for this coupon');
        if (codeToApply) localStorage.removeItem('savedPromo');
        return;
      }

      if (promo.type === 'discount') {
        setDiscountPercent(promo.value);
        setPromoCode(code.toUpperCase());
        setPromoSuccess(`Applied ${promo.value}% discount!`);
        localStorage.setItem('savedPromo', code.toUpperCase());
      } else {
        setPromoError('This coupon is only for balance top-ups.');
        if (codeToApply) localStorage.removeItem('savedPromo');
      }
    } catch {
      setPromoError('Failed to apply coupon');
    }
  };

  useEffect(() => {
    const savedPromo = localStorage.getItem('savedPromo');
    if (savedPromo && user) {
      handleApplyPromo(savedPromo);
    }
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (sessionId && user && profile && (isCartCheckout || (product && variant))) {
      const verifySession = async () => {
        try {
          const existingTransaction = await getDocs(
            query(collection(db, 'transactions'), where('sessionId', '==', sessionId))
          );

          if (!existingTransaction.empty) {
            window.history.replaceState({}, document.title, window.location.pathname);
            navigate('/profile?tab=purchases');
            return;
          }

          const res = await fetch('/api/payments/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          });
          const data = await res.json();

          if (data.success && data.metadata?.userId === user.uid) {
            await processOrder(sessionId, data.metadata);
          }
        } catch (verifyError) {
          console.error('Failed to verify session', verifyError);
        } finally {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };

      verifySession();
    }
  }, [user, profile, product, variant, isCartCheckout, navigate]);

  const processOrder = async (sessionId?: string, metadata?: any) => {
    if (!user || !profile) return;
    if (!isCartCheckout && (!product || !variant)) return;
    if (isCartCheckout && cart.length === 0) return;

    setIsProcessing(true);
    setError('');

    try {
      const keysToBuy: Array<{ docId: string; price: number; title: string }> = [];

      if (isCartCheckout) {
        for (const item of cart) {
          const stockQuery = query(
            collection(db, 'keys'),
            where('productId', '==', item.productId),
            where('variantId', '==', item.variantId),
            where('isSold', '==', false),
            limit(item.quantity)
          );
          const snap = await getDocs(stockQuery);
          if (snap.docs.length < item.quantity) {
            throw new Error(`Not enough stock for ${item.title} (${item.variantName})`);
          }
          keysToBuy.push(...snap.docs.map(d => ({ docId: d.id, price: item.price, title: item.title })));
        }
      } else {
        const stockQuery = query(
          collection(db, 'keys'),
          where('productId', '==', productId),
          where('variantId', '==', variantId),
          where('isSold', '==', false),
          limit(quantity)
        );
        const keySnap = await getDocs(stockQuery);

        if (keySnap.docs.length < quantity) {
          throw new Error(`Sorry, only ${keySnap.docs.length} keys left in stock!`);
        }

        keysToBuy.push(...keySnap.docs.map(d => ({ docId: d.id, price: variant.price, title: product.title })));
      }

      const appliedDiscountPercent = metadata?.discountPercent ? Number(metadata.discountPercent) : discountPercent;
      const appliedPromoCode = metadata?.promoCode || promoCode;
      const appliedBalanceToUse = metadata?.balanceUsed ? Number(metadata.balanceUsed) : balanceToUse;
      const currentSubtotal = isCartCheckout ? cartTotal : (variant?.price || 0) * quantity;
      const currentTotalAfterDiscount = currentSubtotal * (1 - appliedDiscountPercent / 100);

      const userRef = doc(db, 'users', user.uid);
      const promoQuery =
        appliedDiscountPercent > 0 && appliedPromoCode
          ? query(collection(db, 'promocodes'), where('code', '==', appliedPromoCode.toUpperCase()))
          : null;
      const promoSnap = promoQuery ? await getDocs(promoQuery) : null;
      const promoDocRef = promoSnap && !promoSnap.empty ? doc(db, 'promocodes', promoSnap.docs[0].id) : null;
      const promoData = promoSnap && !promoSnap.empty ? promoSnap.docs[0].data() : null;

      let affiliateDocRef = null;
      if (promoData && promoData.isAffiliate && promoData.affiliateEmail) {
        const affiliateQ = query(collection(db, 'users'), where('email', '==', promoData.affiliateEmail.toLowerCase()));
        const affiliateSnap = await getDocs(affiliateQ);
        if (!affiliateSnap.empty) {
          affiliateDocRef = doc(db, 'users', affiliateSnap.docs[0].id);
        }
      }

      const transactionRef = doc(collection(db, 'transactions'));
      const purchasedAt = Date.now();

      let promoDetailsStr: string | null = null;
      await runTransaction(db, async transaction => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
          throw new Error('User profile not found.');
        }

        const latestProfile = userSnap.data() as any;
        const currentBalance = Number(latestProfile.balance || 0);
        if (appliedBalanceToUse > currentBalance) {
          throw new Error('Insufficient balance.');
        }

        const keyRefs = keysToBuy.map(key => doc(db, 'keys', key.docId));
        const keySnaps = await Promise.all(keyRefs.map(ref => transaction.get(ref)));

        keySnaps.forEach((snap, index) => {
          if (!snap.exists()) {
            throw new Error('One of the selected keys no longer exists.');
          }
          if (snap.data().isSold) {
            throw new Error(`Sorry, ${keysToBuy[index].title} just went out of stock. Please try again.`);
          }
        });

        if (promoDocRef && promoData) {
          const promoDocSnap = await transaction.get(promoDocRef);
          if (!promoDocSnap.exists()) {
            throw new Error('The coupon code is no longer available.');
          }

          const currentPromoData = promoDocSnap.data() as any;
          const uses = Number(currentPromoData.uses || 0);
          const maxUses = Number(currentPromoData.maxUses || 0);
          const userUses = Number(currentPromoData.usedBy?.[user.uid] || 0);
          const maxUsesPerUser = Number(currentPromoData.maxUsesPerUser || 0);

          if (maxUses > 0 && uses >= maxUses) {
            throw new Error('Coupon code has reached maximum uses.');
          }
          if (maxUsesPerUser > 0 && userUses >= maxUsesPerUser) {
            throw new Error('You have reached the maximum uses for this coupon.');
          }

          promoDetailsStr = currentPromoData.type === 'balance' ? `+$${currentPromoData.value} bonus` : `${currentPromoData.value}% discount`;

          transaction.update(promoDocRef, {
            uses: uses + 1,
            usedBy: { ...currentPromoData.usedBy, [user.uid]: userUses + 1 }
          });
        }

        if (affiliateDocRef) {
          const affSnap = await transaction.get(affiliateDocRef);
          if (affSnap.exists() && affSnap.id !== user.uid) {
            const affData = affSnap.data() as any;
            const earned = currentTotalAfterDiscount * 0.20;
            transaction.update(affiliateDocRef, {
              balance: Number(affData.balance || 0) + earned,
              affiliateEarnings: Number(affData.affiliateEarnings || 0) + earned
            });
            const affHistoryRef = doc(collection(db, 'affiliate_history'));
            transaction.set(affHistoryRef, {
              affiliateId: affSnap.id,
              referredUserId: user.uid,
              referredUserEmail: user.email,
              amount: currentTotalAfterDiscount,
              earned: earned,
              date: purchasedAt
            });
          }
        }

        if (appliedBalanceToUse > 0) {
          transaction.update(userRef, {
            balance: currentBalance - appliedBalanceToUse
          });
        }

        keyRefs.forEach((keyRef, index) => {
          const key = keysToBuy[index];
          transaction.update(keyRef, {
            isSold: true,
            ownerId: user.uid,
            ownerName: latestProfile.displayName || user.email,
            ownerPhoto: latestProfile.photoURL || '',
            purchasedAt,
            price: key.price,
            productName: key.title
          });
        });

        transaction.set(transactionRef, {
          userId: user.uid,
          type: 'purchase',
          amount: currentTotalAfterDiscount,
          method:
            appliedBalanceToUse === currentTotalAfterDiscount
              ? 'Balance'
              : paymentMethod === 'stripe'
                ? 'Credit Card'
                : 'Other',
          productTitle: isCartCheckout ? 'Cart Checkout' : product.title,
          promoCode: appliedPromoCode || null,
          promoDetails: promoDetailsStr,
          createdAt: purchasedAt,
          ...(sessionId ? { sessionId } : {})
        });
      });

      if (isCartCheckout) {
        clearCart();
      }

      localStorage.removeItem('savedPromo');
      try {
         await fetch('/api/discord/give-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.uid })
         });
      } catch (e) {}

      navigate('/profile?tab=purchases');
    } catch (purchaseError: any) {
      console.error(purchaseError);
      setError(purchaseError.message || 'An error occurred during purchase.');
      setIsProcessing(false);
    }
  };

  const handleProceed = async () => {
    if (!agreedToTOS) {
      setError('You must agree to the Terms of Service.');
      return;
    }

    if (finalAmount === 0) {
      await processOrder();
      return;
    }

    if (paymentMethod === 'stripe') {
      setIsProcessing(true);
      try {
        const metadata: any = isCartCheckout ? { type: 'cart' } : { productId, variantId, quantity };
        if (discountPercent > 0) {
          metadata.discountPercent = discountPercent;
          metadata.promoCode = promoCode.toUpperCase();
        }
        if (useBalance && balanceToUse > 0) {
          metadata.balanceUsed = balanceToUse;
        }

        const res = await fetch('/api/payments/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: finalAmount,
            method: 'stripe',
            userId: user.uid,
            metadata,
            successUrl:
              window.location.origin +
              `/checkout/${isCartCheckout ? 'cart' : `${productId}/${variantId}`}?session_id={CHECKOUT_SESSION_ID}&qty=${quantity}`,
            cancelUrl:
              window.location.origin +
              `/checkout/${isCartCheckout ? 'cart' : `${productId}/${variantId}`}?qty=${quantity}`
          })
        });
        const data = await res.json();

        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error(data.error || 'Failed to create checkout session');
        }
      } catch (paymentError: any) {
        console.error(paymentError);
        setError(paymentError.message || 'Failed to initiate payment');
        setIsProcessing(false);
      }
      return;
    }

    setError(`${paymentMethod} is not fully implemented yet.`);
  };

  if (!isCartCheckout && (!product || !variant)) {
    return <div className="min-h-screen flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="w-full">
      <SEO title="Checkout | Rumble Hub" description="Complete your secure purchase on Rumble Hub." />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-32">
        <div className="flex flex-col lg:flex-row gap-12">
          <div className="w-full lg:w-1/3">
            <Link to="/" className="flex items-center gap-3 mb-8 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="Rumble Hub" className="w-8 h-8 object-contain" />
              <span className="font-bold text-xl">Rumble Hub</span>
            </Link>

            <div className="text-zinc-400 text-sm mb-2">Pay Rumble Hub</div>
            <div className="text-4xl font-bold text-white mb-8">${finalAmount.toFixed(2)}</div>

            {isCartCheckout ? (
              <div className="space-y-4 mb-6">
                {cart.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-[#1A1D24] rounded-xl p-4 border border-zinc-800/50 flex gap-4 items-center"
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-16 h-16 rounded-lg object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-zinc-800 rounded-lg flex items-center justify-center">
                        <Gamepad2 className="w-8 h-8 text-zinc-600" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-bold text-white">{item.title}</div>
                      <div className="text-sm text-zinc-400">{item.variantName}</div>
                      <div className="text-xs text-zinc-500">{item.quantity}x</div>
                    </div>
                    <div className="font-bold text-white">${(item.price * item.quantity).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#1A1D24] rounded-xl p-4 border border-zinc-800/50 mb-6 flex gap-4 items-center">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.title}
                    className="w-16 h-16 rounded-lg object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-16 h-16 bg-zinc-800 rounded-lg flex items-center justify-center">
                    <Gamepad2 className="w-8 h-8 text-zinc-600" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-bold text-white">{product.title}</div>
                  <div className="text-sm text-zinc-400">{variant.name}</div>
                  <div className="text-xs text-zinc-500">{quantity}x</div>
                </div>
                <div className="font-bold text-white">${subtotal.toFixed(2)}</div>
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {discountPercent > 0 && (
                <div className="flex justify-between text-green-400">
                  <span>Discount ({discountPercent}%)</span>
                  <span>-${(subtotal * (discountPercent / 100)).toFixed(2)}</span>
                </div>
              )}
              {balanceToUse > 0 && (
                <div className="flex justify-between text-indigo-400">
                  <span>Balance Used</span>
                  <span>-${balanceToUse.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-white font-bold pt-3 border-t border-zinc-800/50">
                <span>Total</span>
                <span>${finalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-zinc-800/50">
              <div className="text-sm font-bold text-white mb-2">Having issues with your order?</div>
              <div className="text-xs text-zinc-400 mb-4">
                You can open a ticket on your Customer Dashboard to receive assistance from our support team.
              </div>
              <button
                onClick={() => navigate('/profile?tab=tickets')}
                className="border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 px-4 py-2 rounded-lg text-xs font-medium transition-colors mb-8 flex items-center gap-2"
              >
                <Ticket className="w-4 h-4" /> Open a Support Ticket
              </button>

              <div className="flex gap-4 text-xs text-zinc-500">
                <a href="/terms-of-service" target="_blank" className="hover:text-zinc-300 transition-colors">
                  Terms of Service
                </a>
                <span>&bull;</span>
                <a href="/refund-policy" target="_blank" className="hover:text-zinc-300 transition-colors">
                  Refund Policy
                </a>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-2/3">
            <div className="flex items-center gap-8 border-b border-zinc-800/50 pb-4 mb-8">
              <div className="text-indigo-400 font-medium border-b-2 border-indigo-500 pb-4 -mb-[18px]">
                <div className="text-xs text-indigo-400/70">Step 1</div>
                Order Information
              </div>
              <div className="text-zinc-500 font-medium">
                <div className="text-xs text-zinc-600">Step 2</div>
                Confirm & Pay
              </div>
              <div className="text-zinc-500 font-medium">
                <div className="text-xs text-zinc-600">Step 3</div>
                Receive Your Items
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Coupon Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value)}
                    placeholder="Have a coupon code? Enter it here."
                    className="flex-1 bg-[#1A1D24] border border-zinc-800 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    onClick={() => handleApplyPromo()}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                  >
                    Apply &rarr;
                  </button>
                </div>
                {promoError && <div className="text-red-400 text-xs mt-2">{promoError}</div>}
                {promoSuccess && <div className="text-green-400 text-xs mt-2">{promoSuccess}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Payment Method *</label>

                <div className="space-y-3">
                  {(!paymentSettings || paymentSettings?.balance?.enabled) && (
                  <label
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                      useBalance
                        ? 'bg-indigo-500/10 border-indigo-500'
                        : 'bg-[#1A1D24] border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={useBalance}
                        onChange={e => setUseBalance(e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500 bg-zinc-900"
                      />
                      <div>
                        <div className="font-medium text-white">Customer Balance</div>
                        <div className="text-xs text-zinc-500">Available: ${(profile?.balance || 0).toFixed(2)}</div>
                      </div>
                    </div>
                    <Wallet className={`w-5 h-5 ${useBalance ? 'text-indigo-400' : 'text-zinc-500'}`} />
                  </label>
                  )}

                  {(!paymentSettings || paymentSettings?.stripe?.enabled) && (
                  <div className="flex items-center justify-between p-4 rounded-xl border bg-[#22252D] border-zinc-600 opacity-100">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-4 border-indigo-600 bg-zinc-900"></div>
                      <div>
                        <div className="font-medium text-white">Debit Card / Credit Card / Google Pay / Apple Pay</div>
                        <div className="text-xs text-zinc-500">Powered by Stripe</div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <CreditCard className="w-5 h-5 text-zinc-400" />
                    </div>
                  </div>
                  )}

                  {paymentSettings?.paypal?.enabled && (
                  <div className="flex items-center justify-between p-4 rounded-xl border bg-[#22252D] border-zinc-600">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-4 border-zinc-600 bg-zinc-900"></div>
                      <div>
                        <div className="font-medium text-white">PayPal</div>
                        <div className="text-xs text-zinc-500">Not currently selected</div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <CreditCard className="w-5 h-5 text-zinc-400" />
                    </div>
                  </div>
                  )}
                  
                  {paymentSettings && !paymentSettings?.stripe?.enabled && !paymentSettings?.balance?.enabled && !paymentSettings?.paypal?.enabled && (
                    <div className="text-red-400 text-sm">No payment methods available right now.</div>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTOS}
                    onChange={e => setAgreedToTOS(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500 bg-zinc-900"
                  />
                  <span className="text-sm text-zinc-300">
                    I have read and agree to Rumble Hub&apos;s{' '}
                    <a href="/terms-of-service" target="_blank" className="text-indigo-400 hover:underline">
                      Terms of Service
                    </a>
                    .
                  </span>
                </label>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm">{error}</div>
              )}

              {profile && !profile.discordId ? (
                <button
                  onClick={() => {
                     window.open(`/api/discord/auth-url?uid=${user?.uid}`, '_blank', 'width=500,height=600');
                     window.addEventListener('message', async (e) => {
                        if (e.data?.type === 'discord_auth_success') {
                           if (user) {
                             try {
                               await updateDoc(doc(db, 'users', user.uid), e.data.data);
                               window.location.reload();
                             } catch (err) {
                               console.error(err);
                             }
                           }
                        }
                     });
                  }}
                  className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-4 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Gamepad2 className="w-4 h-4" />
                  Link Discord to Continue
                </button>
              ) : (
                <button
                  onClick={handleProceed}
                  disabled={isProcessing}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-4 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Proceed to Payment <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
