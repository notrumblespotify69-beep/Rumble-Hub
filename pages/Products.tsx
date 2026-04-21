import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import SEO from '../components/SEO';
import { Link } from 'react-router-dom';
import { ShoppingCart, Search, RefreshCw } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function Products() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [availableKeys, setAvailableKeys] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [keyword, setKeyword] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const prodSnap = await getDocs(collection(db, 'products'));
        setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const keysSnap = await getDocs(collection(db, 'keys'));
        const counts: Record<string, number> = {};
        keysSnap.docs.forEach(d => {
          if (!d.data().isSold) {
            const pid = d.data().productId;
            counts[pid] = (counts[pid] || 0) + 1;
          }
        });
        setAvailableKeys(counts);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredProducts = products.filter(p => {
    if (keyword && !p.title.toLowerCase().includes(keyword.toLowerCase())) return false;
    
    const startingPrice = p.variants && p.variants.length > 0 
      ? Math.min(...p.variants.map((v:any) => v.price))
      : 0;
      
    if (minPrice && startingPrice < parseFloat(minPrice)) return false;
    if (maxPrice && startingPrice > parseFloat(maxPrice)) return false;
    
    return true;
  });

  const handleReset = () => {
    setKeyword('');
    setMinPrice('');
    setMaxPrice('');
  };

  return (
    <div className="w-full">
      <SEO title="Products | Rumble Hub" description="Browse all our premium products and find the right one for you." />
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-32">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 text-indigo-400 text-sm font-medium mb-6 border border-indigo-500/20">
            <Search className="w-4 h-4" /> Browse Our Collection
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-white">
            Our <span className="text-indigo-500">Products</span>
          </h1>
          <p className="text-lg text-zinc-400">Discover our wide range of products.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar */}
          <div className="w-full lg:w-64 shrink-0">
            <div className="bg-[#11141D] border border-zinc-800/50 rounded-2xl p-6 sticky top-24">
              <h3 className="font-bold text-lg mb-6">Filters</h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Keyword</label>
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Price Range</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                      <input 
                        type="number" 
                        placeholder="Min" 
                        value={minPrice}
                        onChange={e => setMinPrice(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <span className="text-zinc-600">-</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                      <input 
                        type="number" 
                        placeholder="Max" 
                        value={maxPrice}
                        onChange={e => setMaxPrice(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800/50 space-y-3">
                  <button 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-medium transition-colors"
                  >
                    Apply Filters
                  </button>
                  <button 
                    onClick={handleReset}
                    className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" /> Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="bg-[#11141D] rounded-2xl aspect-[3/4] animate-pulse border border-zinc-800/50" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-20 bg-[#11141D] border border-zinc-800/50 rounded-2xl">
                <Search className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-zinc-300 mb-2">No products found</h2>
                <p className="text-zinc-500">Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map((game) => {
                  const stock = availableKeys[game.id] || 0;
                  const isOutOfStock = stock === 0;
                  const startingPrice = game.variants && game.variants.length > 0 
                    ? Math.min(...game.variants.map((v:any) => v.price))
                    : 0;
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
                          <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${isOutOfStock ? 'bg-red-500/80 text-white' : 'bg-black/60 text-zinc-300'}`}>
                            {isOutOfStock ? 'Out of Stock' : `${stock} in stock`}
                          </div>
                        </div>
                      </div>
                      <div className="p-5 flex flex-col flex-1">
                        <h3 className="font-bold text-lg mb-1 group-hover:text-indigo-400 transition-colors line-clamp-1">{game.title}</h3>
                        <p className="text-xs text-zinc-500 mb-4 line-clamp-2">{game.description || "Premium access key"}</p>
                        
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
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${
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
          </div>
        </div>
      </main>
    </div>
  );
}
