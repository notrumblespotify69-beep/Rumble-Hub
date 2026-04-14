import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { createServer as createViteServer } from 'vite';
import path from 'path';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize Stripe lazily to prevent crashes if key is missing
let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set in the environment variables.");
    }
    stripeClient = new Stripe(key, { apiVersion: '2023-10-16' as any });
  }
  return stripeClient;
}

// API Routes for Payments
app.post('/api/payments/create-checkout-session', async (req, res) => {
  try {
    const { amount, method, userId, metadata, successUrl, cancelUrl } = req.body;
    
    if (method === 'stripe') {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: metadata.type === 'topup' ? 'Balance Top Up' : (metadata.productTitle || 'Order Checkout'),
              },
              unit_amount: Math.max(50, Math.round(amount * 100)),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        metadata: { userId, ...metadata },
      });
      res.json({ url: session.url });
    } else {
      res.status(400).json({ error: "Unsupported payment method" });
    }
  } catch (error: any) {
    console.error("Payment Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments/verify-session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      res.json({ success: true, metadata: session.metadata, amount: session.amount_total ? session.amount_total / 100 : 0 });
    } else {
      res.json({ success: false });
    }
  } catch (error: any) {
    console.error("Verify Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments/create-intent', async (req, res) => {
  try {
    const { amount, method, userId, metadata } = req.body;
    
    if (method === 'stripe') {
      const stripe = getStripe();
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.max(50, Math.round(amount * 100)), // Convert to cents, minimum 50 cents
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: { userId, ...metadata }
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } else if (method === 'paypal') {
      // Placeholder for PayPal integration
      res.status(501).json({ error: "PayPal integration requires PAYPAL_CLIENT_ID and PAYPAL_SECRET" });
    } else if (method === 'crypto') {
      // Placeholder for Crypto integration (e.g., Coinbase Commerce)
      res.status(501).json({ error: "Crypto integration requires COINBASE_COMMERCE_KEY" });
    } else {
      res.status(400).json({ error: "Unsupported payment method" });
    }
  } catch (error: any) {
    console.error("Payment Error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
