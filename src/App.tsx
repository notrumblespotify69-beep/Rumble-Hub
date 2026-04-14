import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import Storefront from './pages/Storefront';
import Profile from './pages/Profile';
import ProductPage from './pages/ProductPage';
import Products from './pages/Products';
import Feedback from './pages/Feedback';
import TermsOfService from './pages/TermsOfService';
import RefundPolicy from './pages/RefundPolicy';
import Checkout from './pages/Checkout';

function AffiliateTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('a');
    if (ref) {
      localStorage.setItem('affiliate_ref', JSON.stringify({
        code: ref,
        timestamp: Date.now()
      }));
    }
  }, []);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AffiliateTracker />
        <Routes>
          <Route path="/" element={<Storefront />} />
          <Route path="/products" element={<Products />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/product/:slug" element={<ProductPage />} />
          <Route path="/checkout/cart" element={<Checkout />} />
          <Route path="/checkout/:productId/:variantId" element={<Checkout />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
