import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  themeColor?: string;
}

export default function SEO({ 
  title = "Rumble Hub | Premium Gaming Access", 
  description = "Elevate your gameplay. Get premium access and unlock your potential with our top-tier gaming products.", 
  image = "/background.png", 
  url,
  type = "website",
  themeColor = "#4f46e5"
}: SEOProps) {
  const fullImageUrl = image.startsWith('/') && window.location.origin 
    ? `${window.location.origin}${image}` 
    : image;

  const currentUrl = url || window.location.href;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {themeColor && <meta name="theme-color" content={themeColor} />}

      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImageUrl} />
      <meta property="og:url" content={currentUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImageUrl} />
      <meta name="twitter:url" content={currentUrl} />
    </Helmet>
  );
}
