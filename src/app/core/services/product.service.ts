import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TransferState, makeStateKey } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Product, Category } from '../models/product.model';

// ─────────────────────────────────────────────
// TRANSFER STATE KEYS
// makeStateKey<T>() creates a typed key for ng-state JSON transfer.
// Server serializes → client deserializes → no duplicate HTTP request.
// ─────────────────────────────────────────────
const PRODUCTS_KEY = makeStateKey<Product[]>('products');
const PRODUCT_KEY = (slug: string) => makeStateKey<Product>(`product-${slug}`);
const CATEGORIES_KEY = makeStateKey<Category[]>('categories');
const FEATURED_KEY = makeStateKey<Product[]>('featured-products');

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private transferState = inject(TransferState);

  /**
   * CONCEPT: TransferState + HttpClient
   *
   * On server: fetch from API, store in TransferState (serialized to ng-state JSON in HTML).
   * On client: read from TransferState (no HTTP hit), then clear the key.
   *
   * Angular's provideHttpClient(withFetch(), withFetchTransferCache()) does this
   * automatically for simple GET requests — we do it manually here to show the internals.
   */
  getProducts(category?: string): Observable<Product[]> {
    const key = category ? makeStateKey<Product[]>(`products-${category}`) : PRODUCTS_KEY;

    if (this.transferState.hasKey(key)) {
      const cached = this.transferState.get<Product[]>(key, []);
      this.transferState.remove(key); // Consume once — prevents memory leak
      return of(cached);
    }

    const url = category ? `/api/products?category=${category}` : '/api/products';
    return this.http.get<{ products: Product[] }>(url).pipe(
      tap(res => {
        // Server-side: serialize into ng-state for transfer
        this.transferState.set(key, res.products);
      }),
      // unwrap the response envelope
      // Note: in a real app you'd map here, but we keep it simple
    ) as unknown as Observable<Product[]>;
  }

  getProduct(slug: string): Observable<Product> {
    const key = PRODUCT_KEY(slug);

    if (this.transferState.hasKey(key)) {
      const cached = this.transferState.get<Product>(key, null as unknown as Product);
      this.transferState.remove(key);
      return of(cached);
    }

    return this.http.get<Product>(`/api/products/${slug}`).pipe(
      tap(product => this.transferState.set(key, product)),
    );
  }

  getCategories(): Observable<Category[]> {
    if (this.transferState.hasKey(CATEGORIES_KEY)) {
      const cached = this.transferState.get<Category[]>(CATEGORIES_KEY, []);
      this.transferState.remove(CATEGORIES_KEY);
      return of(cached);
    }

    return this.http.get<{ categories: Category[] }>('/api/categories').pipe(
      tap(res => this.transferState.set(CATEGORIES_KEY, res.categories)),
    ) as unknown as Observable<Category[]>;
  }

  getFeatured(): Observable<Product[]> {
    if (this.transferState.hasKey(FEATURED_KEY)) {
      const cached = this.transferState.get<Product[]>(FEATURED_KEY, []);
      this.transferState.remove(FEATURED_KEY);
      return of(cached);
    }

    return this.http.get<{ products: Product[] }>('/api/products?featured=true').pipe(
      tap(res => this.transferState.set(FEATURED_KEY, res.products)),
    ) as unknown as Observable<Product[]>;
  }
}
