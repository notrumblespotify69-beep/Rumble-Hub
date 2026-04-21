import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { Trash2, Plus } from 'lucide-react';
import ImageCropper from '../../components/ImageCropper';
import SEO from '../../components/SEO';

export default function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [variants, setVariants] = useState<{id: string, name: string, price: number}[]>([
    { id: 'v1', name: 'Standard', price: 10 }
  ]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const fetchProducts = async () => {
      const snap = await getDocs(collection(db, 'products'));
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchProducts();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setImage('');
    setVariants([{ id: 'v1', name: 'Standard', price: 10 }]);
  };

  const handleEdit = (p: any) => {
    setEditingId(p.id);
    setTitle(p.title);
    setDescription(p.description);
    setImage(p.image);
    setVariants(p.variants || []);
  };

  const handleSave = async () => {
    if (!title || !image || variants.length === 0) return showToast("Title, image, and at least 1 variant are required.", "error");

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const data = { title, description, image, variants, slug };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'products', editingId), data);
        setProducts(products.map(p => p.id === editingId ? { id: editingId, ...data } : p));
        showToast("Product updated!");
      } else {
        const docRef = await addDoc(collection(db, 'products'), data);
        setProducts([...products, { id: docRef.id, ...data }]);
        showToast("Product created!");
      }
      resetForm();
    } catch (e) {
      console.error(e);
      showToast("Failed to save product.", "error");
    }
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      // Delete associated keys first
      const keysQ = query(collection(db, 'keys'), where('productId', '==', productToDelete.id));
      const keysSnap = await getDocs(keysQ);
      for (const k of keysSnap.docs) {
        await deleteDoc(doc(db, 'keys', k.id));
      }
      
      // Delete the product
      await deleteDoc(doc(db, 'products', productToDelete.id));
      setProducts(products.filter(prod => prod.id !== productToDelete.id));
      showToast("Product deleted successfully.");
    } catch (e) {
      console.error(e);
      showToast("Failed to delete product.", "error");
    }
    setProductToDelete(null);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <SEO title="Manage Products | Rumble Hub Admin" description="Manage your store's products." />
      {toast && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg font-medium shadow-lg z-50 ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Manage Products</h2>
      </div>

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e293b] border border-slate-800 p-6 rounded-xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-2">Delete Product?</h3>
            <p className="text-slate-400 mb-6">Are you sure you want to delete "{productToDelete.title}"? All associated keys will be permanently deleted. This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setProductToDelete(null)} className="px-4 py-2 rounded-lg font-medium text-slate-300 hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={confirmDeleteProduct} className="px-4 py-2 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white transition-colors">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-[#1e293b] border border-slate-800 rounded-xl p-6 mb-8">
        <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Edit Product' : 'Add New Product'}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#0f172a] border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Description (Markdown Supported)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-[#0f172a] border border-slate-800 rounded-lg px-3 py-2 text-white h-32 font-mono text-sm focus:outline-none focus:border-indigo-500" placeholder="**Bold**, *Italic*, # Heading, - List" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Product Image (16:9)</label>
            <ImageCropper 
              currentImage={image} 
              onImageCropped={(url) => setImage(url)} 
              aspectRatio={16/9}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Variants (e.g., 1 Day, 1 Week)</label>
            {variants.map((v, i) => (
              <div key={v.id} className="flex gap-2 mb-2">
                <input 
                  type="text" 
                  value={v.name} 
                  onChange={e => {
                    const newV = [...variants];
                    newV[i].name = e.target.value;
                    setVariants(newV);
                  }}
                  placeholder="Variant Name"
                  className="flex-1 bg-[#0f172a] border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500" 
                />
                <input 
                  type="number" 
                  value={v.price} 
                  onChange={e => {
                    const newV = [...variants];
                    newV[i].price = parseFloat(e.target.value) || 0;
                    setVariants(newV);
                  }}
                  placeholder="Price"
                  className="w-24 bg-[#0f172a] border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500" 
                />
                <button 
                  onClick={() => setVariants(variants.filter((_, idx) => idx !== i))}
                  className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            <button 
              onClick={() => setVariants([...variants, { id: `v${Date.now()}`, name: '', price: 0 }])}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 mt-2"
            >
              <Plus className="w-4 h-4" /> Add Variant
            </button>
          </div>

          <div className="flex gap-2 pt-4">
            <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
              {editingId ? 'Update Product' : 'Create Product'}
            </button>
            {editingId && (
              <button onClick={resetForm} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {products.map(p => (
          <div key={p.id} className="bg-[#1e293b] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={p.image} alt={p.title} className="w-16 h-16 object-cover rounded-lg bg-[#0f172a]" />
              <div>
                <div className="font-bold text-white">{p.title}</div>
                <div className="text-sm text-slate-400">{p.variants?.length || 0} variants</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleEdit(p)} className="text-sm bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors">
                Edit
              </button>
              <button 
                onClick={() => setProductToDelete(p)} 
                className="text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-2 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
