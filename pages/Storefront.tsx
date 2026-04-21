import React, { useEffect, useState } from 'react';
import { Gamepad2, ShoppingCart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import Navbar from '../components/Navbar';
import SEO from '../components/SEO';

export default function Storefront() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [availableKeys, setAvailableKeys] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    productsSold: 0,
    happyCustomers: 0,
    averageRating: 0
  });
  const [recentReviews, setRecentReviews] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const productsSnap = await getDocs(collection(db, 'products'));
        const prods = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setProducts(prods);

        const keysSnap = await getDocs(collection(db, 'keys'));
        const counts: Record<string, number> = {};
        let soldCount = 0;

        keysSnap.docs.forEach(d => {
          const data = d.data();
          if (!data.isSold) {
            const pid = data.productId;
            counts[pid] = (counts[pid] || 0) + 1;
          } else {
            soldCount++;
          }
        });
        setAvailableKeys(counts);

        const reviewsSnap = await getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc')));
        const allReviews = reviewsSnap.docs.map(d => {
          const rData = d.data() as any;
          const matchedProd = prods.find(p => p.id === rData.productId);
          return {
            id: d.id,
            ...rData,
            productName: matchedProd ? matchedProd.title : 'Product'
          };
        });

        const uniqueUsers = new Set(allReviews.map(review => review.userId));
        const totalRating = allReviews.reduce((sum, review) => sum + (review.rating || 5), 0);
        const avgRating = allReviews.length > 0 ? Math.round(totalRating / allReviews.length) : 5;

        setStats({
          productsSold: soldCount,
          happyCustomers: uniqueUsers.size,
          averageRating: avgRating
        });
        setRecentReviews(allReviews.slice(0, 4));
      } catch (fetchError) {
        console.error(fetchError);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0E14] text-zinc-50 font-sans selection:bg-indigo-500/30 relative">
      <SEO />
      <div className="absolute top-0 left-0 w-full h-screen z-0 pointer-events-none">
        <div
          className="w-full h-full bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/background.png)' }}
        />
        <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-[#0B0E14] to-transparent" />
      </div>

      <div className="relative z-10">
        <Navbar />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-[calc(100vh-140px)]">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2 uppercase tracking-tight">Featured Products</h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-[#11141D] rounded-2xl aspect-[3/4] animate-pulse border border-zinc-800/50" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 bg-[#11141D] border border-zinc-800/50 rounded-2xl">
              <Gamepad2 className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-zinc-300 mb-2">Store is currently empty</h2>
              <p className="text-zinc-500 max-w-md mx-auto">
                We are currently stocking up our digital shelves. Check back later for amazing deals on game keys!
              </p>
              {profile?.role === 'admin' && (
                <Link to="/profile" className="inline-block mt-6 text-indigo-400 hover:text-indigo-300 font-medium">
                  Go to Admin Panel to add products &rarr;
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.map(game => {
                const stock = availableKeys[game.id] || 0;
                const isOutOfStock = stock === 0;
                const startingPrice =
                  game.variants && game.variants.length > 0 ? Math.min(...game.variants.map((v: any) => v.price)) : 0;
                const finalStartingPrice = profile?.discountPercentage
                  ? startingPrice * (1 - profile.discountPercentage / 100)
                  : startingPrice;

                return (
                  <Link
                    to={`/product/${game.slug || game.id}`}
                    key={game.id}
                    className="group bg-[#11141D] rounded-xl border border-zinc-800/50 overflow-hidden hover:border-indigo-500/50 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-zinc-900">
                      <img
                        src={game.image}
                        alt={game.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-3 right-3">
                        <div
                          className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
                            isOutOfStock ? 'bg-red-500/80 text-white' : 'bg-black/60 text-zinc-300'
                          }`}
                        >
                          {isOutOfStock ? 'Out of Stock' : `${stock} in stock`}
                        </div>
                      </div>
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="font-bold text-lg mb-1 group-hover:text-indigo-400 transition-colors line-clamp-1">
                        {game.title}
                      </h3>
                      <p className="text-xs text-zinc-500 mb-4 line-clamp-2">{game.description || 'Premium access key'}</p>

                      <div className="mt-auto flex items-end justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Starting at</span>
                          {profile?.discountPercentage ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-zinc-500 line-through">${startingPrice.toFixed(2)}</span>
                              <span className="text-lg font-black text-white">${finalStartingPrice.toFixed(2)}</span>
                            </div>
                          ) : (
                            <div className="text-lg font-black text-white">${startingPrice.toFixed(2)}</div>
                          )}
                        </div>
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${
                            isOutOfStock
                              ? 'bg-zinc-800 border-zinc-800 text-zinc-600'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
                          }`}
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-24 mb-12 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 text-pink-400 text-xs font-bold mb-4 border border-pink-500/20 uppercase tracking-wider">
              Customers Love Us &hearts;
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2 text-white">Our Stats</h2>
            <p className="text-zinc-400 mb-10">Here are some of our key stats that show our success!</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#11141D] border border-zinc-800/50 rounded-2xl p-8 flex flex-col items-center justify-center">
                <div className="text-4xl font-black text-white mb-2">{stats.productsSold}</div>
                <div className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Products Sold</div>
              </div>
              <div className="bg-[#11141D] border border-zinc-800/50 rounded-2xl p-8 flex flex-col items-center justify-center">
                <div className="text-4xl font-black text-white mb-2">{stats.happyCustomers}</div>
                <div className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Happy Customers</div>
              </div>
              <div className="bg-[#11141D] border border-zinc-800/50 rounded-2xl p-8 flex flex-col items-center justify-center">
                <div className="text-4xl font-black text-white mb-2">{stats.averageRating}</div>
                <div className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Average Rating</div>
              </div>
            </div>
          </div>

          <div className="mb-24">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight mb-2 text-white">Reviews</h2>
                <p className="text-zinc-400">See what our customers have to say about us and our products!</p>
              </div>
              <div className="text-right hidden sm:block">
                <div className="flex items-center gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star
                      key={star}
                      className={`w-6 h-6 ${star <= stats.averageRating ? 'text-indigo-500 fill-indigo-500' : 'text-zinc-800'}`}
                    />
                  ))}
                </div>
                <div className="text-sm text-zinc-500">Average rating: {stats.averageRating}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentReviews.map(review => (
                <div key={review.id} className="bg-[#11141D] border border-zinc-800/50 rounded-xl p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className={`w-3 h-3 ${star <= review.rating ? 'text-indigo-400 fill-indigo-400' : 'text-zinc-800'}`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-zinc-500">{new Date(review.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className={`text-sm mb-4 flex-1 ${review.isAuto ? 'text-zinc-500 italic' : 'text-zinc-300'}`}>
                    {review.text}
                  </p>
                  <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/50">
                    {review.userPhoto ? (
                      <img
                        src={review.userPhoto}
                        alt={review.userName}
                        className="w-6 h-6 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                        {review.userName?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="text-xs font-medium text-zinc-400 truncate flex-1">
                      {review.productName} {review.variantName ? `- ${review.variantName}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 text-center">
              <Link to="/feedback" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors">
                View All Reviews
              </Link>
            </div>
          </div>
        </main>
      </div>

      <footer className="border-t border-zinc-800/50 bg-[#0B0E14] py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col items-center md:items-start gap-4">
              <Link to="/" className="flex items-center gap-2 cursor-pointer">
                <img src="/logo.png" alt="Rumble Hub" className="w-8 h-8 object-contain" />
                <span className="text-xl font-bold tracking-tight text-white">Rumble Hub</span>
              </Link>
              <p className="text-sm text-zinc-500">Copyright &copy; Rumble Hub 2026</p>
              <div className="flex items-center gap-3">
                <a
                  href="https://discord.com/invite/rumblehub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="flex flex-col items-center md:items-end gap-2">
              <h4 className="text-white font-bold mb-2">Navigation</h4>
              <Link to="/" className="text-sm text-zinc-400 hover:text-white transition-colors">Home</Link>
              <Link to="/products" className="text-sm text-zinc-400 hover:text-white transition-colors">Products</Link>
              <Link to="/feedback" className="text-sm text-zinc-400 hover:text-white transition-colors">Feedback</Link>
              <Link to="/terms-of-service" className="text-sm text-zinc-400 hover:text-white transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
