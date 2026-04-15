export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  originalPrice?: number;
  description: string;
  shortDescription: string;
  image: string;
  images: string[];
  rating: number;
  reviewCount: number;
  inStock: boolean;
  stockCount: number;
  variants: ProductVariant[];
  specs: Record<string, string>;
  tags: string[];
  featured: boolean;
}

export interface ProductVariant {
  id: string;
  label: string;
  value: string;
  priceModifier: number;
  inStock: boolean;
}

export interface StockLevel {
  productId: string;
  slug: string;
  name: string;
  count: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  lastUpdated: string;
}

export interface Category {
  name: string;
  slug: string;
  label: string;
  productCount: number;
  image: string;
}

export interface Comment {
  id: string;
  author: string;
  avatar: string;
  rating: number;
  body: string;
  date: string;
  helpful: number;
}

export interface CartItem {
  product: Product;
  variantId: string | null;
  quantity: number;
}
